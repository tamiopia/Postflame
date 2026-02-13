import { Hono } from 'hono';
import fs from 'fs';
import { parseZodSchema } from '../parser/zodParser.js';

export interface GenerateCollectionOptions {
  baseUrl?: string;
  appBaseUrls?: Record<string, string>;
}

export interface AppCollectionInput {
  app: Hono | any;
  appName: string;
  filePath?: string;
}

interface NormalizedAppUrl {
  key: string;
  varKey: string;
  url: string;
}

const DEFAULT_BASE_URL = 'http://localhost:3000/api';

function normalizeAppKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeVariableKey(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'app';
}

function normalizeAppUrls(appBaseUrls: Record<string, string> = {}): NormalizedAppUrl[] {
  return Object.entries(appBaseUrls)
    .map(([appName, url]) => {
      const name = String(appName || '').trim();
      const normalized = normalizeAppKey(name);
      const cleanUrl = String(url || '').trim();
      if (!name || !normalized || !cleanUrl) return null;
      return {
        key: normalized,
        varKey: `baseUrl_${normalizeVariableKey(name)}`,
        url: cleanUrl
      };
    })
    .filter((entry): entry is NormalizedAppUrl => !!entry);
}

function buildCollectionVariables(baseUrl: string, appUrls: NormalizedAppUrl[]): Array<{ key: string; value: string; type: string }> {
  const variables: Array<{ key: string; value: string; type: string }> = [
    { key: 'baseUrl', value: baseUrl, type: 'string' },
    { key: 'authToken', value: '', type: 'string' },
    { key: 'userId', value: '', type: 'string' },
    { key: 'orderId', value: '', type: 'string' },
    { key: 'wholesaleCustomerId', value: '', type: 'string' }
  ];

  for (const app of appUrls) {
    variables.push({
      key: app.varKey,
      value: app.url,
      type: 'string'
    });
  }

  return variables;
}

function normalizePath(pathValue: string): string {
  const value = String(pathValue || '/').trim() || '/';
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.replace(/\/+/g, '/').replace(/\/\/$/, '') || '/';
}

function toDisplayPath(pathValue: string): string {
  return normalizePath(pathValue)
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}')
    .replace(/{{([A-Za-z0-9_]+)}}/g, '{$1}');
}

function toPostmanPath(pathValue: string): string {
  return normalizePath(pathValue)
    .replace(/:([A-Za-z0-9_]+)/g, '{{$1}}')
    .replace(/\{([A-Za-z0-9_]+)\}/g, '{{$1}}');
}

function splitPath(pathValue: string): string[] {
  return normalizePath(pathValue)
    .split('/')
    .filter(Boolean);
}

function extractPathParams(pathValue: string): string[] {
  const params = new Set<string>();
  const matches = pathValue.match(/{{([A-Za-z0-9_]+)}}/g) || [];
  for (const match of matches) {
    params.add(match.slice(2, -2));
  }
  return Array.from(params.values());
}

function extractFormDataFromSchema(schema: any): any[] {
  if (!schema || schema.type !== 'object' || !schema.properties) return [];
  return Object.entries<any>(schema.properties).map(([key, prop]) => {
    const isFile = prop.format === 'binary' || (prop.type === 'string' && prop.format === 'byte');
    return {
      key,
      type: isFile ? 'file' : 'text',
      value: prop.example || prop.default || '',
      description: prop.description
    };
  });
}

function extractUrlEncodedFromSchema(schema: any): any[] {
  if (!schema || schema.type !== 'object' || !schema.properties) return [];
  return Object.entries<any>(schema.properties).map(([key, prop]) => ({
    key,
    value: prop.example || prop.default || '',
    description: prop.description,
    type: 'text'
  }));
}

function queryParametersFromOpenApi(methods: any, operation: any): Array<{ key: string; value: string; description?: string }> {
  const parameters = [...(methods?.parameters || []), ...(operation?.parameters || [])];
  return parameters
    .filter((param: any) => param && param.in === 'query')
    .map((param: any) => ({
      key: param.name,
      value: param.example !== undefined ? String(param.example) : '',
      description: param.description
    }));
}

