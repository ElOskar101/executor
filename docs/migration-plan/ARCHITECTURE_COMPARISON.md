# Diagramas de Arquitectura y Comparación

## 📐 Comparación Visual: Arquitectura Actual vs. Nueva

### ARQUITECTURA ACTUAL (BullMQ)

```
┌─────────────────────────────────────────────────────────────────┐
│                       CLIENT                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                     POST /executions
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                               │
│  (Express API, Puerto 3000)                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Controller → Service → MongoDB (save execution)         │   │
│  │                  ↓                                      │   │
│  │            queue.add() [BullMQ]                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Redis Queue (BullMQ)
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
         ▼                                         ▼
    ┌─────────────┐          ┌──────────────────────────────┐
    │  WORKER 1   │          │      WORKER N (scaled)       │
    │  (same proc)│    ...   │    (same process)            │
    │ ┌─────────┐ │          │   ┌──────────────────────┐   │
    │ │Playwright│ │          │   │Playwright execution  │   │
    │ │execution │ │          │   │                      │   │
    │ └─────────┘ │          │   └──────────────────────┘   │
    └─────────────┘          └──────────────────────────────┘
         │                              │
         └──────────────┬───────────────┘
                        │
         ┌──────────────┴────────────────┐
         │                               │
         ▼                               ▼
    ┌─────────────┐               ┌─────────────┐
    │   MongoDB   │               │    Redis    │
    │  (Logs, DB) │               │  (Pub/Sub)  │
    └─────────────┘               └─────────────┘
```

### ARQUITECTURA NUEVA (HTTP Worker Independiente)

```
┌─────────────────────────────────────────────────────────────────┐
│                       CLIENT                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                     POST /executions
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                               │
│  (Express API, Puerto 3000)                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Controller → Service → MongoDB (save execution)         │   │
│  │                  ↓                                      │   │
│  │         axios.post(WORKER_URL/api/v1/execute)         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                        HTTP Request
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
         ▼                                         ▼
    ┌─────────────────────┐  ┌──────────────────────────────┐
    │  WORKER 1           │  │      WORKER N (scaled)       │
    │ (Docker, Puerto3001)│  │  (Docker, Puerto 3001)       │
    │ Standalone Service  │  │   Standalone Service         │
    │ ┌────────────────┐  │  │ ┌────────────────────────┐   │
    │ │ HTTP Handler   │  │  │ │ HTTP Handler           │   │
    │ │ /api/v1/execute│  │  │ │ /api/v1/execute        │   │
    │ ├────────────────┤  │  │ ├────────────────────────┤   │
    │ │Playwright Core │  │  │ │ Playwright Core        │   │
    │ │execution logic │  │  │ │ execution logic        │   │
    │ └────────────────┘  │  │ └────────────────────────┘   │
    └─────────────────────┘  └──────────────────────────────┘
         │       ▲                   │       ▲
         │       │                   │       │
    Redis Pub/Sub CONTROL (mismo canal para todos)
         │       │                   │       │
         │       └───────────────────┴───────┘
         │
         └──────────────┬────────┬────────────┐
                        │        │            │
                        ▼        ▼            ▼
                   ┌─────────────────────────────────┐
                   │       Shared Infrastructure     │
                   ├─────────────────────────────────┤
                   │   MongoDB (Logs, Executions)    │
                   │   Redis (Pub/Sub Channels)      │
                   └─────────────────────────────────┘
```

---

## 🔄 Flujo de Datos: Comparación

### ANTES (BullMQ)

```
1. POST /executions
   ├─ Controller: validateRequest()
   ├─ Service: createExecution()
   │  ├─ ExecutionModel.create() → MongoDB
   │  ├─ queue.add('run-playwright-project', jobData)
   │  └─ ExecutionModel.update({jobId}) → MongoDB
   └─ Response: Execution {status: "queued"}

2. BullMQ Worker (listening on Redis queue)
   ├─ job.data → runExecution()
   ├─ handleExecutionJob()
   │  ├─ MongoDB.update({status: "running"})
   │  ├─ startPlaywrightProcess()
   │  ├─ streamLogs() → MongoDB
   │  ├─ Redis.publish() → realtime events
   │  └─ waitForCompletion()
   ├─ MongoDB.update({status: "completed|failed"})
   └─ job.complete()
```

