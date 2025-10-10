import { Hono } from 'hono';
import fs from 'fs';
import { parseZodSchema } from '../parser/zodParser.js';

export function generatePostmanCollection(app: Hono, name = 'Hono API') {
  const routes = app.routes.map(route => ({
    method: route.method,
    path: route.path
  }));

  const collection = {
    info: {
      name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: routes.map(r => ({
      name: `${r.method} ${r.path}`,
      request: {
        method: r.method,
        header: [],
        body: r.method === 'POST' || r.method === 'PUT'
          ? { mode: 'raw', raw: JSON.stringify(parseZodSchema(), null, 2) }
          : undefined,
        url: {
          raw: `{{baseUrl}}${r.path}`,
          host: ['{{baseUrl}}'],
          path: r.path.split('/').filter(Boolean)
        }
      }
    }))
  };

  return collection;
}

export function saveCollectionToFile(collection: any, outputPath: string) {
  fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
  console.log(`✅ Postman collection saved to ${outputPath}`);
}