function bodyFromOpenApi(operation: any): any {
  const content = operation?.requestBody?.content || {};

  if (content['application/json']) {
    const json = content['application/json'];
    if (json.example) {
      return { mode: 'raw', raw: JSON.stringify(json.example, null, 2) };
    }
    if (json.examples && Object.keys(json.examples).length > 0) {
      const first = json.examples[Object.keys(json.examples)[0]];
      if (first && first.value !== undefined) {
        return { mode: 'raw', raw: JSON.stringify(first.value, null, 2) };
      }
    }
    if (json.schema) {
      return { mode: 'raw', raw: JSON.stringify(json.schema, null, 2) };
    }
  }

  if (content['multipart/form-data']) {
    return {
      mode: 'formdata',
      formdata: extractFormDataFromSchema(content['multipart/form-data'].schema)
    };
  }

  if (content['application/x-www-form-urlencoded']) {
    return {
      mode: 'urlencoded',
      urlencoded: extractUrlEncodedFromSchema(content['application/x-www-form-urlencoded'].schema)
    };
  }

  return undefined;
}

function responsesFromOpenApi(operation: any): any[] {
  const responses: any[] = [];

  for (const [code, response] of Object.entries<any>(operation?.responses || {})) {
    const codeValue = String(code);
    const statusCode = /^\d{3}$/.test(codeValue) ? Number(codeValue) : 200;
    const json = response?.content?.['application/json'];
    let body = '';

    if (json?.example) {
      body = JSON.stringify(json.example, null, 2);
    } else if (json?.examples) {
      const first = Object.values<any>(json.examples)[0];
      if (first && first.value !== undefined) {
        body = JSON.stringify(first.value, null, 2);
      }
    } else if (json?.schema) {
      body = JSON.stringify(json.schema, null, 2);
    }

    responses.push({
      name: `${code} response`,
      status: response?.description || 'OK',
      code: statusCode,
      header: [],
      body
    });
  }

  return responses;
}

function openApiToItems(openapi: any, baseVarToken: string): any[] {
  const paths = openapi?.paths || {};
  const folders = new Map<string, any[]>();

  const ensureFolder = (name: string) => {
    if (!folders.has(name)) {
      folders.set(name, []);
    }
    return folders.get(name)!;
  };

  for (const [rawPath, methods] of Object.entries<any>(paths)) {
    for (const [method, operation] of Object.entries<any>(methods || {})) {
      const httpMethod = String(method).toUpperCase();
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(httpMethod)) {
        continue;
      }

      const tags: string[] = Array.isArray(operation?.tags) && operation.tags.length > 0
        ? operation.tags
        : ['General'];

      const postmanPath = toPostmanPath(rawPath);
      const displayPath = toDisplayPath(rawPath);
      const query = queryParametersFromOpenApi(methods, operation);
      const body = bodyFromOpenApi(operation);
      const responses = responsesFromOpenApi(operation);
      const summary = operation?.summary || `${httpMethod} ${displayPath}`;
      const description = [operation?.summary, operation?.description].filter(Boolean).join('\n\n');

      const headers: any[] = [];
      if (body && body.mode === 'raw') {
        headers.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
      }

      const variables = extractPathParams(postmanPath).map((param) => ({ key: param, value: '' }));

      const request: any = {
        method: httpMethod,
        header: headers,
        url: {
          raw: `${baseVarToken}${postmanPath}`,
          host: [baseVarToken],
          path: splitPath(postmanPath),
          query: query.length > 0 ? query : undefined,
          variable: variables.length > 0 ? variables : undefined
        },
        description
      };

      if (body) {
        request.body = body;
      }

      const item = {
        name: `${summary} - ${httpMethod} ${displayPath}`,
        request,
        response: responses.length > 0 ? responses : undefined
      };

      for (const tag of tags) {
        ensureFolder(tag).push(item);
      }
    }
  }

  return Array.from(folders.entries()).map(([name, item]) => ({ name, item }));
}

