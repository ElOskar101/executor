import 'dotenv/config';
import mongoose from 'mongoose';
import {connectDb} from "./connection.db";
import app from './app';

const PORT = String(process.env.PORT) || 3000;

// Start DB and only start the HTTP server once DB connection is established.
connectDb()
    .then(() => {
      const server = app.listen(PORT, () => {
        console.log(`[SERVER] Running on http://localhost:${PORT}`);
        console.log(`[SERVER] Swagger at http://localhost:${PORT}/docs`);
      });

      // Graceful shutdown
      const shutdown = (signal:string) => {
        console.info( `Received ${signal}. Shutting down gracefully...`);
        server.close(async (err) => {
          if (err) console.info('Error while closing HTTP server', err);
          try {
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




