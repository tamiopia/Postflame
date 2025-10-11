// TODO: Parse Zod v4 schemas into JSON Schema or OpenAPI schema if needed.
// For now, return a minimal static JSON Schema used as a request body example.
export function parseZodSchema() {
  return {
    type: 'object',
    properties: {
      name: { type: 'string' },
      price: { type: 'number' }
    },
    required: ['name', 'price'],
    additionalProperties: false,
    $schema: 'http://json-schema.org/draft-07/schema#'
  };
}
