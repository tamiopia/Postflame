// @ts-nocheck
import { buildInsomniaCollection } from '../collection/insomnia.js';
import { normalizePath } from '../lib/utils.js';

function mergeInsomniaCollection(endpoints, config, existing) {
  const generated = buildInsomniaCollection(endpoints, config);
  if (!existing || !existing.resources) return generated;

  const generatedRequests = generated.resources.filter((r) => r._type === 'request');
  const existingRequests = existing.resources.filter((r) => r._type === 'request');

  const existingMap = new Map();
  for (const req of existingRequests) {
    const key = keyFromRequest(req);
    if (key) existingMap.set(key, req);
  }

  const mergedRequests = [];
  for (const req of generatedRequests) {
    const key = keyFromRequest(req);
    if (key && existingMap.has(key)) {
      mergedRequests.push(mergeRequest(req, existingMap.get(key)));
    } else {
      mergedRequests.push(req);
    }
  }

  if (config.merge && config.merge.markDeprecated) {
    for (const [key, req] of existingMap.entries()) {
      if (!generatedRequests.find((r) => keyFromRequest(r) === key)) {
        const deprecated = { ...req };
        deprecated.name = deprecated.name.startsWith('[DEPRECATED]')
          ? deprecated.name
          : `[DEPRECATED] ${deprecated.name}`;
        mergedRequests.push(deprecated);
      }
    }
  }

  const nonRequestResources = generated.resources.filter((r) => r._type !== 'request');

  return {
    ...existing,
    resources: [...nonRequestResources, ...mergedRequests]
  };
}

function keyFromRequest(req) {
  if (!req || !req.method || !req.url) return null;
  const url = req.url.replace(/\{\{\s*_.baseUrl\s*\}\}/i, '');
  return `${req.method.toUpperCase()} ${normalizePath(url)}`;
}

function mergeRequest(newReq, existingReq) {
  return {
    ...existingReq,
    name: newReq.name || existingReq.name,
    method: newReq.method || existingReq.method,
    url: newReq.url || existingReq.url,
    headers: mergeHeaders(newReq.headers || [], existingReq.headers || []),
    body: newReq.body || existingReq.body
  };
}

function mergeHeaders(codeHeaders, existingHeaders) {
  const map = new Map();
  for (const h of existingHeaders) {
    if (!h || !h.name) continue;
    map.set(h.name.toLowerCase(), h);
  }
  for (const h of codeHeaders) {
    if (!h || !h.name) continue;
    map.set(h.name.toLowerCase(), h);
  }
  return Array.from(map.values());
}

export { mergeInsomniaCollection };
