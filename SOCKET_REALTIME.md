# Socket Realtime Guide (Frontend)

Guia corta para consumir logs en tiempo real desde el dashboard.

## 1) Endpoint de Socket

El Socket.io corre en el mismo servidor HTTP del API.

- Base URL local: `http://localhost:<PORT>`
- `PORT` viene de la variable de entorno del backend.
- CORS del socket se controla con `SOCKET_CORS_ORIGIN`.

## 2) Flujo recomendado para una vista de detalle

1. Obtener snapshot inicial con `GET /api/v1/executions/:id` (incluye logs historicos actuales).
2. Abrir conexion Socket.io.
3. Emitir `execution:join` con el `executionId`.
4. Escuchar eventos `execution:logs:history`, `logs` y `status`.
5. Al salir de la pantalla, emitir `execution:leave`.

## 3) Eventos que emite el backend

### `execution:logs:history`

Se envia al hacer join de una ejecucion.

```json
{
  "executionId": "6823f0...",
  "content": "...contenido acumulado del archivo logs/<executionId>.log..."
}
```

### `logs`

Chunk en vivo publicado desde Redis (canal `logs`).

```json
{
  "executionId": "6823f0...",
  "jobId": "6823f0...",
  "stream": "stdout",
  "message": "[chromium] running test ...\n",
  "timestamp": "2026-05-15T14:23:10.120Z"
}
```

`stream` puede ser: `stdout`, `stderr`, `system`.

### `status`

Cambio de estado de ejecucion publicado desde Redis (canal `status`).

```json
{
  "executionId": "6823f0...",
  "jobId": "6823f0...",
  "status": "running",
  "pid": 34122,
  "exitCode": null,
  "error": null,
  "timestamp": "2026-05-15T14:23:10.050Z"
}
```

Estados comunes: `queued`, `running`, `completed`, `failed`, `cancelled`, `error`.

## 4) Eventos que debe emitir el frontend

### Join a una ejecucion

```json
{
  "executionId": "6823f0..."
}
```

Evento: `execution:join`

### Leave de una ejecucion

```json
{
  "executionId": "6823f0..."
}
```

Evento: `execution:leave`

## 5) Ejemplo rapido con `socket.io-client`

```ts
import { io, Socket } from "socket.io-client";

const executionId = "6823f0...";
const socket: Socket = io("http://localhost:3000", {
  transports: ["websocket"],
});

socket.on("connect", () => {
  // Importante: re-join en cada reconexion
  socket.emit("execution:join", { executionId });
});

socket.on("execution:logs:history", (payload) => {
  if (payload.executionId !== executionId) return;
  // Reemplazar buffer inicial de logs
  console.log("history", payload.content);
});

socket.on("logs", (payload) => {
  if (payload.executionId !== executionId) return;
  // Append incremental
  console.log(`[${payload.stream}]`, payload.message);
});

socket.on("status", (payload) => {
  if (payload.executionId !== executionId) return;
  console.log("status", payload.status);
});

// Cleanup al desmontar pantalla
function dispose() {
  socket.emit("execution:leave", { executionId });
  socket.disconnect();
}
```

## 6) Buenas practicas para el dashboard

- Hacer append de `logs.message` tal cual llega (puede venir en chunks parciales).
- Usar `status` como fuente de verdad para badges/acciones de UI.
- Re-emitir `execution:join` en reconexion (`connect`).
- Si la pantalla cambia de ejecucion, hacer `leave` del id anterior antes del nuevo `join`.
- Mantener fallback por HTTP (`GET /api/v1/executions/:id`) por si el socket se cae.

## 7) Referencias backend

- `src/services/socket-server.service.ts`
- `src/services/realtime.service.ts`
- `src/types/realtime.type.ts`
- `src/workers/playwright.worker.ts`

