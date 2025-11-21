import { Hono } from 'hono';
import fs from 'fs';
import { parseZodSchema } from '../parser/zodParser.js';

export async function generatePostmanCollection(app: Hono, name = 'Hono API') {
  // Try to read OpenAPI JSON from the app's doc endpoint
  try {
    const res = await (app as any).request?.('/api/doc');
    if (res && res.ok) {
      const openapi = await res.json();
      return openApiToPostman(openapi, name);
    }
  } catch (error) {
    console.warn('⚠️  Failed to fetch OpenAPI doc, using fallback parsing:', (error as Error).message);
  }

  // Fallback: route-based generation (no schemas)
  const routes = app.routes.map((route) => ({ method: route.method, path: route.path }));
  const dedup = new Map<string, { method: string; path: string }>();
  for (const r of routes) dedup.set(`${r.method} ${r.path}`, r);

  const collection = {
    info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: Array.from(dedup.values()).map((r) => ({
      name: `${r.method} ${r.path}`,
      request: {
        method: r.method,
        header: [],
        body:
          r.method === 'POST' || r.method === 'PUT' || r.method === 'PATCH'
            ? { mode: 'raw', raw: JSON.stringify(parseZodSchema(), null, 2) }
            : undefined,
        url: {
          raw: `{{baseUrl}}${r.path}`,
          host: ['{{baseUrl}}'],
          path: r.path.split('/').filter(Boolean),
        },
      },
    })),
  };

  return collection;
}

function openApiToPostman(openapi: any, name: string) {
  const paths = openapi.paths || {};
  const folders = new Map<string, any[]>();
  const ensureFolder = (tag: string) => {
    if (!folders.has(tag)) folders.set(tag, []);
    return folders.get(tag)!;
  };

  for (const [rawPath, methods] of Object.entries<any>(paths)) {
    for (const [method, op] of Object.entries<any>(methods)) {
      const httpMethod = String(method).toUpperCase();
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(httpMethod)) continue;

      const tagList: string[] = Array.isArray(op.tags) && op.tags.length ? op.tags : ['General'];

      // Handle path params: convert {id} -> :id for readability
      const pmPath = String(rawPath).replace(/\{(.*?)\}/g, ':$1');
      const urlPath = pmPath.split('/').filter(Boolean);

      // Query params from both path-level and operation-level parameters
      const parameters = [...(methods.parameters || []), ...(op.parameters || [])];
      const queryParams = parameters
        .filter((p: any) => p && p.in === 'query')
        .map((p: any) => ({ key: p.name, value: p.example || '', description: p.description }));

      // Build request body from supported content types, prioritizing examples
      let body: any = undefined;
      const content = op.requestBody?.content || {};
      if (content['application/json']) {
        const json = content['application/json'];
        // Prioritize example over schema
        if (json.example) {
          body = { mode: 'raw', raw: JSON.stringify(json.example, null, 2) };
        } else if (json.examples && Object.keys(json.examples).length > 0) {
          // Use the first example if multiple are available
          const firstExampleKey = Object.keys(json.examples)[0];
          const firstExample = json.examples[firstExampleKey];
          if (firstExample.value) {
            body = { mode: 'raw', raw: JSON.stringify(firstExample.value, null, 2) };
          } else {
            body = { mode: 'raw', raw: JSON.stringify(json.schema, null, 2) };
          }
        } else if (json.schema) {
          body = { mode: 'raw', raw: JSON.stringify(json.schema, null, 2) };
        }
      } else if (content['multipart/form-data']) {
        const mp = content['multipart/form-data'];
        body = { mode: 'formdata', formdata: extractFormDataFromSchema(mp.schema) };
      } else if (content['application/x-www-form-urlencoded']) {
        const urlenc = content['application/x-www-form-urlencoded'];
        body = { mode: 'urlencoded', urlencoded: extractUrlEncodedFromSchema(urlenc.schema) };
      }

      // Saved responses from OpenAPI responses
      const responses: any[] = [];
      for (const [code, resp] of Object.entries<any>(op.responses || {})) {
        const codeStr = String(code);
        const statusCode = /^\d{3}$/.test(codeStr) ? Number(codeStr) : 200;
        const json = resp?.content?.['application/json'];
        let bodyStr = '';
        if (json?.example) bodyStr = JSON.stringify(json.example, null, 2);
        else if (json?.examples) {
          const first = Object.values<any>(json.examples)[0];
          if (first?.value) bodyStr = JSON.stringify(first.value, null, 2);
        } else if (json?.schema) bodyStr = JSON.stringify(json.schema, null, 2);

        responses.push({
          name: `${code} response`,
          originalRequest: undefined,
          status: resp.description || 'OK',
          code: statusCode,
          header: [],
          body: bodyStr,
        });
      }

      const item = {
        name: `${httpMethod} ${pmPath}`,
        request: {
          method: httpMethod,
          header: [],
          body,
          url: {
            raw: `{{baseUrl}}${pmPath}`,
            host: ['{{baseUrl}}'],
            path: urlPath,
            query: queryParams.length ? queryParams : undefined,
          },
        },
        response: responses.length ? responses : undefined,
      };

      // Add to folders based on tags
      for (const tag of tagList) {
        ensureFolder(tag).push(item);
      }
    }
  }

  // Build top-level folder items
  const collectionItems = Array.from(folders.entries()).map(([tag, tagItems]) => ({
    name: tag,
    item: tagItems,
  }));

  return {
    info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: collectionItems,
  };
}

function extractFormDataFromSchema(schema: any): any[] {
  // Basic schema -> Postman formdata mapping
  if (!schema || schema.type !== 'object' || !schema.properties) return [];
  const required: string[] = schema.required || [];
  return Object.entries<any>(schema.properties).map(([key, prop]) => {
    const isFile = prop.format === 'binary' || prop.type === 'string' && prop.format === 'byte';
    return {
      key,
      type: isFile ? 'file' : 'text',
      value: prop.example || prop.default || '',
      description: prop.description,
      disabled: required.includes(key) ? false : false,
    };
  });
}

function extractUrlEncodedFromSchema(schema: any): any[] {
  if (!schema || schema.type !== 'object' || !schema.properties) return [];
  return Object.entries<any>(schema.properties).map(([key, prop]) => ({
    key,
    value: prop.example || prop.default || '',
    description: prop.description,
    type: 'text',
  }));
}

export function saveCollectionToFile(collection: any, outputPath: string) {
  fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
  console.log(`✅ Postman collection saved to ${outputPath}`);
}