# Executor API Starter

Basic Node.js API scaffold with Express, Morgan, Swagger docs, and route/controller separation.

## Project Structure

```text
src/
  app.js
  server.js
  controllers/
    healthController.js
  routes/
    index.js
    healthRoutes.js
  docs/
    swagger.js
test/
  health.test.js
```

## Install

```bash
npm install
```

## Run (TypeScript dev mode)

```bash
npm run dev
```

## Build

```bash
npm run build
```

Production mode (runs compiled output from `dist/`):

```bash
npm start
```

## Endpoints

- `GET /` - Base API message
- `GET /api/health` - Health check
- `GET /docs` - Swagger UI

## Test

```bash
npm test
```

