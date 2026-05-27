import 'dotenv/config';
import mongoose from 'mongoose';
import {connectDb} from "./connection.db";
import app from './app';
import { setupSocketServer, closeSocketServer } from './services/socket-server.service';
import {closeExecutionQueue} from './queues/execution.queue';
import { closeRealtimePublisher } from './services/realtime.service';
import { startReportCleanupCron } from './crons/report-cleaner.cron';
import { createLogger } from './libs/logger';

const env = process.env.NODE_ENV || 'development';
const PORT = env==='production' ? 3018 : String(process.env.PORT) || 3000;
const logger = createLogger('server');


// Start DB and only start the HTTP server once DB connectionString is established.
connectDb()
    .then(async () => {
      const reportCleanupTask = startReportCleanupCron();

      const server = app.listen(PORT, () => {
        logger.info(`Running on http://localhost:${PORT}`);
        logger.info(`Swagger at http://localhost:${PORT}/docs`);
      });
      await setupSocketServer(server);
      logger.info(`Socket.io ready on ws://localhost:${PORT}`);

      // Graceful shutdown
      const shutdown = (signal:string) => {
        logger.info(`Received ${signal}. Shutting down gracefully...`);
        server.close(async (err?: Error) => {
          if (err) logger.error('Error while closing HTTP server', { error: err });
          try {
            await closeSocketServer();
            logger.info('Socket.io server closed');
            await closeExecutionQueue();
            logger.info('Execution queue closed');
            await closeRealtimePublisher();
            logger.info('Realtime publisher closed');
            reportCleanupTask.stop();
            logger.info('Report cleanup cron stopped');
            await mongoose.disconnect();
            logger.info('Disconnected from MongoDB');
          } catch (e) {
            logger.error('Error while disconnecting from MongoDB', { error: e });
            throw e;
          }
          process.exit(0);
        });
      };

      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      logger.error('Failed to start application due to DB connection error', { error: err });
      process.exit(1);
    });


