import express, { NextFunction, Request, Response } from 'express';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import helmet from 'helmet';

import routes from './routes';
import swaggerSpec from './docs/swagger';
import path from "path";

const app = express();
const reportsFolder = path.resolve(process.cwd(), 'reports');

app.use(morgan('dev'));
app.use(express.json());
app.set('trust proxy', 1);
app.use(helmet());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/reports', express.static(reportsFolder));
app.use(routes);

app.use(async (req: Request, res: Response) => {
  res.status(404).json({
    message: 'Route not found'
  });
});


app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Basic centralized error handler for unexpected exceptions.
  console.error(`[SERVER] ${err}`);
  res.status(500).json({
    message: 'Internal server error'
  });
});

export default app;
