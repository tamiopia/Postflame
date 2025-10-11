import { OpenAPIHono } from '@hono/zod-openapi';
import { users } from './routes/users.js';
import { search } from './routes/search.js';
import productRoute from './modules/products/routes.js';
import userRoute from './modules/users/routes.js';

export const app = new OpenAPIHono();

// Simple GET
app.get('/hello', (c) => c.json<{ message: string }>({ message: 'Hello World!' }));

// Mount modular routes
app.route('/', users);
app.route('/', search);
app.route('/products', productRoute);
app.route('/users-v2', userRoute);

// API doc endpoint
app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    title: 'Azeb Baltina API Documentation',
    version: '1.0.0',
  },
  servers: [
    {
      url: `http://localhost:${process.env.PORT ?? 3000}`,
      description: 'Local Server',
    },
  ],
});

export default app;
