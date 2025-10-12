import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { CreateUserSchema, UpdateUserSchema, UserSchema, UserListResponseSchema, UserDetailResponseSchema, ErrorResponseSchema, } from './schema/schema.js';
export const userRoute = new OpenAPIHono();
// Doc for users module
userRoute.doc('/openapi.json', {
    openapi: '3.0.0',
    info: { title: 'Users API', version: '1.0.0', description: 'OpenAPI spec for Users module' },
});
// GET /users
userRoute.openapi({
    method: 'get',
    path: '/',
    tags: ['Users'],
    responses: {
        200: {
            description: 'Users fetched successfully',
            content: { 'application/json': { schema: UserListResponseSchema } },
        },
    },
}, (c) => c.json({ items: [] }));
// POST /users
userRoute.openapi({
    method: 'post',
    path: '/',
    tags: ['Users'],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: CreateUserSchema,
                    example: { name: 'Alice', email: 'alice@example.com', age: 30 },
                },
                'application/x-www-form-urlencoded': {
                    schema: CreateUserSchema,
                },
            },
        },
    },
    responses: {
        201: { description: 'User created', content: { 'application/json': { schema: UserSchema } } },
        400: { description: 'Validation failed', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
}, (c) => c.json({ id: crypto.randomUUID(), ...c.req.valid('json') }, 201));
// GET /users/:id
userRoute.openapi({
    method: 'get',
    path: '/:id',
    tags: ['Users'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
        200: { description: 'User fetched', content: { 'application/json': { schema: UserDetailResponseSchema } } },
        404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
}, (c) => c.json({
    data: { id: c.req.param('id'), name: 'Alice', email: 'alice@example.com', age: 30 },
}, 200));
// PUT /users/:id
userRoute.openapi({
    method: 'put',
    path: '/:id',
    tags: ['Users'],
    request: {
        params: z.object({ id: z.string().uuid() }),
        body: {
            content: {
                'application/json': {
                    schema: UpdateUserSchema,
                    example: { name: 'Alice Updated', email: 'alice.updated@example.com', age: 31 },
                },
            },
        },
    },
    responses: {
        200: { description: 'User updated', content: { 'application/json': { schema: UserSchema } } },
        400: { description: 'Validation failed', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
}, (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');
    // Ensure required fields in response match UserSchema
    const updated = {
        id,
        name: body.name ?? 'Alice',
        email: body.email ?? 'alice@example.com',
        age: body.age,
    };
    return c.json(updated, 200);
});
// DELETE /users/:id
userRoute.openapi({
    method: 'delete',
    path: '/:id',
    tags: ['Users'],
    request: { params: z.object({ id: z.string().uuid() }) },
    responses: {
        200: { description: 'User deleted', content: { 'application/json': { schema: UserSchema } } },
        404: { description: 'Not found', content: { 'application/json': { schema: ErrorResponseSchema } } },
    },
}, (c) => c.json({ id: c.req.param('id'), name: 'Alice', email: 'alice@example.com', age: 30 }, 200));
export default userRoute;
