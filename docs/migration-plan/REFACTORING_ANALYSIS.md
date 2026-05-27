# Análisis: Refactorización a Worker Independiente con HTTP

## 📊 Estado Actual de la Arquitectura

### Flujo Actual (BullMQ-based):
```
POST /executions
    ↓
Controller (createExecution)
    ↓
ExecutionService (createExecution)
    ├─ Crea Execution en MongoDB (status: "queued")
    ├─ Entra en BullMQ Queue
    └─ Retorna execution
    
BullMQ Worker (bullmq Worker)
    ├─ Consume jobs de Redis Queue
    ├─ Ejecuta Playwright proyecto
    ├─ Publica eventos en Redis Pub/Sub
    ├─ Persiste logs en MongoDB
    └─ Actualiza status en MongoDB
```

---

## 🎯 Nuevo Flujo Deseado (HTTP-based con Worker Standalone)

```
POST /executions (Orchestrator Service)
    ↓
Controller (createExecution)
    ↓
ExecutionService (createExecution)
    ├─ Crea Execution en MongoDB (status: "queued")
    ├─ HTTP POST → Worker Service (http://<worker>:PORT/api/v1/execute)
    └─ Retorna execution
    
HTTP Handler (Worker Service)
    └─ Recibe request HTTP
    
Core Execution Logic (Transportless)
    ├─ Ejecuta Playwright proyecto
    ├─ Publica eventos en Redis Pub/Sub (mismo canal)
    ├─ Persiste logs en MongoDB
    └─ Actualiza status en MongoDB
    
Docker Container (Worker)
    └─ Instancia aislada con su propia conexión a Redis/MongoDB
```

---

## 🔑 Puntos Clave de Implementación

### 1. **Separación de Lógica de Transporte** ✅ (YA EXISTE)
Tu código está bien diseñado en este aspecto:

```typescript
// TRANSPORTLESS CORE LOGIC (lines 20-235 en playwright.worker.ts)
export async function runExecution(data: ExecutionJobData & { jobId?: string }): Promise<void>
export async function stopExecution(executionId: string): Promise<boolean>
export async function pauseLocalExecution(executionId: string)
export async function resumeLocalExecution(executionId: string)
export async function bootstrapInfrastructure()

// BULLMQ TRANSPORT (lines 256-320 en playwright.worker.ts)
async function startBullMQTransport()
```

**Punto clave**: La lógica core está desacoplada del transporte. Solo necesitas agregar un transporte HTTP.

---

### 2. **Arquitectura de Comunicación Requerida**

#### A. Worker Service (Nueva)
```
Puerto: 3001 (configurable)

Endpoints:
  POST   /api/v1/execute          → Inicia ejecución
  POST   /api/v1/execute/:id/stop → Detiene ejecución
  POST   /api/v1/execute/:id/pause → Pausa ejecución
  POST   /api/v1/execute/:id/resume → Reanuda ejecución
  GET    /api/v1/health           → Health check
```

#### B. Orchestrator Service (Existente - cambios mínimos)
```
Puerto: 3000 (existente)

Cambios en execution.service.ts:
  - En lugar de: queue.add("run-playwright-project", jobData)
  - Ahora: axios.post(`${WORKER_URL}/api/v1/execute`, jobData)
  
Mantiene mismo control via Redis Pub/Sub para stop/pause/resume
```

---

### 3. **Cambios Requeridos Identificados**

#### **Archivos a Modificar:**

| Archivo | Cambio | Justificación |
|---------|--------|---------------|
| `package.json` | Agregar scripts para Worker HTTP | Nuevo entry point |
| `src/workers/playwright.worker.ts` | Agregar transporte HTTP | New HTTP transport layer |
| `src/services/execution.service.ts` | Cambiar de queue.add() a HTTP call | Orquestar via HTTP |
| `.env` / config | WORKER_URL, WORKER_PORT, WORKER_CONCURRENCY | Configuración nueva |
| Docker | Crear Dockerfile | Contenerizar Worker |
| `docker-compose.yml` | Agregar servicios | Compose orchestration |

#### **Archivos a Crear:**

| Archivo | Propósito |
|---------|----------|
| `src/services/worker-client.service.ts` | HTTP client para comunicarse con Worker |
| `src/routes/worker.route.ts` | Rutas HTTP del Worker (solo si server.ts corre el worker) |
| `Dockerfile` | Imagen Docker del Worker |
| `docker-compose.yml` | Orquestar Orchestrator + Worker |
| `.dockerignore` | Optimizar imagen |
| `docs/DEPLOYMENT.md` | Guía de deployment |

---

