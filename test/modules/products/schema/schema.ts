import { z } from '@hono/zod-openapi';

export const ErrorResponseSchema = z
  .object({
    message: z.string().openapi({ example: 'Something went wrong' }),
  })
  .openapi('ErrorResponse');

export const ProductSchema = z
  .object({
    id: z.string().uuid().openapi({ example: '9a7f2f3a-3f9d-4a0b-9d4a-123456789abc' }),
    name: z.string().min(1).openapi({ example: 'Mixed Teff Injera – 4 pieces' }),
    description: z
      .string()
      .min(1)
      .openapi({ example: 'Blend of brown & ivory teff for a balanced flavor. 4 pieces pack.' }),
    unitPrice: z.number().int().min(0).openapi({ example: 1400 }),
    isEnabled: z.boolean().openapi({ example: true }),
    sku: z.string().min(1).openapi({ example: 'TS-001' }),
  })
  .openapi('Product');

export const ProductWithRelations = ProductSchema.openapi('ProductWithRelations');

export const CreateProductSchema = z
  .object({
    name: z.string().min(1).openapi({ example: 'Mixed Teff Injera – 4 pieces' }),
    description: z
      .string()
      .min(1)
      .openapi({ example: 'Blend of brown & ivory teff for a balanced flavor. 4 pieces pack.' }),
    unitPrice: z.number().int().min(0).openapi({ example: 1400 }),
    isEnabled: z.boolean().default(true).openapi({ example: true }),
    sku: z.string().min(1).openapi({ example: 'TS-001' }),
  })
  .openapi('CreateProduct');

export const UpdateProductSchema = CreateProductSchema.partial().openapi('UpdateProduct');

export const ProductListResponseSchema = z
  .object({
    items: z.array(ProductWithRelations),
  })
  .openapi('ProductListResponse');

export const ProductDetailResponseSchema = z
  .object({
    data: ProductWithRelations,
  })
  .openapi('ProductDetailResponse');
