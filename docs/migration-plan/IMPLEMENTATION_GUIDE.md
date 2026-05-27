# Guía de Implementación: Worker HTTP Independiente

## 1️⃣ PASO 1: Crear Worker Client Service

**Archivo**: `src/services/worker-client.service.ts`

Este servicio actuará como cliente HTTP que se comunica con el Worker.

```typescript
import axios, { AxiosInstance } from 'axios';
import { ExecutionJobData } from '../types/execution.type';
import { createLogger } from '../libs/logger';

const logger = createLogger('worker-client');

export interface WorkerClient {
  executeJob(data: ExecutionJobData): Promise<{ executionId: string; jobId: string }>;
  isHealthy(): Promise<boolean>;
}

class HttpWorkerClient implements WorkerClient {
  private client: AxiosInstance;
  private workerUrl: string;
  private timeout: number;

  constructor(workerUrl: string, timeout: number = 10000) {
    this.workerUrl = workerUrl;
    this.timeout = timeout;
    this.client = axios.create({
      baseURL: workerUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async executeJob(data: ExecutionJobData): Promise<{ executionId: string; jobId: string }> {
    try {
      const response = await this.client.post('/api/v1/execute', data);
      logger.info(`Job enqueued: executionId=${data.executionId}`);
      return {
        executionId: data.executionId,
        jobId: response.data.jobId || data.executionId,
      };
    } catch (error) {
      logger.error(`Failed to send job to worker: ${error}`);
      throw new Error(`Worker unavailable: ${error}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/v1/health');
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export function createWorkerClient(
  workerUrl: string = process.env.WORKER_URL || 'http://localhost:3001',
  timeout: number = Number(process.env.WORKER_TIMEOUT || 10000)
): WorkerClient {
  return new HttpWorkerClient(workerUrl, timeout);
}
```

---

## 2️⃣ PASO 2: Modificar execution.service.ts

**Cambio**: Reemplazar `queue.add()` con llamada HTTP

```typescript
// ANTES (línea 51-54):
const queue = getExecutionQueue();
const job = await queue.add("run-playwright-project", jobData, {
    jobId: execution.id,
});

// DESPUÉS:
const workerClient = createWorkerClient();

// Verificar salud del worker
const isHealthy = await workerClient.isHealthy();
if (!isHealthy) {
    throw new Error('Worker service is not available');
}

// Enviar job al worker
const jobResult = await workerClient.executeJob(jobData);

logger.info(
    `Job sent to worker: executionId=${jobResult.executionId} jobId=${jobResult.jobId}`,
);
```

**Archivo completo modificado**:

```typescript
import { ExecutionJobData, ExecutionStatus } from "../types/execution.type";
import { getPlaywrightRootFolder, assertAllowedPlaywrightProject } from "../configs/playwright.config";
import { ExecutionModel } from "../models/execution.model";
import { CreateExecutionRequest } from "../types/execution.type";
import { readExecutionLog } from "../adapters/mongo.adapter";
import { publishPauseExecution, publishResumeExecution, publishStopExecution } from "./realtime.service";
import { createLogger } from "../libs/logger";
import { createWorkerClient } from "./worker-client.service";

const DEFAULT_WORKERS = 1;
const DEFAULT_RETRIES = 0;
const logger = createLogger("system");

function normalizePositiveInteger(value: unknown, fallback: number, max: number) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return fallback;
    return Math.max(1, Math.min(Math.trunc(numberValue), max));
}

function normalizeRetries(value: unknown) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return DEFAULT_RETRIES;
    return Math.max(0, Math.min(Math.trunc(numberValue), Number(process.env.MAX_PLAYWRIGHT_RETRIES || 3)));
}

