import { Hono } from 'hono';
import { zValidator } from '@hono/zod';
import { z } from 'zod';

export const app = new Hono();

// Simple GET
app.get('/hello', (c) => c.json<{ message: string }>({ message: 'Hello World!' }));

// POST with Zod validation
const userSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  age: z.number().int().optional(),
});

app.post('/users', zValidator('json', userSchema), (c) => {
  const data = c.req.valid('json'); // typed as userSchema
  return c.json({ created: true, user: data });
});

// Another route with query params
const searchSchema = z.object({
  q: z.string(),
  limit: z.number().default(10),
});

app.get('/search', zValidator('query', searchSchema), (c) => {
  const query = c.req.valid('query');
  return c.json({ results: [], query });
});

// PUT route
app.put('/users/:id', zValidator('json', userSchema), (c) => {
  const data = c.req.valid('json');
  return c.json({ updated: true, id: c.req.param('id'), user: data });
});

// DELETE route
app.delete('/users/:id', (c) => {
  return c.json({ deleted: true, id: c.req.param('id') });
});

export default app;
