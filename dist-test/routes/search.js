import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { SearchQuerySchema } from '../schemas/search.js';
export const search = new Hono().get('/search', zValidator('query', SearchQuerySchema), (c) => {
    const query = c.req.valid('query');
    return c.json({ results: [], query });
});