### DESPUÉS (HTTP)

```
1. POST /executions
   ├─ Controller: validateRequest()
   ├─ Service: createExecution()
   │  ├─ ExecutionModel.create() → MongoDB
   │  ├─ WorkerClient.executeJob()
   │  │  └─ axios.post(WORKER_URL/api/v1/execute, jobData)
   │  │     └─ HTTP 202 Accepted: {executionId, jobId}
   │  └─ ExecutionModel.update({runId}) → MongoDB
   └─ Response: Execution {status: "queued"}

2. HTTP Worker Thread (listening on port 3001)
   ├─ POST /api/v1/execute
   ├─ handleExecutionJob() async
   │  ├─ MongoDB.update({status: "running"})
   │  ├─ startPlaywrightProcess()
   │  ├─ streamLogs() → MongoDB
   │  ├─ Redis.publish() → realtime events
   │  └─ waitForCompletion() (background)
   ├─ Response: HTTP 202 {executionId, jobId}
   ├─ MongoDB.update({status: "completed|failed"})
   └─ Redis.publish(final-status)
```

---

## 🔗 Flujo de Control (Stop/Pause/Resume)

Ambas arquitecturas **usan el mismo mecanismo**:

```
┌──────────────────────────────┐
│  POST /executions/{id}/stop  │
│  POST /executions/{id}/pause │
│ POST /executions/{id}/resume │
└──────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  execution.controller.ts             │
│  (stopExecution, pauseExecution...)  │
└──────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│  execution.service.ts                          │
│  publishStopExecution()                         │
│  publishPauseExecution()                        │
│  publishResumeExecution()                       │
└──────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│  realtime.service.ts                           │
│  publishRealtimeEvent(REDIS_CHANNELS.control)  │
└──────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│  Redis Pub/Sub Channel: "control"              │
│  Mensaje: {                                     │
│    type: "stop-execution|pause-execution|...", │
│    executionId: "...",                         │
│    timestamp: "..."                            │
│  }                                             │
└──────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────┐
│  Worker (ANY TRANSPORT)                        │
│  - BullMQ Worker        ←→ subscribed         │
│  - HTTP Worker          ←→ subscribed         │
│                                                 │
│  On message:                                   │
│  stopLocalExecution() / pauseLocalExecution()  │
│  resumeLocalExecution()                        │
│                                                 │
│  Result:                                       │
│  - Send SIGTERM / SIGSTOP / SIGCONT to process│
│  - Update MongoDB status                       │
│  - Publish event back via Redis                │
└──────────────────────────────────────────────────┘
```

**✅ Ventaja**: No necesitas cambiar nada en el control. ¡Funciona igual!

---

## 📊 Matriz de Decisión: Cuándo Usar Cada Arquitectura

| Aspecto | BullMQ | HTTP Worker |
|--------|--------|------------|
| **Escalabilidad** | Buena (con cluster Redis) | Excelente (load balancer) |
| **Aislamiento** | Moderado (mismo proceso) | Excelente (containers sep.) |
| **Debugging** | Difícil (procesos compartidos) | Fácil (logs por container) |
| **Deployment** | Monolito | Microservicios |
| **Configuración** | Simple | Moderada (docker-compose) |
| **Latencia** | Sub-ms | ~5-10ms HTTP |
| **Resource Overhead** | Bajo | Medio (overhead Docker) |
| **Fault Isolation** | Débil (crash afecta cola) | Fuerte (solo afecta worker) |
| **Testing** | Unitarios complejos | Fácil HTTP mocking |
| **Production Ready** | Sí | Sí (con helm charts) |

---

## 🚀 Escenarios de Uso

### Escenario 1: Desarrollo Local Rápido
```bash
npm run dev:worker:bullmq    # BullMQ aún más rápido en local
npm run dev:api
```

### Escenario 2: Staging / QA
```bash
docker-compose up           # HTTP workers en Docker
```

