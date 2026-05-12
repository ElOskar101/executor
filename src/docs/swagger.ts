import path from 'node:path';
import swaggerJSDoc from 'swagger-jsdoc';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Executor API',
      version: '1.0.0',
      description: 'Basic Express API starter with Swagger and Morgan'
    },
    servers: [
      {
        url: 'http://localhost:3000'
      }
    ]
  },
  apis: [path.join(__dirname, '../routes/*.{ts,js}')]
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;

