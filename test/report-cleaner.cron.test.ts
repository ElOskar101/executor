import assert from 'node:assert/strict';
import test from 'node:test';
import type { PathLike } from 'node:fs';

import { cleanupOldReports } from '../src/crons/report-cleaner.cron';

function createDirent(name: string) {
  return {
    name,
    isDirectory: () => true,
  } as never;
}

test('cleanupOldReports deletes only report folders older than one month', async () => {
  const deletedPaths: string[] = [];
  const readdirEntries = [createDirent('old-run'), createDirent('recent-run'), createDirent('nested-not-used')];
  const oldBirthtime = new Date('2025-03-01T00:00:00.000Z').getTime();
  const recentBirthtime = new Date('2025-05-20T00:00:00.000Z').getTime();

  const result = await cleanupOldReports({
    reportsFolder: '/tmp/reports',
    now: new Date('2025-06-01T00:00:00.000Z'),
    deps: {
      readdir: async () => readdirEntries,
      stat: async (targetPath: PathLike) => {
        const normalizedTargetPath = String(targetPath);

        if (normalizedTargetPath.endsWith('old-run')) {
          return { birthtimeMs: oldBirthtime, mtimeMs: oldBirthtime } as never;
        }

        return { birthtimeMs: recentBirthtime, mtimeMs: recentBirthtime } as never;
      },
      rm: async (targetPath: PathLike) => {
        deletedPaths.push(String(targetPath));
      },
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  });

  assert.equal(result.deletedCount, 1);
  assert.deepEqual(deletedPaths, ['/tmp/reports/old-run']);
});

test('cleanupOldReports skips missing reports folder', async () => {
  const result = await cleanupOldReports({
    reportsFolder: '/tmp/missing-reports',
    deps: {
      readdir: async () => {
        const error = new Error('missing') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      },
      stat: async () => {
        throw new Error('stat should not be called');
      },
      rm: async () => undefined,
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  });

  assert.equal(result.deletedCount, 0);
});

