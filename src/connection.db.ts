//import {i} from "./libs/logger";

import mongoose from 'mongoose';
require('dotenv').config();

/**
 * Connect to MongoDB and return the connection promise.
 * The caller can await this promise to ensure the DB is ready before starting the server.
 */
export const connectDb = async () => {
    try {
        await mongoose.connect(String(process.env.MONGODB_URI), {});
        console.info("[SERVER] Success connection to the database");
    } catch (t) {
        console.info('[SERVER] Database connection failed');
        throw t; // rethrow so callers can handle startup failure
    }
}
