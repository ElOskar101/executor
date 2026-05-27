# Quick Start: Implementación en 8 Pasos

## 📋 Checklist Visual (Sigue de arriba a abajo)

---

## ✅ PASO 1: Instalar Dependencias

**Tiempo**: 5 minutos

```bash
cd /home/oscar/WebstormProjects/executor

# Agregar axios para HTTP client
npm install axios

# Verificar que Express ya está
npm list express
# Debería mostrar: express@4.21.2
```

**✓ Completado cuando**: `npm list axios` muestra versión instalada

---

## ✅ PASO 2: Crear Worker Client Service

**Tiempo**: 20 minutos
**Archivo**: `src/services/worker-client.service.ts`

```bash
# Crear archivo
touch src/services/worker-client.service.ts
```

**Contenido**: Ver `IMPLEMENTATION_GUIDE.md` Sección 1️⃣
**O copiar desde abajo** (scroll al final de este archivo)

**✓ Completado cuando**: Archivo existe sin errores de compilación

```bash
npm run build  # Debería compilar sin errores
```

---

## ✅ PASO 3: Modificar execution.service.ts

**Tiempo**: 30 minutos
**Archivo**: `src/services/execution.service.ts`

**Cambios**:
1. Agregar import:
```typescript
import { createWorkerClient } from "./worker-client.service";
```

2. Reemplazar líneas 51-54 (queue.add) con:
```typescript
const workerClient = createWorkerClient();
const isHealthy = await workerClient.isHealthy();
if (!isHealthy) {
    throw new Error('Worker service is not available');
}
const jobResult = await workerClient.executeJob(jobData);
```

3. Cambiar línea 57 (log):
```typescript
// Cambiar jobId de: job.id
jobResult.jobId
```

**✓ Completado cuando**: `npm run build` sin errores

---

## ✅ PASO 4: Agregar HTTP Transport al Worker

**Tiempo**: 60 minutos
**Archivo**: `src/workers/playwright.worker.ts`

Antes de `async function main()` (línea 326), agregar:

```typescript
// Ver IMPLEMENTATION_GUIDE.md Sección 3️⃣ para código completo
// ~120 líneas de código new (Express app + endpoints)
```

**✓ Completado cuando**: `npm run build` sin errores

---

## ✅ PASO 5: Actualizar Scripts en package.json

**Tiempo**: 5 minutos
**Archivo**: `package.json`

```json
{
  "scripts": {
    "dev:worker": "TRANSPORT=http nodemon --watch src --ext ts --exec ts-node src/workers/playwright.worker.ts",
    "dev:worker:bullmq": "TRANSPORT=bullmq nodemon --watch src --ext ts --exec ts-node src/workers/playwright.worker.ts",
    "start:worker": "TRANSPORT=http node dist/src/workers/playwright.worker.js",
    "start:worker:bullmq": "TRANSPORT=bullmq node dist/src/workers/playwright.worker.js"
  }
}
```

**✓ Completado cuando**: Cambios aplicados

---

## ✅ PASO 6: Crear Dockerfile

**Tiempo**: 10 minutos
**Archivo**: `Dockerfile`

Ver contenido en `IMPLEMENTATION_GUIDE.md` Sección 5️⃣

**✓ Completado cuando**: Archivo existe

```bash
ls -la Dockerfile  # Debería existir
```

---

## ✅ PASO 7: Crear docker-compose.yml

**Tiempo**: 10 minutos
**Archivo**: `docker-compose.yml`

Ver contenido en `IMPLEMENTATION_GUIDE.md` Sección 7️⃣

**✓ Completado cuando**: Archivo existe

```bash
ls -la docker-compose.yml  # Debería existir
```

---

## ✅ PASO 8: Crear .dockerignore

**Tiempo**: 5 minutos
**Archivo**: `.dockerignore`

Ver contenido en `IMPLEMENTATION_GUIDE.md` Sección 6️⃣

**✓ Completado cuando**: Archivo existe

```bash
ls -la .dockerignore  # Debería existir
```

---

## 🧪 Testing Local (Docker Compose)

**Tiempo**: 20 minutos

```bash
# Compilar TypeScript
npm run build

# Build Docker images
docker-compose build

# Iniciar servicios
docker-compose up -d

# Esperar a que inicien (30 segundos)
sleep 30

# Ver logs
docker-compose logs -f orchestrator
docker-compose logs -f worker
```

### Testing de Health Check

