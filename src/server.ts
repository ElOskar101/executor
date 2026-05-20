import 'dotenv/config';
import mongoose from 'mongoose';
import {connectDb} from "./connection.db";
import app from './app';
import { setupSocketServer, closeSocketServer } from './services/socket-server.service';
import { closeExecutionQueue } from './queues/execution.queue';
import { closeRealtimePublisher } from './services/realtime.service';

const env = process.env.NODE_ENV || 'development';
const PORT = env==='production' ? 3018 : String(process.env.PORT) || 3000;


// Start DB and only start the HTTP server once DB connectionString is established.
connectDb()
    .then(async () => {
      const server = app.listen(PORT, () => {
        console.log(`[SERVER] Running on http://localhost:${PORT}`);
        console.log(`[SERVER] Swagger at http://localhost:${PORT}/docs`);
      });
      await setupSocketServer(server);
      console.log(`[SERVER] Socket.io ready on ws://localhost:${PORT}`);

      // Graceful shutdown
      const shutdown = (signal:string) => {
        console.info( `Received ${signal}. Shutting down gracefully...`);
        server.close(async (err?: Error) => {
          if (err) console.info('Error while closing HTTP server', err);
          try {
            await closeSocketServer();
            console.info('Socket.io server closed');
            await closeExecutionQueue();
            console.info('Execution queue closed');
            await closeRealtimePublisher();
            console.info('Realtime publisher closed');
            await mongoose.disconnect();
            console.info('Disconnected from MongoDB');
          } catch (e) {
            console.info('Error while disconnecting from MongoDB');
            throw e;
          }
          process.exit(0);
        });
      };

      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    })
    .catch((err) => {
      console.error('Failed to start application due to DB connection error:', err);
      process.exit(1);
    });


