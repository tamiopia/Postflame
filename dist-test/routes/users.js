import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { UserSchema } from '../schemas/user.js';
export const users = new Hono()
    .post('/users', zValidator('json', UserSchema), (c) => {
    const data = c.req.valid('json');
    return c.json({ created: true, user: data });
})
    .put('/users/:id', zValidator('json', UserSchema), (c) => {
    const data = c.req.valid('json');
    return c.json({ updated: true, id: c.req.param('id'), user: data });
})
    .delete('/users/:id', (c) => {
    return c.json({ deleted: true, id: c.req.param('id') });
});
