// @ts-nocheck
import { extractNestJsEndpoints } from './nestjs.js';
import { extractExpressEndpoints } from './express.js';
import { extractHonoEndpoints } from './hono.js';

async function extractEndpoints(filePath, framework) {
  if (framework === 'nestjs') {
    try {
      return await extractNestJsEndpoints(filePath);
    } catch {
      return [];
    }
  }
  if (framework === 'express') {
    try {
      return await extractExpressEndpoints(filePath);
    } catch {
      return [];
    }
  }
  if (framework === 'hono') return [];
  // auto: try NestJS then Express
  let nest = [];
  let exp = [];
  try {
    nest = await extractNestJsEndpoints(filePath);
  } catch {
    nest = [];
  }
  try {
    exp = await extractExpressEndpoints(filePath);
  } catch {
    exp = [];
  }
  const map = new Map();
  for (const e of [...nest, ...exp]) map.set(e.key, e);
  return Array.from(map.values());
}

async function extractAllEndpoints(files, framework) {
  if (framework === 'hono') {
    return extractHonoEndpoints(files);
  }

  if (framework === 'auto') {
    const hono = await extractHonoEndpoints(files);
    if (hono.length) return hono;
  }

  const endpoints = [];
  for (const file of files) {
    const extracted = await extractEndpoints(file, framework);
    endpoints.push(...extracted);
  }
  return endpoints;
}

export { extractEndpoints, extractAllEndpoints };
