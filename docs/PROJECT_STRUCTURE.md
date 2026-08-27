# Executor Project Structure Guide

This document describes the current repository layout and the runtime boundaries that matter for API consumers, integrations, and operational maintenance.

## 1) What this project does

`executor` is the orchestration backend for Playwright-style execution jobs.

- It exposes a REST API for creating, listing, updating, stopping, and scheduling runs.
- It persists execution state and log payloads in MongoDB.
- It uses BullMQ over Redis to queue work and coordinate runtime jobs.
- It exposes realtime events through Redis and Socket.io.
- It serves generated reports from the `../reports` folder and cleans stale report directories on a cron schedule.

This repo currently focuses on the API and orchestration layer. The actual Playwright runner can be implemented or connected by downstream workers that consume the queue described below.

## 2) High-level architecture

```text
Client / Dashboard
   |
   | HTTP + Socket.io
   v
Express API (src/server.ts + src/app.ts)
   |\
   | +--> MongoDB (execution records + log chunks)
   |
   +--> BullMQ queue in Redis (playwright-executions)
            |
            +--> External / downstream runner(s)
            |
            +--> Realtime events => Redis channels (logs, status, metrics, control)

API Socket server subscribes to Redis and broadcasts updates to connected clients.
Reports are exposed under /reports and cleaned by cron.
```

## 3) Main runtime components

### API process

- Entry: `../src/server.ts`
- Express app: `../src/app.ts`
- Route composition: `../src/routes/index.ts`
- Responsibilities:
 - expose HTTP endpoints for execution management
 - validate and persist execution documents
 - create BullMQ jobs for queued or scheduled runs
 - publish control actions for stop/pause/resume
 - mount Socket.io and Swagger docs
 - serve static generated reports from `../reports`

### Queue and realtime layer

- Queue factory: `../src/queues/execution.queue.ts`
- Redis connection config: `../src/configs/redis.config.ts`
- Realtime publishers: `../src/services/realtime.service.ts`
- Socket.io server: `../src/services/socket-server.service.ts`
- Redis adapter: `../src/adapters/redis.adapter.ts`

These components allow the API to publish lifecycle and log events while clients listen on Socket.io rooms or the global event stream.

### Persistence layer

- Mongo connection: `../src/connection.db.ts`
- Execution model: `../src/models/execution.model.ts`
- Log model: `../src/models/log.model.ts`
- Mongo adapter helpers: `../src/adapters/mongo.adapter.ts`

The execution document stores metadata, runtime context, scheduled timing, and status. Log content is stored as a dedicated document keyed by `runId`.

### Operational tooling

- Cron cleanup: `../src/crons/report-cleaner.cron.ts`
- Deployment scripts: `../src/scripts/deploy.sh`
- Validation script: `../src/scripts/check-playwright-project.js`
- Swagger docs: `../src/docs/swagger.ts`

## 4) Current folder map

```text
/
 .env.example
 .env
 Dockerfile
 docker-compose*.yml
 ecosystem.config.js
 package.json
 tsconfig.json
 README.md
 PROJECT_STRUCTURE.md

 src/
   app.ts                            # Express app, CORS, Swagger, report serving
   server.ts                         # HTTP bootstrap, DB connection, graceful shutdown
   connection.db.ts                  # Mongo connection helper

   configs/
     codes-config.ts                 # project-coded metadata/config helpers
     paths.config.ts                 # path config and report/log location helpers
     redis.config.ts                 # Redis connection settings and channels

   controllers/
     execution.controller.ts         # REST handlers for execution CRUD + control actions
     stats.controller.ts             # health/stats endpoint logic

   services/
     execution.service.ts            # queue creation, scheduling, and execution mutations
     realtime.service.ts             # Redis publish helpers for logs/status/control
     socket-server.service.ts        # Socket.io server and subscription bridge
     socket-sync.service.ts          # optional sync integration client
     execution-log-persister.service.ts
     execution-realtime-persister.service.ts
     execution-status-persister.service.ts

   adapters/
     mongo.adapter.ts                # Mongo persistence helpers for logs + execution state
     redis.adapter.ts                # low-level Redis publish/close adapter

   routes/
     index.ts                        # root + health endpoints, route mounting
     execution.route.ts              # execution endpoints (`/executions`, `/schedule`, etc.)
     stats.route.ts                  # `/stats` route

   models/
     execution.model.ts              # Mongoose execution schema
     log.model.ts                    # Mongoose log schema

   queues/
     execution.queue.ts              # BullMQ queue and queue events singleton

   crons/
     report-cleaner.cron.ts          # monthly cleanup for expired report folders

   docs/
     swagger.ts                      # OpenAPI definition for the API

   libs/
     dates.ts                        # date helpers
     logger.ts                       # consensus logging utility
     query-builder.ts                # query building helpers
     res-handler.ts                  # response helper patterns

   scripts/
     check-playwright-project.js     # project validation helper
     deploy.sh                       # deployment script

   types/
     execution.type.ts               # execution request / job / status types
     realtime.type.ts                # realtime event payload contracts

 reports/
   # generated runtime report artifacts served by /reports

 docs/
   # project documentation and operational notes
```

