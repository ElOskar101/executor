# Executor Project Structure Guide

This document explains how the backend is organized so frontend teams can build dashboards with a clear understanding of jobs, queueing, persistence, logs, and realtime events.

## 1) What this project does

`executor` is a distributed Playwright execution service.

- The **API** receives execution requests.
- Requests are stored in **MongoDB** and enqueued in **BullMQ**.
- A separate **worker** process consumes jobs and runs `npx playwright test`.
- The worker streams logs/events via **Redis Pub/Sub**.
- The API relays realtime events to clients through **Socket.io**.
- Execution logs are persisted on disk in the `logs/` folder.

## 2) High-level architecture

```text
Frontend Dashboard
   |
   | HTTP (create/list/get/stop executions)
   v
Express API (src/server.ts + src/app.ts)
   |\
   | \-- MongoDB (Execution documents)
   |
   \-- BullMQ Queue in Redis (playwright-executions)
            |
            v
      Worker (src/workers/playwright.worker.ts)
            |
            | spawn npx playwright test
            |
            +--> logs/<executionId>.log
            +--> Redis Pub/Sub channels (logs, status, metrics, control)

API Socket Server subscribes Redis channels and emits to clients via Socket.io
```

## 3) Main runtime components

### API process

- Entry: `src/server.ts`
- Express app: `src/app.ts`
- Routes registration: `src/routes/index.ts`
- Responsibilities:
  - expose REST endpoints
  - create execution records and enqueue jobs
  - expose execution history/details
  - publish stop signals
  - host Socket.io server for realtime dashboard updates

### Worker process

- Entry: `src/workers/playwright.worker.ts`
- Responsibilities:
  - consume queue jobs
  - run Playwright subprocesses safely (`spawn`, no shell)
  - update Mongo execution status transitions
  - write logs to `logs/<executionId>.log`
  - publish realtime status/log events to Redis channels
  - handle stop control messages

### Data stores and messaging

- MongoDB:
  - connection: `src/connection.db.ts`
  - model: `src/models/execution.model.ts`
- Redis:
  - queue + events: `src/queues/execution.queue.ts`
  - pub/sub: `src/configs/redis.config.ts`, `src/services/realtime.service.ts`

## 4) Folder map (important for frontend integration)

```text
src/
  app.ts                         # Express middleware stack, Swagger, route mounting
  server.ts                      # API bootstrap + graceful shutdown
  connection.db.ts               # Mongo connection helper

  configs/
    redis.config.ts              # Redis options, queue name, pub/sub channels
    playwright.config.ts         # Allowed projects + Playwright root folder
    paths.config.ts              # logs folder/file path helpers

  controllers/
    execution.controller.ts      # Main REST handlers for executions
    command.controller.ts        # Compatibility command endpoints

  services/
    execution.service.ts         # Queue orchestration + execution CRUD helpers
    log.service.ts               # log stream/create/read helpers
    realtime.service.ts          # Redis publish helpers (logs/status/control)
    socket-server.service.ts     # Socket.io server + Redis subscriptions
    socket-sync.service.ts       # Optional external sync service client

  queues/
    execution.queue.ts           # BullMQ queue + QueueEvents singletons

  workers/
    playwright.worker.ts         # BullMQ worker logic and child process handling

  libs/
    command-executor.ts          # Safe spawn wrapper for Playwright commands
    res-handler.ts               # Standard HTTP response helpers

  models/
    execution.model.ts           # Mongoose schema for execution records

  types/
    execution.type.ts            # execution/job payload contracts
    realtime.type.ts             # realtime event payload contracts
```

## 5) Job queue flow (BullMQ + Redis)

### Queue

- Queue name: `EXECUTION_QUEUE_NAME` (default: `playwright-executions`)
- Producer: API via `src/services/execution.service.ts`
- Consumer: worker via `src/workers/playwright.worker.ts`

### Job types

1. `run-playwright-project`
   - payload (`ExecutionJobData`):
     - `executionId`
     - `project`
     - `workers`
     - `retries`
     - `headed`
     - `playwrightFolder`
2. `stop-playwright-project`
   - used to stop active local execution in workers

### Default queue behavior

Configured in `src/queues/execution.queue.ts`:

- attempts: `EXECUTION_JOB_ATTEMPTS` (default `3`)
- backoff: exponential with `EXECUTION_JOB_BACKOFF_MS` (default `5000` ms)
- completed/failed cleanup retention (`removeOnComplete`, `removeOnFail`)

