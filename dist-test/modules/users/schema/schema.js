import { z } from '@hono/zod-openapi';
export const ErrorResponseSchema = z
    .object({ message: z.string().openapi({ example: 'Not found' }) })
    .openapi('UserErrorResponse');
export const UserSchema = z
    .object({
    id: z.string().uuid().openapi({ example: '3a9f51e1-4df3-4e0c-9a2f-123456789abc' }),
    name: z.string().min(1).openapi({ example: 'Alice' }),
    email: z.string().email().openapi({ example: 'alice@example.com' }),
    age: z.number().int().optional().openapi({ example: 30 }),
})
    .openapi('User');
export const CreateUserSchema = z
    .object({
    name: z.string().min(1).openapi({ example: 'Alice' }),
    email: z.string().email().openapi({ example: 'alice@example.com' }),
    age: z.number().int().optional().openapi({ example: 30 }),
})
    .openapi('CreateUser');
export const UpdateUserSchema = CreateUserSchema.partial().openapi('UpdateUser');
export const UserListResponseSchema = z
    .object({ items: z.array(UserSchema) })
    .openapi('UserListResponse');
export const UserDetailResponseSchema = z
    .object({ data: UserSchema })
    .openapi('UserDetailResponse');