### Escenario 3: Producción en Kubernetes
```yaml
# deployment-orchestrator.yaml
spec:
  replicas: 2
  containers:
    - name: orchestrator
      image: executor:orchestrator:latest

# deployment-worker.yaml
spec:
  replicas: 5
  containers:
    - name: worker
      image: executor:worker:latest
      resources:
        requests:
          memory: "512Mi"
          cpu: "500m"
```

### Escenario 4: High Performance
```bash
# Worker pool con load balancing
# nginx upstream: worker1:3001, worker2:3001, worker3:3001
# WORKER_URL=http://nginx-lb:8080
docker-compose scale worker=10
```

---

## ⚡ Performance Comparativa

### BullMQ (Actual)
```
Latencia de job:     <1ms (redis in-process)
Throughput máximo:   ~1000 jobs/seg (en un redis)
Memory per worker:   ~50-100MB (thread)
Overhead:            Bajo
Escalabilidad:       Horizontal (cluster redis)
```

### HTTP Worker
```
Latencia de job:     5-10ms (TCP overhead)
Throughput máximo:   ~200-500 jobs/seg (por load balancer)
Memory per worker:   ~150-200MB (container + node)
Overhead:            Medio (networking + container)
Escalabilidad:       Excelente (kubernetes HPA)
```

**Nota**: La latencia HTTP es negligible para ejecuciones de Playwright (que duran minutos).

---

## 🛡️ Recuperación ante Fallos

### Escenario: Worker muere a mitad de ejecución

**BullMQ**:
```
Worker crash → job vuelve a queue → retry (configurable)
  ✅ Automático
  ❌ Perderás partial output

HTTP:
```
Worker crash → HTTP timeout en orchestrator → retry logic
  ✅ Manejo explícito
  ❌ Necesita implementación
```

**Solución HTTP recomendada**:
```typescript
// worker-client.service.ts
async executeJobWithRetry(data, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await this.executeJob(data);
        } catch (error) {
            if (i < maxRetries - 1) {
                await sleep(Math.pow(2, i) * 1000); // exponential backoff
                continue;
            }
            throw error;
        }
    }
}
```

---

## 📋 Checklist de Migración Gradual

### Fase 1: Preparación (0-1 semana)
- [ ] Crear worker-client.service.ts
- [ ] Agregar HTTP transport a playwright.worker.ts
- [ ] Crear Dockerfile
- [ ] Tests unitarios del cliente HTTP
- [ ] Ejecutar ambos transportes en paralelo

### Fase 2: Validación (1-2 semanas)
- [ ] Modificar execution.service.ts para intentar HTTP
- [ ] Fallback a BullMQ si falla
- [ ] Monitorear logs (qué transporte se usa)
- [ ] Load testing comparativo
- [ ] Tests en staging

### Fase 3: Cutover (1 semana)
- [ ] Cambiar execution.service.ts solo a HTTP
- [ ] Validar que no hay problemas
- [ ] Documentar nuevo flujo
- [ ] Training del equipo Ops

### Fase 4: Cleanup (Posterior)
- [ ] Remover código BullMQ
- [ ] Remover dependencia bullmq
- [ ] Simplificar configuración
- [ ] Archivar código viejo

---

## ✅ Ventajas Finales del Nuevo Diseño

```
🎯 Separación de Concerns
   - API Layer: Orchestrator (3000)
   - Worker Layer: Distributed Workers (3001+)
   - Cada una con su configuración

🔄 Escalabilidad Independiente
   - Escalar más orchestrators sin afectar workers
   - Escalar workers sin afectar API
   - Load balancing fino

🐳 Containerización Natural
   - Worker = Dockerfile independiente
   - Despliega en Kubernetes sin cambios
   - CI/CD pipeline más simple

🛠️ Operabilidad
   - Logs centralizados por worker
   - Métricas más claras (CPU, memory por worker)
   - Debugging más simple
   - Rolling updates posibles

🔒 Resiliencia
   - Un worker crash no afecta otros
   - Fácil de reemplazar/actualizar
   - Health checks independientes
   - Circuit breakers posibles

📈 Futuro
   - Pronto: Agregar más workers en paralelo
   - Más adelante: Balancing inteligente
   - Eventualmente: Kubernetes HPA automática
```

---