## 5) API surface used by dashboards and integrations

The app mounts routes at both the root path and `/api/v1`.

Primary execution routes:

- `POST /executions`
- `GET /executions`
- `GET /executions/:id`
- `PATCH /executions/:id`
- `DELETE /executions/:id`
- `POST /executions/:id/stop`
- `POST /executions/schedule`
- `POST /executions/:id/pause`
- `POST /executions/:id/resume`
- `POST /executions/:id/run-now`

Operational routes:

- `GET /api/health`
- `GET /stats`

The Swagger UI is mounted at `/docs`.

## 6) Execution lifecycle and status model

The current model supports these statuses:

- `queued`
- `running`
- `paused`
- `completed`
- `unknown`
- `cancelled`
- `failed`
- `scheduled`

Typical lifecycle:

1. Client creates an execution via `POST /executions` or schedules via `POST /executions/schedule`.
2. Execution record is saved in MongoDB.
3. A BullMQ job is queued with job metadata and runtime context.
4. Status is updated as the job transitions through `queued`, `running`, and final state.
5. Logs are appended to the `Log` document keyed by `runId`.
6. Realtime status/log events are published to Redis and re-emitted over Socket.io.

## 7) Redis and Socket.io communication

Redis channels defined in `../src/configs/redis.config.ts`:

- `logs`
- `status`
- `metrics`
- `control`

Control event types include:

- `stop-execution`
- `pause-execution`
- `resume-execution`

Socket.io behavior:

- the API listens to Redis events and re-broadcasts to connected clients
- clients can join a room scoped to an execution for focused updates
- event payloads are expected to include execution-specific metadata when relevant

## 8) Persistence and log model

Mongo execution document highlights:

- `_id`, `runId`, `jobId`, `playwrightExecutionId`
- `project`, `status`, `startedAt`, `finishedAt`, `scheduledAt`
- `createdBy`, `client`, `clinic`, `execution`, `botName`
- `context` containing runtime config like `env`, `bot`, `patients`, `clinicConfig`, `payloadConfigs`, `workers`, and `retries`

Log document highlights:

- `runId` references the execution document
- `content` is an array of log strings that is joined on read

This separation keeps the execution record light while allowing the log stream to grow independently.

## 9) Report and cleanup behavior

Reports are served from the filesystem through the `/reports` route.

- `../src/app.ts` mounts the static reports folder
- `../src/crons/report-cleaner.cron.ts` removes expired report directories on a monthly schedule
- cleanup logic uses `reportsFolder` from env and safely skips if the folder is missing

This keeps generated report artifacts from accumulating indefinitely.

## 10) Environment and deployment notes

Key configuration ideas in the repo:

- `PORT` and `NODE_ENV`
- `MONGODB_URI`
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`
- `EXECUTION_QUEUE_NAME`
- `CORS_ORIGIN` / `SOCKET_CORS_ORIGIN`
- `REPORTS_PATH`
- `MAX_PLAYWRIGHT_WORKERS`, `MAX_PLAYWRIGHT_RETRIES`, `EXECUTION_JOB_ATTEMPTS`, `EXECUTION_JOB_BACKOFF_MS`

Production startup is tied to the Express server and related services via `../ecosystem.config.js` and the Docker compose files in the repo root.

## 11) Frontend integration checklist

1. Call `GET /executions` to load the dashboard’s initial run list.
2. Use `GET /executions/:id` when viewing a single execution to fetch its status and associated log content.
3. Open a Socket.io connection and listen for status/log updates.
4. Use the execution-specific room or payload metadata to scope updates to a run.
5. Use `POST /executions/:id/stop`, `pause`, and `resume` for control actions.
6. Treat Mongo-backed status as the source of truth and use realtime events for live UX updates.
7. Access static report content through `/reports` after a run has produced artifacts.

---

If useful, we can add a second markdown with event payload examples (`logs` and `status`) so frontend can generate strict TypeScript interfaces directly from backend events.

