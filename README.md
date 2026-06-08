# Executor

API y worker distribuido para ejecutar bots Playwright mediante BullMQ, Redis y Socket.io.

## Arquitectura

```text
React Dashboard
  -> Express API / Orchestrator
  -> Redis Pub/Sub + BullMQ
  -> Linux Workers
  -> npx playwright test --project=<project>
```

MongoDB guarda el estado de ejecuciones. Redis distribuye jobs y eventos realtime. Cada worker ejecuta Playwright con `spawn`, sin `shell`, y solo permite proyectos incluidos en `ALLOWED_PLAYWRIGHT_PROJECTS`.

## Configuración

```bash
cp .env.example .env
npm install
npm run build
```

Variables clave:

- `MONGODB_URI`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- `PLAYWRIGHT_PROJECT_ROOT_FOLDER`
- `ALLOWED_PLAYWRIGHT_PROJECTS=cigna,aetna,shared`
- `WORKER_CONCURRENCY=3`
- `CORS_ORIGIN=http://localhost:5173` (o lista separada por comas, por ejemplo `http://localhost:5173,https://app.midominio.com`)
- `SOCKET_CORS_ORIGIN` (opcional; si no se define usa `CORS_ORIGIN`)

## Desarrollo

```bash
npm run dev:api
npm run dev:worker
```

Producción:

```bash
npm run build
npm start
npm run start:worker
```

PM2:

```bash
pm2 start ecosystem.config.js
```

## Endpoints

Disponibles en raíz y bajo `/api/v1`:

- `POST /executions`
- `GET /executions`
- `GET /executions/:id`
- `POST /executions/:id/stop`

Ejemplo:

```bash
curl -X POST http://localhost:3000/executions \
  -H 'Content-Type: application/json' \
  -d '{"project":"cigna","workers":3,"retries":2}'
```

## Realtime

Socket.io se monta en el mismo puerto de la API.

Flujo del cliente:

```js
socket.emit("execution:join", { executionId });
socket.on("execution:logs:history", ({ content }) => console.log(content));
socket.on("logs", (event) => console.log(event.message));
socket.on("status", (event) => console.log(event.status));
```

Los workers publican eventos Redis en `logs`, `status` y `metrics`. La API los reenvía a Socket.io y a la sala `execution:<executionId>`.

## Logs

Cada ejecución persiste logs en:

```text
logs/<executionId>.log
```

`GET /executions/:id` devuelve el documento de ejecución junto con el contenido histórico de logs.

## Deploy Webhook

`scripts/deploy.sh` contiene un deploy básico:

```bash
git pull --ff-only
npm ci
npm run build
pm2 reload ecosystem.config.js --update-env
```