function fallbackRoutesToItems(app: any, baseVarToken: string): any[] {
  const routes = Array.isArray(app?.routes)
    ? app.routes.map((route: any) => ({ method: route.method, path: route.path }))
    : [];

  const dedup = new Map<string, { method: string; path: string }>();
  for (const route of routes) {
    const method = String(route?.method || '').toUpperCase();
    const pathValue = normalizePath(String(route?.path || '/'));
    dedup.set(`${method} ${pathValue}`, { method, path: pathValue });
  }

  return Array.from(dedup.values()).map((route) => {
    const postmanPath = toPostmanPath(route.path);
    const displayPath = toDisplayPath(route.path);
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(route.method);
    const request: any = {
      method: route.method,
      header: hasBody ? [{ key: 'Content-Type', value: 'application/json', type: 'text' }] : [],
      url: {
        raw: `${baseVarToken}${postmanPath}`,
        host: [baseVarToken],
        path: splitPath(postmanPath),
        variable: extractPathParams(postmanPath).map((param) => ({ key: param, value: '' }))
      }
    };

    if (hasBody) {
      request.body = {
        mode: 'raw',
        raw: JSON.stringify(parseZodSchema(), null, 2)
      };
    }

    return {
      name: `${route.method} ${displayPath}`,
      request
    };
  });
}

async function readOpenApiFromApp(app: any): Promise<any | null> {
  const candidates = ['/api/doc', '/doc', '/openapi.json', '/api/openapi', '/openapi'];

  for (const route of candidates) {
    try {
      const response = await app?.request?.(route);
      if (!response || !response.ok) continue;
      const openapi = await response.json();
      if (openapi && typeof openapi === 'object' && openapi.paths) {
        return openapi;
      }
    } catch {
      // Ignore and continue with next candidate
    }
  }

  return null;
}

async function buildAppItems(app: any, baseVarToken: string): Promise<any[]> {
  const openapi = await readOpenApiFromApp(app);
  if (openapi) {
    return openApiToItems(openapi, baseVarToken);
  }
  return fallbackRoutesToItems(app, baseVarToken);
}

function normalizeInputs(input: Hono | AppCollectionInput | AppCollectionInput[]): AppCollectionInput[] {
  if (Array.isArray(input)) {
    return input.map((entry, index) => ({
      app: entry.app,
      appName: entry.appName || `App ${index + 1}`,
      filePath: entry.filePath
    }));
  }

  if (input && typeof input === 'object' && 'app' in input && (input as AppCollectionInput).app) {
    const single = input as AppCollectionInput;
    return [{
      app: single.app,
      appName: single.appName || 'App',
      filePath: single.filePath
    }];
  }

  return [{ app: input as Hono, appName: 'App' }];
}

export async function generatePostmanCollection(
  input: Hono | AppCollectionInput | AppCollectionInput[],
  name = 'Hono API',
  options: GenerateCollectionOptions = {}
) {
  const baseUrl = options.baseUrl || DEFAULT_BASE_URL;
  const apps = normalizeInputs(input);
  const appUrls = normalizeAppUrls(options.appBaseUrls || {});
  const appVarByKey = new Map(appUrls.map((entry) => [entry.key, entry.varKey]));

  const topLevelItems: any[] = [];

  for (const entry of apps) {
    const appKey = normalizeAppKey(entry.appName);
    const baseVarKey = appVarByKey.get(appKey) || 'baseUrl';
    const baseVarToken = `{{${baseVarKey}}}`;
    const items = await buildAppItems(entry.app, baseVarToken);

    if (apps.length > 1) {
      topLevelItems.push({
        name: entry.appName,
        item: items
      });
    } else {
      topLevelItems.push(...items);
    }
  }

  return {
    info: {
      name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: buildCollectionVariables(baseUrl, appUrls),
    item: topLevelItems
  };
}

export function saveCollectionToFile(collection: any, outputPath: string) {
  fs.writeFileSync(outputPath, JSON.stringify(collection, null, 2));
  console.log(`✅ Postman collection saved to ${outputPath}`);
}
