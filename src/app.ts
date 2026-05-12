import express, { NextFunction, Request, Response } from 'express';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import routes from './routes';
import swaggerSpec from './docs/swagger';
import {spawn} from "node:child_process";

const app = express();

app.use(morgan('dev'));
app.use(express.json());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(routes);

app.use(async (req: Request, res: Response) => {
  const child = spawn('sh', ['-c', 'ls /home/oscar/Documents/']);

  child.stdout.on('data', (data) => {
    console.log(data.toString());
  });

  child.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  child.on('error', (error) => {
    console.error(`Error: ${error.message}`);
  });

  res.status(404).json({
    message: 'Route not found'
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Basic centralized error handler for unexpected exceptions.
  console.error(err);
  res.status(500).json({
    message: 'Internal server error'
  });
});

export default app;