```bash
# Worker health
curl http://localhost:3001/api/v1/health

# Respuesta esperada:
# {
#   "status": "ok",
#   "workerId": "...",
#   "activeExecutions": 0,
#   "timestamp": "..."
# }
```

---

## 🚀 Testing de Creación de Ejecución

```bash
# Crear ejecución (orchestrator envia al worker via HTTP)
curl -X POST http://localhost:3000/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{
    "project": "elg-regression",
    "createdBy": "test-user",
    "client": "test-client",
    "meta": {
      "bot": {
        "botName": "test-bot",
        "targetUrl": "https://example.com",
        "username": "user",
        "password": "pass",
        "otherInformation": {}
      },
      "patients": [],
      "config": {},
      "rv": {}
    }
  }'

# Copiar el _id de la respuesta
# Listar ejecuciones
curl http://localhost:3000/api/v1/executions

# Ver detalles de ejecución
curl http://localhost:3000/api/v1/executions/{_id}
```

### Esperado:
```javascript
{
  "_id": "...",
  "status": "queued",        // ← Importante
  "playwrightProject": "elg-regression",
  "createdBy": "test-user",
  // ... otros campos
}
```

---

## 🛑 Detener Todo

```bash
docker-compose down

# O con volúmenes
docker-compose down -v
```

---

## 🔄 Workflow de Desarrollo

### Opción A: Con Docker Compose (Recomendado)
```bash
# Terminal 1
docker-compose up

# Terminal 2 - Haz cambios en código
# Cambios se reflejan automáticamente
```

### Opción B: Manual (Para desarrollo rápido)
```bash
# Terminal 1 - MongoDB
docker run -d -p 27017:27017 mongo:7

# Terminal 2 - Redis
docker run -d -p 6379:6379 redis:7-alpine

# Terminal 3 - Worker
TRANSPORT=http npm run dev:worker

# Terminal 4 - API
npm run dev:api

# Ve cambios al guardar (nodemon)
```

---

## ⚠️ Troubleshooting

### Error: "Worker service is not available"
```bash
# Verificar que worker está corriendo
curl http://localhost:3001/api/v1/health

# Si no responde, revisar logs
docker-compose logs worker
```

### Error: "Cannot find module 'axios'"
```bash
# Instalar dependencias
npm install
npm run build
```

### Puerto 3001 ya en uso
```bash
# Cambiar puerto en docker-compose.yml
worker:
  ports:
    - "3002:3001"  # ← Cambiar a 3002

# Y actualizar WORKER_URL
orchestrator:
  environment:
    WORKER_URL: http://worker:3002
```

### MongoDB no conecta
```bash
# Verificar MongoDB está corriendo
docker-compose logs mongodb

# Si no está, iniciar
docker-compose up mongodb -d
```

---

## 📊 Variables de Entorno Importantes

### Para Orchestrator (`.env`)
```env
WORKER_URL=http://localhost:3001
WORKER_TIMEOUT=10000
```

### Para Worker
```env
TRANSPORT=http
WORKER_PORT=3001
WORKER_CONCURRENCY=3
```

---

## 🎯 Verificación Final

✅ Todos estos comandos deben funcionar:

```bash
# 1. Compilar
npm run build

# 2. Health check
curl http://localhost:3001/api/v1/health

# 3. Crear execution
curl -X POST http://localhost:3000/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{"project":"elg-regression","meta":{"bot":{"botName":"test",...},...}}'

# 4. Listar executions
curl http://localhost:3000/api/v1/executions
```

Si todo funciona ✅, ¡Felicidades! 🎉

---

## 📚 Documentos Relacionados (Lee en este orden)

1. **SUMMARY_EXECUTIVE.md** - Overview rápido (30 min)
2. **REFACTORING_ANALYSIS.md** - Análisis profundo (45 min)
3. **ARCHITECTURE_COMPARISON.md** - Diagramas (30 min)
4. **IMPLEMENTATION_GUIDE.md** - Código detallado (referencia)
5. **Este archivo** - Quick start práctico (15 min)

---

## 🆘 Ayuda Rápida

Copiar en `src/services/worker-client.service.ts`:

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

## ✨ ¡Listo!

Has completado la implementación de **Worker HTTP Independiente**.

**Próximos pasos**:
- [ ] Testing exhaustivo en staging
- [ ] Load testing con múltiples workers
- [ ] Setup de monitoring
- [ ] Documentar runbook de operaciones
- [ ] Deploy a producción

¿Necesitas ayuda en algún paso? 👈


