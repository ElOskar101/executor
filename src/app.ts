import express, { NextFunction, Request, Response } from 'express';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';

import routes from './routes';
import swaggerSpec from './docs/swagger';

const app = express();

app.use(morgan('dev'));
app.use(express.json());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(routes);

app.use(async (req: Request, res: Response) => {
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
