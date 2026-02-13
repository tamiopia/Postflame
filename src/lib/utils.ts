// @ts-nocheck
import path from 'path';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

function normalizePath(p) {
  if (!p) return '/';
  let out = p.trim();
  if (!out.startsWith('/')) out = `/${out}`;
  out = out.replace(/\/+/g, '/');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

function joinPaths(base, child) {
  const a = normalizePath(base || '/');
  const b = normalizePath(child || '/');
  if (a === '/') return b;
  if (b === '/') return a;
  return normalizePath(`${a}/${b}`);
}

function extractPathParams(p) {
  const params = new Set();
  const doubleBraceMatches = p.match(/{{([A-Za-z0-9_]+)}}/g) || [];
  for (const m of doubleBraceMatches) params.add(m.slice(2, -2));
  const colonMatches = p.match(/:([A-Za-z0-9_]+)/g) || [];
  for (const m of colonMatches) params.add(m.slice(1));
  const braceMatches = p.match(/{([A-Za-z0-9_]+)}/g) || [];
  for (const m of braceMatches) params.add(m.slice(1, -1));
  return Array.from(params);
}

function toPostmanPath(p) {
  // Convert :param and {param} to {{param}} for Postman variables
  const normalized = normalizePath(p)
    .replace(/:([A-Za-z0-9_]+)/g, '{{$1}}');

  return normalized.replace(/{([A-Za-z0-9_]+)}/g, (match, name, offset, full) => {
    const before = full[offset - 1];
    const after = full[offset + match.length];
    if (before === '{' || after === '}') return match;
    return `{{${name}}}`;
  });
}

function splitPath(p) {
  // Keep {{param}} intact when splitting
  return normalizePath(p).split('/').filter(Boolean);
}

function toKey(method, pathStr) {
  return `${method.toUpperCase()} ${normalizePath(pathStr)}`;
}

function isJsOrTs(filePath) {
  if (filePath.endsWith('.d.ts') || filePath.endsWith('.d.tsx')) return false;
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.js' || ext === '.ts' || ext === '.jsx' || ext === '.tsx';
}

export {
  HTTP_METHODS,
  normalizePath,
  joinPaths,
  extractPathParams,
  toPostmanPath,
  splitPath,
  toKey,
  isJsOrTs
};
