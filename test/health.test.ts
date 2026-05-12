import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';

import app from '../src/app';

test('GET /api/health returns service status', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(typeof response.body.uptime, 'number');
  assert.ok(response.body.timestamp);
});

test('GET / returns base API message', async () => {
  const response = await request(app).get('/');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.message, 'Executor API is running');
});