## 6) Execution lifecycle (state model)

Execution status enum (`src/types/execution.type.ts` + model):

- `queued` -> `running` -> `completed`
- `queued`/`running` -> `cancelled`
- `running` -> `failed` or `error`

Lifecycle entry points:

- Create: `POST /executions` -> creates Mongo doc + enqueues job
- Worker start: sets `status=running`, sets `pid`, `startedAt`
- Worker finish: sets `status`, `finishedAt`, `error` when relevant
- Stop: publishes control signal and enqueues stop job

## 7) Redis Pub/Sub and realtime

Redis channels (`src/configs/redis.config.ts`):

- `logs`: stream output chunks/events
- `status`: lifecycle transitions (`running`, `completed`, `failed`, etc.)
- `metrics`: reserved channel for telemetry
- `control`: stop commands (`stop-execution`)

### Socket.io bridge

`src/services/socket-server.service.ts` subscribes to `logs`, `status`, `metrics` and emits:

- globally to all clients
- and to scoped room `execution:<executionId>` when payload has `executionId`

Client room events:

- `execution:join` with `{ executionId }`
- `execution:leave` with `{ executionId }`
- receives `execution:logs:history` after join (existing file log content)

## 8) Logs service

Logs are file-based and execution-scoped.

- folder: `logs/`
- file pattern: `logs/<executionId>.log`
- writer: worker (`createExecutionLogStream`, `closeLogStream`)
- reader: API (`readExecutionLog`) used by `GET /executions/:id` and socket history event

Useful for frontend:

- historical logs come from file reads
- live logs come from realtime `logs` socket channel

## 9) Mongo data model (execution)

Main fields in `ExecutionModel`:

- identifiers: `_id`, `jobId`, `playwrightExecutionId`, `pid`
- routing/business context: `client`, `clinic`, `execution`, `bot`, `createdBy`
- execution control: `playwrightProject`, `status`, `startedAt`, `finishedAt`, `error`
- metadata: `note`, `attachments`, `outputPath`, `logsPath`
- timestamps: `createdAt`, `updatedAt`

Indexes:

- TTL on `createdAt` (~90 days)
- compound index on `client, clinic, execution, bot`
- indexes on `jobId` and `status + createdAt`

## 10) API surface used by dashboards

Mounted in `src/routes/execution.route.ts` and exposed at both root and `/api/v1`.

- `POST /executions`
- `GET /executions`
- `GET /executions/:id`
- `POST /executions/:id/stop`
- `PATCH /executions/:id`
- `DELETE /executions/:id`

Also available under `/api/v1/*`.

Compatibility command routes exist in `src/routes/command.routes.ts`:

- `POST /commands/run-project/:project`
- `POST /commands/stop-project/:serviceId`

## 11) Environment variables that affect architecture

From `.env.example`:

- app: `PORT`, `NODE_ENV`
- database: `MONGODB_URI`
- playwright: `PLAYWRIGHT_PROJECT_ROOT_FOLDER`, `ALLOWED_PLAYWRIGHT_PROJECTS`, `MAX_PLAYWRIGHT_WORKERS`, `MAX_PLAYWRIGHT_RETRIES`
- redis/bullmq: `REDIS_*`, `EXECUTION_QUEUE_NAME`, `EXECUTION_JOB_ATTEMPTS`, `EXECUTION_JOB_BACKOFF_MS`, `WORKER_CONCURRENCY`, `STOP_KILL_GRACE_MS`
- realtime: `SOCKET_CORS_ORIGIN`, `SOCKET_SYNC_SERVER_URL`

## 12) Process model (local and PM2)

Two processes should run in production:

1. API: `dist/src/server.js`
2. Worker: `dist/src/workers/playwright.worker.js`

`ecosystem.config.js` already defines both as:

- `executor-api`
- `executor-worker`

## 13) Frontend integration checklist

1. Use `GET /executions` for initial table/history.
2. On details page, call `GET /executions/:id` for full snapshot + historical logs.
3. Open Socket.io connection and emit `execution:join` for that execution.
4. Listen on `logs` and `status` channels for live updates.
5. Use `POST /executions/:id/stop` for cancellation actions.
6. Reflect state transitions using backend status as source of truth.

---

If useful, we can add a second markdown with event payload examples (`logs` and `status`) so frontend can generate strict TypeScript interfaces directly from backend events.

