import { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';
import { CreateProductSchema, ProductWithRelations, ErrorResponseSchema, ProductListResponseSchema, ProductDetailResponseSchema, } from './schema/schema.js';
export const productRoute = new OpenAPIHono();
// Expose OpenAPI doc for this module
productRoute.doc('/openapi.json', {
    openapi: '3.0.0',
    info: {
        title: 'Products API',
        version: '1.0.0',
        description: 'OpenAPI spec for Products module',
    },
});
// GET /products
productRoute.openapi({
    method: 'get',
    path: '/',
    tags: ['Products'],
    responses: {
        200: {
            description: 'Products fetched successfully',
            content: {
                'application/json': {
                    schema: ProductListResponseSchema,
                },
            },
        },
        500: {
            description: 'Internal Server Error',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
}, (c) => c.json({ items: [] }));
// POST /products
productRoute.openapi({
    method: 'post',
    path: '/',
    tags: ['Products'],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: CreateProductSchema,
                    example: {
                        name: 'Mixed Teff Injera – 4 pieces',
                        description: 'Blend of brown & ivory teff for a balanced flavor. 4 pieces pack.',
                        unitPrice: 1400,
                        isEnabled: true,
                        sku: 'TS-001',
                    },
                },
            },
        },
    },
    responses: {
        201: {
            description: 'Product created successfully',
            content: {
                'application/json': {
                    schema: ProductWithRelations,
                },
            },
        },
        400: {
            description: 'Validation failed',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
        500: {
            description: 'Internal Server Error',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
}, (c) => c.json({ id: crypto.randomUUID(), ...c.req.valid('json') }, 201));
// GET /products/:id
productRoute.openapi({
    method: 'get',
    path: '/:id',
    tags: ['Products'],
    request: {
        params: z.object({ id: z.string().uuid() }),
    },
    responses: {
        200: {
            description: 'Product fetched successfully',
            content: {
                'application/json': {
                    schema: ProductDetailResponseSchema,
                },
            },
        },
        404: {
            description: 'Not found',
            content: {
                'application/json': { schema: ErrorResponseSchema },
            },
        },
    },
}, (c) => c.json({
    data: {
        id: c.req.param('id'),
        name: 'Sample Product',
        description: 'Example product for docs',
        unitPrice: 1400,
        isEnabled: true,
        sku: 'TS-001',
    },
}, 200));
export default productRoute;
