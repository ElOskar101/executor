# Socket Realtime Docs (Frontend)

This document explains how frontend clients should connect to the backend Socket.io service to receive execution logs and status updates in real time.

## 1) Socket Endpoint

- Base URL: same host/port as the API server
- Local example: `http://localhost:3000`
- CORS is controlled by backend env var: `SOCKET_CORS_ORIGIN`

## 2) Recommended Frontend Flow

1. Call `GET /api/v1/executions/:id` to load initial execution details.
2. Open Socket.io connection.
3. Emit `execution:join` with the selected `executionId`.
4. Listen to `execution:logs:history`, `logs`, `status` (and optionally `metrics`).
5. On view change/unmount, emit `execution:leave` and disconnect.

## 3) Client -> Server Events

### `execution:join`
Join execution-specific room and receive initial log history.

Payload:

```json
{
  "executionId": "682ba2f2d2930c4fd5e984c4"
}
```

### `execution:leave`
Leave execution-specific room.

Payload:

```json
{
  "executionId": "682ba2f2d2930c4fd5e984c4"
}
```

## 4) Server -> Client Events

### `execution:logs:history`
Sent after `execution:join` with current log file content.

```json
{
  "executionId": "682ba2f2d2930c4fd5e984c4",
  "content": "...accumulated logs text..."
}
```

### `logs`
Live log chunks from stdout/stderr/system.

```json
{
  "executionId": "682ba2f2d2930c4fd5e984c4",
  "jobId": "682ba2f2d2930c4fd5e984c4",
  "stream": "stdout",
  "message": "[chromium] running test ...\n",
  "timestamp": "2026-05-22T14:10:00.000Z"
}
```

Notes:
- `stream` can be `stdout`, `stderr`, or `system`.
- `message` may arrive in partial chunks; append exactly as received.

### `status`
Execution lifecycle update.

```json
{
  "executionId": "682ba2f2d2930c4fd5e984c4",
  "jobId": "682ba2f2d2930c4fd5e984c4",
  "status": "running",
  "pid": 34122,
  "exitCode": null,
  "error": null,
  "timestamp": "2026-05-22T14:10:00.000Z"
}
```

### `metrics` (optional)
Worker metrics event (global visibility).

```json
{
  "workerId": "worker-host:12345",
  "activeExecutions": 2,
  "timestamp": "2026-05-22T14:10:00.000Z"
}
```

## 5) Important Delivery Behavior

The backend emits Redis realtime events in two ways:

- To room: `execution:<executionId>` when `executionId` exists in payload
- To all connected clients (global broadcast)

Frontend should always filter by `executionId` in listeners to avoid mixing events from other executions.

## 6) Frontend Example (TypeScript)

```ts
import { io, Socket } from "socket.io-client";

type JoinPayload = { executionId: string };

const executionId = "682ba2f2d2930c4fd5e984c4";
const socket: Socket = io("http://localhost:3000", {
  transports: ["websocket"],
});

socket.on("connect", () => {
  // Re-join every reconnect
  socket.emit("execution:join", { executionId } satisfies JoinPayload);
});

socket.on("execution:logs:history", (payload: { executionId: string; content: string }) => {
  if (payload.executionId !== executionId) return;
  // Initialize UI log buffer
  console.log(payload.content);
});

socket.on("logs", (payload: {
  executionId: string;
  jobId?: string;
  stream: "stdout" | "stderr" | "system";
  message: string;
  timestamp: string;
}) => {
  if (payload.executionId !== executionId) return;
  // Append incremental chunks
  console.log(`[${payload.stream}] ${payload.message}`);
});

socket.on("status", (payload: {
  executionId: string;
  status: string;
  pid?: number;
  exitCode?: number | null;
  error?: string;
  timestamp: string;
}) => {
  if (payload.executionId !== executionId) return;
  console.log(payload.status);
});

export function cleanupSocket() {
  socket.emit("execution:leave", { executionId } satisfies JoinPayload);
  socket.disconnect();
}
```

## 7) UI Best Practices

- Keep HTTP fallback (`GET /api/v1/executions/:id`) for resilience.
- Re-emit `execution:join` on reconnect.
- Leave previous execution room before joining a new execution.
- Use `status` event as source of truth for badges/actions.
- Append log chunks exactly as they arrive.

## 8) Backend References

- `src/services/socket-server.service.ts`
- `src/services/realtime.service.ts`
- `src/types/realtime.type.ts`
- `src/workers/playwright.worker.ts`

