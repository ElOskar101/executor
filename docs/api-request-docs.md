# Execution API Request Docs

This guide is for frontend developers integrating with the Execution API.
It focuses on HTTP requests related to the execution lifecycle.

## Base URL

- Local: `http://localhost:3000`
- Versioned base path: `/api/v1`

Most examples below use:

`http://localhost:3000/api/v1`

## Content Type

Use JSON requests:

- Header: `Content-Type: application/json`

## Resource Overview

Execution routes are available in two prefixes in the current backend setup:

- Recommended: `/api/v1/executions`
- Alias (legacy): `/executions`

Use `/api/v1/executions` from frontend.

## Execution Object (response shape)

Typical response fields:

- `_id`: execution id
- `playwrightProject`: Playwright project name
- `status`: `queued | running | completed | failed | cancelled | unknown`
- `createdBy`, `client`, `clinic`, `execution`, `botName`
- `meta`: runtime/context payload
- `startedAt`, `finishedAt`
- `notes`: array of strings
- `logs`: only present on `GET /executions/:id`

## Endpoints

### 1) Create execution (queue a new job)

- **POST** `/api/v1/executions`

Request body (minimal valid):

```json
{
  "project": "elg-regression",
  "meta": {
    "bot": {
      "botName": "eligibility-bot",
      "targetUrl": "https://portal.example.com",
      "username": "runner_user",
      "password": "runner_password",
      "otherInformation": {}
    },
    "patients": [
      {
        "patientName": "Ana",
        "patientLastName": "Lopez",
        "patientMemberId": "A10001",
        "patientDob": "1985-03-10",
        "policyHolderName": "Ana",
        "policyHolderLastName": "Lopez",
        "policyHolderDob": "1985-03-10",
        "relationship": "self",
        "zipCode": "90001",
        "clinic": "Downtown Clinic",
        "verificationType": "elg",
        "filenames": "ana-lopez.pdf",
        "otherInformation": {}
      }
    ],
    "config": {},
    "rv": {}
  }
}
```

Optional top-level fields:

- `createdBy`, `client`, `clinic`, `botName`, `execution`
- `workers`, `retries`, `headed`, `playwrightMode`

Optional `meta` fields:

- `outputPath`, `logsPath`, `workers`, `retries`, `headed`, `playwrightMode`

Success response:

- `200 OK` with created execution document

Error responses:

- `400 Bad Request` when `project` is missing/invalid or not allowed
- `500 Internal Server Error` for unexpected errors

---

### 2) List executions

- **GET** `/api/v1/executions`

Success response:

- `200 OK` with `Execution[]` sorted by newest first

---

### 3) Get execution by id (includes logs)

- **GET** `/api/v1/executions/:id`

Path params:

- `id` (Mongo id string)

Success response:

- `200 OK` with execution document + `logs` string

Error responses:

- `404 Not Found` when id does not exist

---

### 4) Stop execution

- **POST** `/api/v1/executions/:id/stop`

Path params:

- `id` (Mongo id string)

Behavior:

- If running/queued, backend publishes stop signal and marks execution as `cancelled`.
- Worker receives stop command and terminates process tree.

Success response:

- `200 OK` with updated execution

Error responses:

- `400 Bad Request` if already `completed`/`failed`/`cancelled`
- `404 Not Found` if execution does not exist

---

### 5) Update execution

- **PATCH** `/api/v1/executions/:id`

Use only for metadata/manual updates. Avoid overriding runtime fields (`status`, `pid`, queue ids) from frontend unless explicitly needed.

Success response:

- `200 OK` with updated execution

---

### 6) Delete execution

- **DELETE** `/api/v1/executions/:id`

Behavior:

- Deletes record only when execution is not running.

Success response:

- `200 OK` with deleted execution

Error responses:

- `400 Bad Request` if execution is still running
- `404 Not Found` if id does not exist

## Related Docs

- Realtime socket integration: `docs/socket-realtime-docs.md`

## Frontend Integration Flow (recommended)

1. `POST /api/v1/executions` to queue a run.
2. Store returned `_id`.
3. Poll `GET /api/v1/executions/:id` for status/log snapshots, or use realtime socket channel for live logs/status.
4. Use `POST /api/v1/executions/:id/stop` to cancel.
5. Refresh list via `GET /api/v1/executions`.

## Quick cURL Examples

```bash
curl -X POST "http://localhost:3000/api/v1/executions" \
  -H "Content-Type: application/json" \
  -d '{
    "project":"elg-regression",
    "meta":{
      "bot":{"botName":"eligibility-bot","targetUrl":"https://portal.example.com","username":"runner_user","password":"runner_password","otherInformation":{}},
      "patients":[],
      "config":{},
      "rv":{}
    }
  }'
```

```bash
curl "http://localhost:3000/api/v1/executions"
```

```bash
curl "http://localhost:3000/api/v1/executions/<executionId>"
```

```bash
curl -X POST "http://localhost:3000/api/v1/executions/<executionId>/stop"
```
