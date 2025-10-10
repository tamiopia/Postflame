import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Example: In the future, parse Zod schemas dynamically.
// For now, return a default JSON body schema.
export function parseZodSchema() {
  const exampleSchema = z.object({
    name: z.string(),
    price: z.number()
  });

  return zodToJsonSchema(exampleSchema);
}
