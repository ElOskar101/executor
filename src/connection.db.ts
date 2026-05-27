import mongoose from 'mongoose';
require('dotenv').config();
import { createLogger } from './libs/logger';

const logger = createLogger('db');

/**
 * Connect to MongoDB and return the connection promise.
 * The caller can await this promise to ensure the DB is ready before starting the server.
 */
export const connectDb = async () => {
    try {
        await mongoose.connect(String(process.env.MONGODB_URI), {});
        logger.info('Success connection to the database');
    } catch (t) {
        logger.error('Database connection failed', { error: t });
        throw t; // rethrow so callers can handle startup failure
    }
}