## 🏗️ Estrategia de Implementación (Recomendada)

### **Fase 1: Preparación (Sin romper BullMQ actual)**
1. ✅ Agregar transporte HTTP al worker sin remover BullMQ
2. ✅ Ambos transportes pueden coexistir inicialmente
3. ✅ Crear `worker-client.service.ts` con fallback a BullMQ

### **Fase 2: Migración Gradual**
1. Cambiar execution.service.ts para intentar HTTP primero
2. Si HTTP falla, fallback a BullMQ
3. Monitorear logs para ver qué transporte se usa

### **Fase 3: Cleanup**
1. Remover código BullMQ una vez HTTP sea estable
2. Remover dependencia bullmq del package.json
3. Simplificar configuración

---

## 📦 Dependencias Recomendadas a Agregar

```json
{
  "axios": "^1.6.0",              // HTTP client para orquestar
  "dotenv-expand": "^10.0.0",     // Para variables de env mejor
  "@types/axios": "^0.14.0"       // Types para axios
}
```

Dependencias para Dockerfile (ya tenidas):
- Node.js 18+ (imagen base)
- npm/yarn

---

## 🔐 Consideraciones de Seguridad

1. **Validación HTTP**: Agregar JWT/API Key entre Orchestrator y Worker
2. **Rate Limiting**: Limitar requests HTTP al Worker
3. **Health Checks**: Verificar que Worker está disponible antes de enviar
4. **Retry Logic**: Reintentos con backoff exponencial
5. **Timeouts**: Configurar timeouts para prevenir hanging requests

---

## 🚀 Flujo de Señales (Stop/Pause/Resume)

Esto puede MANTENER Redis Pub/Sub:

```
orchestrator → Redis Pub/Sub CONTROL CHANNEL → Worker
            ↓
        (mantiene igual)
```

**Ventaja**: No necesitas cambiar la lógica de control, solo el transporte de ejecución.

---

## 💾 Datos que Compartirán (MongoDB + Redis)

```
MongoDB (Compartida):
- Collection Executions (actualizaciones de status)
- Logs de ejecución

Redis (Pub/Sub):
- Canal de control (stop/pause/resume)
- Canal de status en tiempo real
- Canal de logs en tiempo real
```

**Nota**: Ambos servicios deben apuntar a MISMO MongoDB y Redis.

---

## 📊 Topología Recomendada (Docker Compose)

```yaml
services:
  orchestrator:
    image: executor:orchestrator
    ports: ["3000:3000"]
    depends_on: [mongodb, redis]
    environment:
      WORKER_URL: http://worker:3001
  
  worker:
    image: executor:worker
    ports: ["3001:3001"]
    depends_on: [mongodb, redis]
    environment:
      WORKER_CONCURRENCY: 3
      WORKER_PORT: 3001
  
  mongodb:
    image: mongo:7
    volumes: [mongo_data:/data/db]
  
  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]

volumes:
  mongo_data:
  redis_data:
```

---

## ⚠️ Riesgos Potenciales y Mitigación

| Riesgo | Mitigación |
|--------|-----------|
| Worker no disponible | Health check + retry logic + fallback |
| Doble procesamiento | Idempotency keys en MongoDB |
| Network latency | Async operations, timeouts configurables |
| Sincronización estado | Redis Pub/Sub se mantiene como single source of truth |
| Scaling múltiples workers | API Gateway con load balancing |

---

## ✨ Ventajas del Nuevo Diseño

```
✅ Escalabilidad: Múltiples workers independientes
✅ Aislamiento: Cada worker es un proceso independiente
✅ Dockerización: Fácil deployment en Kubernetes/Docker Swarm
✅ Independencia: Worker funciona sin Orchestrator para pruebas
✅ Flexibilidad: Worker puede reemplazarse sin afectar Orchestrator
✅ Debugging: Logs y estados más aislados por worker
✅ Recovery: Re-start de worker sin afectar cola global
```

---

## 📋 Checklist de Implementación

- [ ] Agregar worker-client.service.ts con HTTP client
- [ ] Modificar execution.service.ts para usar HTTP
- [ ] Crear rutas HTTP del Worker (POST /execute, etc.)
- [ ] Agregar transporte HTTP a playwright.worker.ts
- [ ] Crear Dockerfile multi-stage optimizado
- [ ] Crear docker-compose.yml con servicios
- [ ] Agregar health checks y retry logic
- [ ] Documentar variables de entorno
- [ ] Escribir tests de integración HTTP
- [ ] Crear guía de deployment
- [ ] Setup monitoring (logs centralizados)
- [ ] Scenario: qué pasa si Worker muere midway?


