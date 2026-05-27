import express, { NextFunction, Request, Response } from 'express';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import helmet from 'helmet';

import routes from './routes';
import swaggerSpec from './docs/swagger';
import path from "path";
import { createLogger } from './libs/logger';

const app = express();
const reportsFolder = path.resolve(process.cwd(), 'reports');
const reportsFrameAncestor = "https://agent.controlcentralcarrier.com";
const logger = createLogger('app');

app.use(morgan('dev'));
app.use(express.json());
app.set('trust proxy', 1);
app.use(helmet());

app.use('/reports', (req: Request, res: Response, next: NextFunction) => {
  // Allow framing only for reports and only from the trusted frontend origin.
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${reportsFrameAncestor};`);
  next();
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/reports', express.static(reportsFolder));
app.use(routes);

app.use(async (req: Request, res: Response) => {
  res.status(404).json({
    message: 'Route not found'
  });
});


app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Basic centralized error handler for unexpected exceptions.
  logger.error('Unhandled application error', { error: err });
  res.status(500).json({
    message: 'Internal server error'
  });
});

export default app;