export async function createExecution(payload: CreateExecutionRequest) {
    assertAllowedPlaywrightProject(payload.project);

    const playwrightFolder = getPlaywrightRootFolder();
    const execution = await ExecutionModel.create({
        createdBy: payload.createdBy,
        playwrightProject: payload.project,
        status: "queued" satisfies ExecutionStatus,
        client: payload.client,
        clinic: payload.clinic,
        execution: payload.execution,
        botName: payload.botName,
        meta: payload.meta
    });

    const jobData: ExecutionJobData = {
        executionId: execution.id,
        project: payload.project,
        workers: normalizePositiveInteger(payload.meta.workers, DEFAULT_WORKERS, Number(process.env.MAX_PLAYWRIGHT_WORKERS || 10)),
        retries: normalizeRetries(payload.meta.retries),
        headed: Boolean(payload.meta.headed),
        playwrightFolder,
    };

    // 🔄 NUEVO: Llamar al Worker via HTTP
    const workerClient = createWorkerClient();
    const isHealthy = await workerClient.isHealthy();
    if (!isHealthy) {
        // Marcar como failed si worker no está disponible
        await ExecutionModel.findByIdAndUpdate(execution.id, { status: 'failed' });
        throw new Error('Worker service is not available. Execution marked as failed.');
    }

    const jobResult = await workerClient.executeJob(jobData);

    logger.info(
        \`Job sent to worker: executionId=\${jobResult.executionId} jobId=\${jobResult.jobId} project=\${payload.project} workers=\${jobData.workers} retries=\${jobData.retries} headed=\${jobData.headed}\`,
    );

    const updatedExecution = await ExecutionModel.findByIdAndUpdate(
        execution.id,
        {
            runId: jobResult.jobId,
            playwrightExecutionId: jobResult.jobId,
        },
        { new: true },
    ).lean();

    return updatedExecution;
}

export async function listExecutions() {
    return ExecutionModel.find({}).sort({ createdAt: -1 }).lean();
}

export async function getExecutionById(id: string) {
    return ExecutionModel.findById(id).lean();
}

export async function getExecutionWithLogs(id: string) {
    const execution = await getExecutionById(id);
    if (!execution) return null;

    return {
        ...execution,
        logs: await readExecutionLog(id),
    };
}

// ... resto del código igual (pauseExecutionById, resumeExecutionById, stopExecutionById)
```

---

## 3️⃣ PASO 3: Agregar Transporte HTTP al Worker

**Archivo**: `src/workers/playwright.worker.ts` (agregar al final, antes de `main()`)

```typescript
// ---------------------------------------------------------------------------
// HTTP Transport — alternative to BullMQ
// Add this section before the main() function
// ---------------------------------------------------------------------------

import express, { Express, Request, Response } from 'express';

async function startHttpTransport() {
    const app: Express = express();
    const port = Number(process.env.WORKER_PORT || 3001);

    app.use(express.json());

    // Health check endpoint
    app.get('/api/v1/health', (req: Request, res: Response) => {
        res.status(200).json({
            status: 'ok',
            workerId,
            activeExecutions: activeProcesses.size,
            timestamp: new Date().toISOString(),
        });
    });

    // Execute job endpoint
    app.post('/api/v1/execute', async (req: Request, res: Response) => {
        try {
            const data = req.body as ExecutionJobData & { jobId?: string };

            if (!data.executionId || !data.project) {
                return res.status(400).json({
                    error: 'Missing required fields: executionId, project',
                });
            }

            const jobId = data.jobId || String(Date.now());

            // Start execution asynchronously (don't wait for completion)
            const executionPromise = handleExecutionJob({
                ...data,
                jobId,
            }).catch((error) => {
                console.error('[WORKER] Execution error:', error);
            });

            // Return immediately with jobId
            res.status(202).json({
                executionId: data.executionId,
                jobId,
                message: 'Execution started',
            });

            // Don't await - let it run in background
            void executionPromise;
        } catch (error) {
            console.error('[WORKER] Request error:', error);
            res.status(500).json({
                error: 'Internal server error',
            });
        }
    });

    // Stop execution endpoint
    app.post('/api/v1/execute/:executionId/stop', async (req: Request, res: Response) => {
        const { executionId } = req.params;
        const success = await stopLocalExecution(executionId);

        if (!success) {
            return res.status(404).json({
                error: 'Execution not found or already finished',
            });
        }

        res.status(200).json({
            executionId,
            message: 'Stop signal sent',
        });
    });

    // Pause execution endpoint
    app.post('/api/v1/execute/:executionId/pause', async (req: Request, res: Response) => {
        const { executionId } = req.params;
        const success = await pauseLocalExecution(executionId);

        if (!success) {
            return res.status(404).json({
                error: 'Execution not paused (not found or already paused)',
            });
        }

        res.status(200).json({
            executionId,
            message: 'Pause signal sent',
        });
    });

    // Resume execution endpoint
    app.post('/api/v1/execute/:executionId/resume', async (req: Request, res: Response) => {
        const { executionId } = req.params;
        const success = await resumeLocalExecution(executionId);

        if (!success) {
            return res.status(404).json({
                error: 'Execution not resumed (not found or not paused)',
            });
        }

        res.status(200).json({
            executionId,
            message: 'Resume signal sent',
        });
    });

    const server = app.listen(port, () => {
        console.info(`[WORKER] HTTP server listening on port ${port}`);
    });

    return {
        close: async () => {
            server.close();
        },
    };
}

// ---------------------------------------------------------------------------
// Entry point — UPDATED to support both transportes
// ---------------------------------------------------------------------------

async function main() {
    const infra = await bootstrapInfrastructure();
    const transport = process.env.TRANSPORT === 'bullmq'
        ? await startBullMQTransport()
        : await startHttpTransport();

    const shutdown = async (signal: string) => {
        console.info(`[WORKER] Received ${signal}. Stopping active executions...`);
        await Promise.all([...activeProcesses.keys()].map(stopLocalExecution));
        await transport.close();
        await infra.disconnect();
        process.exit(0);
    };

    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch((error) => {
    console.error('[WORKER] Failed to start', error);
    process.exit(1);
});
```

---

## 4️⃣ PASO 4: Actualizar package.json Scripts

```json
{
  "scripts": {
    "dev": "npm run dev:api",
    "dev:api": "nodemon --watch src --ext ts --exec ts-node src/server.ts",
    "dev:worker": "TRANSPORT=http nodemon --watch src --ext ts --exec ts-node src/workers/playwright.worker.ts",
    "dev:worker:bullmq": "TRANSPORT=bullmq nodemon --watch src --ext ts --exec ts-node src/workers/playwright.worker.ts",
    "build": "tsc",
    "start": "node dist/src/server.js",
    "start:worker": "TRANSPORT=http node dist/src/workers/playwright.worker.js",
    "start:worker:bullmq": "TRANSPORT=bullmq node dist/src/workers/playwright.worker.js",
    "test": "npm run build && node --test dist/test/**/*.test.js"
  },
  "dependencies": {
    // ... existing
    "axios": "^1.6.0",
    "express": "^4.21.2"  // Already exists
  }
}
```

---

## 5️⃣ PASO 5: Crear Dockerfile

**Archivo**: `Dockerfile`

```dockerfile
# Multi-stage build

# Stage 1: Builder
FROM node:18-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY ../../tsconfig.json ./
COPY ../../src ./src

RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine

WORKDIR /app

# Install dumb-init for signal handling
RUN apk add --no-cache dumb-init

COPY package*.json ./
RUN npm ci --only=production

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Copy Playwright config if needed
COPY ../../src/configs ./src/configs
COPY ../../src/types ./src/types

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/api/v1/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start worker with HTTP transport
CMD ["node", "dist/src/workers/playwright.worker.js"]

ENV TRANSPORT=http
ENV WORKER_PORT=3001
ENV NODE_ENV=production
```

---

## 6️⃣ PASO 6: Crear .dockerignore

**Archivo**: `.dockerignore`

```
node_modules
npm-debug.log
.git
.gitignore
README.md
REFACTORING_ANALYSIS.md
DEPLOYMENT.md
.env.example
.vscode
.idea
dist
test
reports
docs
*.md
.DS_Store
```

---

## 7️⃣ PASO 7: Crear docker-compose.yml

**Archivo**: `docker-compose.yml`

```yaml
version: '3.9'

services:
  mongodb:
    image: mongo:7-alpine
    container_name: executor-mongodb
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: password
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: executor-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  orchestrator:
    build:
      context: .
      dockerfile: Dockerfile.orchestrator
    container_name: executor-api
    ports:
      - "3000:3000"
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://admin:password@mongodb:27017/executor
      REDIS_HOST: redis
      REDIS_PORT: 6379
      WORKER_URL: http://worker:3001
      WORKER_TIMEOUT: 10000
    restart: unless-stopped

  worker:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: executor-worker
    ports:
      - "3001:3001"
    depends_on:
      mongodb:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://admin:password@mongodb:27017/executor
      REDIS_HOST: redis
      REDIS_PORT: 6379
      TRANSPORT: http
      WORKER_PORT: 3001
      WORKER_CONCURRENCY: 3
      PLAYWRIGHT_PROJECT_FOLDER: /app/projects/playwright
    volumes:
      # Montar el proyecto Playwright (ajusta según tu estructura)
      - ./playwright-projects:/app/projects/playwright
    restart: unless-stopped
    scale: 3  # Nota: Solo con docker-compose, para prod usar k8s

volumes:
  mongodb_data:
  redis_data:
```

---

## 8️⃣ PASO 8: Variables de Entorno (.env)

```env
# ORCHESTRATOR (.env)
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://admin:password@localhost:27017/executor
MONGODB_DB_NAME=executor

REDIS_HOST=localhost
REDIS_PORT=6379

# NEW: Worker Configuration
WORKER_URL=http://localhost:3001
WORKER_TIMEOUT=10000
WORKER_HEALTH_CHECK_INTERVAL=30000

# Playwright
PLAYWRIGHT_PROJECT_FOLDER=/path/to/playwright/projects

# WORKER (.env.worker)
NODE_ENV=development
PORT=3001
MONGODB_URI=mongodb://admin:password@localhost:27017/executor
MONGODB_DB_NAME=executor

REDIS_HOST=localhost
REDIS_PORT=6379

# Worker specific
TRANSPORT=http
WORKER_PORT=3001
WORKER_ID=worker-1
WORKER_CONCURRENCY=3

# Playwright
PLAYWRIGHT_PROJECT_FOLDER=/path/to/playwright/projects
MAX_PLAYWRIGHT_WORKERS=10
MAX_PLAYWRIGHT_RETRIES=3
STOP_KILL_GRACE_MS=10000
```

---

## 🧪 Testing Local

### Opción A: Con Docker Compose (Recomendado)

```bash
# Build images
docker-compose build

# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f worker
docker-compose logs -f orchestrator

# Stop all
docker-compose down
```

### Opción B: Manual (para desarrollo)

Terminal 1 - MongoDB:
```bash
docker run -d -p 27017:27017 mongo:7
```

Terminal 2 - Redis:
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

Terminal 3 - Worker:
```bash
TRANSPORT=http npm run dev:worker
```

Terminal 4 - Orchestrator:
```bash
npm run dev:api
```

---

## 📝 Testing la API

```bash
# Health check del Worker
curl http://localhost:3001/api/v1/health

# Crear ejecución (orchestrator envia al worker)
curl -X POST http://localhost:3000/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{
    "project": "elg-regression",
    "meta": {
      "bot": {
        "botName": "test-bot",
        "targetUrl": "https://example.com",
        "username": "user",
        "password": "pass"
      },
      "patients": [],
      "config": {},
      "rv": {}
    }
  }'

# Listar ejecuciones
curl http://localhost:3000/api/v1/executions
```

---


