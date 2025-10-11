import { z } from 'zod';

export const SearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(10),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
