import fs from 'node:fs/promises';
import path from 'node:path';

import cron from 'node-cron';

type CleanupDeps = {
  readdir: typeof fs.readdir;
  stat: typeof fs.stat;
  rm: typeof fs.rm;
};

type CleanupOptions = {
  reportsFolder?: string;
  now?: Date;
  logger?: Pick<typeof console, 'info' | 'warn' | 'error'>;
  deps?: CleanupDeps;
};

const DEFAULT_REPORTS_FOLDER = path.resolve(process.cwd(), 'reports');
const MONTHLY_CLEANUP_CRON = '0 0 1 * *';

/**
 * Helper function to calculate the date one month ago from a given reference date.
 * @param referenceDate
 * @returns A new Date object representing one month ago from the reference date.
 */
function getOneMonthAgo(referenceDate: Date) {
  const cutoff = new Date(referenceDate);
  cutoff.setMonth(cutoff.getMonth() - 1);
  return cutoff;
}

/**
 * Auxiliary function to get a list of expired report folders in the reports directory.
 * @param reportsFolder
 * @param cutoff
 * @param deps
 */
async function getExpiredReportFolders(reportsFolder: string, cutoff: Date, deps: CleanupDeps) {
  const entries = await deps.readdir(reportsFolder, { withFileTypes: true });
  const expiredFolders: string[] = [];

  for (const entry of entries) {
	if (!entry.isDirectory()) continue;

	const reportFolder = path.join(reportsFolder, entry.name);
	const stats = await deps.stat(reportFolder);
	const createdAtMs = Number.isFinite(stats.birthtimeMs) && stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.mtimeMs;

	if (createdAtMs < cutoff.getTime()) {
	  expiredFolders.push(reportFolder);
	}
  }

  return expiredFolders;
}

/**
 * Main function to clean up old report folders. Deletes folders in the reports directory that are older than one month.
 * @param options Cleanup options including custom reports folder, current date, logger, and dependencies for file operations.
 * @returns An object containing the count of deleted folders and any errors encountered.
 * @param options
 */
export async function cleanupOldReports(options: CleanupOptions = {}) {
  const reportsFolder = options.reportsFolder || DEFAULT_REPORTS_FOLDER;
  const now = options.now || new Date();
  const logger = options.logger || console;
  const deps = options.deps || fs;
  const cutoff = getOneMonthAgo(now);

  try {
	const expiredFolders = await getExpiredReportFolders(reportsFolder, cutoff, deps);

	if (expiredFolders.length === 0) {
	  logger.info(`[CRON] No report folders older than ${cutoff.toISOString()} were found.`);
	  return { deletedCount: 0, cutoff };
	}

	for (const reportFolder of expiredFolders) {
	  await deps.rm(reportFolder, { recursive: true, force: true });
	  logger.info(`[CRON] Deleted expired report folder: ${reportFolder}`);
	}

	return { deletedCount: expiredFolders.length, cutoff };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.info(`[CRON] Reports folder not found at ${reportsFolder}. Skipping cleanup.`);
      return { deletedCount: 0, cutoff };
    }

	logger.error('[CRON] Failed to clean old report folders', error);
	throw error;
  }
}

/**
 * Starting function for the report cleanup cron job.
 * @param options
 */
export function startReportCleanupCron(options: CleanupOptions = {}) {
  const reportsFolder = options.reportsFolder || DEFAULT_REPORTS_FOLDER;
  const logger = options.logger || console;

  logger.info(`[CRON] Starting report cleanup cron for ${reportsFolder}`);
  const task = cron.schedule(MONTHLY_CLEANUP_CRON, () => {
	void cleanupOldReports({ reportsFolder, logger, deps: options.deps, now: new Date() });
  });

  logger.info(`[CRON] Report cleanup scheduled with pattern "${MONTHLY_CLEANUP_CRON}" for ${reportsFolder}`);

  return task;
}


