// @ts-nocheck
import { nanoid } from 'nanoid';
import path from 'path';
import { normalizePath, toPostmanPath, splitPath, extractPathParams } from '../lib/utils.js';

const DEFAULT_COLLECTION_NAME = 'API Collection';
const UUID_SAMPLE = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const DEFAULT_BASE_URL = 'http://localhost:3000/api';

function normalizeAppName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function normalizeAppVariableKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'app';
}

function resolveAppBaseUrls(config) {
  const configured = config && config.sources && config.sources.appBaseUrls;
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) {
    return [];
  }

  return Object.entries(configured)
    .map(([name, url]) => [String(name || '').trim(), String(url || '').trim()])
    .filter(([name, url]) => !!name && !!url);
}

function resolveBaseUrl(config, appBaseUrls) {
  if (config && config.sources && config.sources.baseUrl) return config.sources.baseUrl;
  if (appBaseUrls.length) return appBaseUrls[0][1];
  return DEFAULT_BASE_URL;
}

function buildAppBaseUrlMap(appBaseUrls) {
  const appVarMap = new Map();
  for (const [appName] of appBaseUrls) {
    const appKey = normalizeAppName(appName);
    if (!appKey) continue;
    appVarMap.set(appKey, `baseUrl_${normalizeAppVariableKey(appName)}`);
  }
  return appVarMap;
}

function resolveEndpointBaseVarKey(endpoint, appVarMap) {
  if (!appVarMap || appVarMap.size === 0) return 'baseUrl';

  const directApp = normalizeAppName(endpoint.app);
  if (directApp && appVarMap.has(directApp)) {
    return appVarMap.get(directApp);
  }

  const filePath = String(endpoint.filePath || '');
  if (!filePath) return 'baseUrl';

  const segments = filePath.split(path.sep).filter(Boolean);
  for (let i = 0; i < segments.length; i += 1) {
    const current = segments[i].toLowerCase();
    if ((current === 'apps' || current === 'services') && segments[i + 1]) {
      const appName = normalizeAppName(segments[i + 1]);
      if (appVarMap.has(appName)) return appVarMap.get(appName);
    }
  }

  for (const segment of segments) {
    const appName = normalizeAppName(segment);
    if (appVarMap.has(appName)) return appVarMap.get(appName);
  }

  return 'baseUrl';
}

function buildPostmanCollection(endpoints, config) {
  const name = (config.output && config.output.postman && config.output.postman.collectionName) || DEFAULT_COLLECTION_NAME;
  const appBaseUrls = resolveAppBaseUrls(config);
  const baseUrl = resolveBaseUrl(config, appBaseUrls);
  const appVarMap = buildAppBaseUrlMap(appBaseUrls);
  const appFolderOrder = appBaseUrls.map(([name]) => cleanLabel(name));
  const groupBy = (config.organization && config.organization.groupBy) || 'folder';

  const items = groupBy === 'folder'
    ? buildFolderItems(endpoints, appVarMap, appFolderOrder)
    : buildTaggedItems(endpoints, appVarMap);

  const variables = [
    { key: 'baseUrl', value: baseUrl, type: 'string' },
    { key: 'authToken', value: '', type: 'string' },
    { key: 'userId', value: '', type: 'string' },
    { key: 'orderId', value: '', type: 'string' },
    { key: 'wholesaleCustomerId', value: '', type: 'string' }
  ];

  for (const [appName, appUrl] of appBaseUrls) {
    variables.push({
      key: `baseUrl_${normalizeAppVariableKey(appName)}`,
      value: appUrl,
      type: 'string'
    });
  }

  return {
    info: {
      _postman_id: nanoid(),
      name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    variable: variables,
    item: items
  };
}

function buildFolderItems(endpoints, appVarMap, appFolderOrder = []) {
  const root = { item: [], _folders: new Map() };

  for (const endpoint of endpoints) {
    const folderSegments = deriveFolderSegments(endpoint, appVarMap);
    insertIntoFolderTree(root, folderSegments, buildItem(endpoint, appVarMap));
  }

  const built = finalizeFolderTree(root.item);
  return sortTopLevelFoldersByAppOrder(built, appFolderOrder);
}

function insertIntoFolderTree(root, segments, requestItem) {
  const safeSegments = Array.isArray(segments) && segments.length
    ? segments
    : ['General'];

  let node = root;
  for (const segment of safeSegments) {
    const name = cleanLabel(segment || 'General');
    if (!node._folders.has(name)) {
      const folder = { name, item: [], _folders: new Map() };
      node._folders.set(name, folder);
      node.item.push(folder);
    }
    node = node._folders.get(name);
  }

  node.item.push(requestItem);
}

function finalizeFolderTree(items) {
  return (items || []).map((item) => {
    if (item && item._folders) {
      const out = { ...item, item: finalizeFolderTree(item.item) };
      delete out._folders;
      return out;
    }
    return item;
  });
}

function sortTopLevelFoldersByAppOrder(items, appFolderOrder) {
  if (!Array.isArray(appFolderOrder) || appFolderOrder.length === 0) {
    return items;
  }

  const order = new Map();
  appFolderOrder.forEach((name, idx) => {
    order.set(String(name || '').toLowerCase(), idx);
  });

  return [...items].sort((a, b) => {
    const aIdx = order.has(String(a && a.name || '').toLowerCase())
      ? order.get(String(a && a.name || '').toLowerCase())
      : Number.MAX_SAFE_INTEGER;
    const bIdx = order.has(String(b && b.name || '').toLowerCase())
      ? order.get(String(b && b.name || '').toLowerCase())
      : Number.MAX_SAFE_INTEGER;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return String(a && a.name || '').localeCompare(String(b && b.name || ''));
  });
}

function buildTaggedItems(endpoints, appVarMap) {
  const groups = new Map();
  for (const endpoint of endpoints) {
    const tags = endpoint.tags && endpoint.tags.length ? endpoint.tags : ['General'];
    const tag = cleanLabel(tags[0] || 'General');
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push(buildItem(endpoint, appVarMap));
  }

  const items = [];
  for (const [name, groupItems] of groups.entries()) {
    items.push({ name, item: groupItems });
  }
  return items;
}

function buildItem(endpoint, appVarMap) {
  const originalPath = normalizePath(endpoint.path || '/');
  const postmanPath = toPostmanPath(originalPath);
  const displayPath = toDisplayPath(originalPath);
  const baseVarKey = resolveEndpointBaseVarKey(endpoint, appVarMap);
  const baseVarToken = `{{${baseVarKey}}}`;

  const queryParams = buildQueryParams((endpoint.parameters && endpoint.parameters.query) || []);
  const pathVariables = buildPathVariables(postmanPath, endpoint);
  const bodySchema = endpoint.parameters && endpoint.parameters.body ? endpoint.parameters.body : null;
  const hasBody = !!bodySchema;

  const headers = [];
  if (hasBody) {
    headers.push({ key: 'Content-Type', value: 'application/json', type: 'text' });
  }

  if (needsAuthorization(endpoint, postmanPath)) {
    headers.push({ key: 'Authorization', value: 'Bearer {{authToken}}', type: 'text' });
  }

  const rawUrl = buildRawUrl(postmanPath, queryParams, baseVarToken);
  const url = {
    raw: rawUrl,
    host: [baseVarToken],
    path: splitPath(postmanPath)
  };

  if (queryParams.length) {
    url.query = queryParams;
  }

  if (pathVariables.length) {
    url.variable = pathVariables;
  }

  const method = String(endpoint.method || 'GET').toUpperCase();
  const summary = resolveSummary(endpoint);
  const description = buildRequestDescription(endpoint, summary);

  const request = {
    method,
    header: headers,
    url,
    description
  };

  if (hasBody) {
    request.body = {
      mode: 'raw',
      raw: JSON.stringify(exampleFromSchema(bodySchema), null, 2)
    };
  }

  return {
    name: `${summary} - ${method} ${displayPath}`,
    request
  };
}

function deriveFolderName(endpoint) {
  if (endpoint.filePath) {
    const parts = endpoint.filePath.split(path.sep).filter(Boolean);
    const filename = parts[parts.length - 1] || '';
    const parent = parts[parts.length - 2] || '';
    const grandparent = parts[parts.length - 3] || '';
    const base = filename.replace(/\.(t|j)sx?$/i, '');

    if (base === 'routes') return cleanLabel(parent || grandparent || 'General');

    if (base.endsWith('.routes')) {
      if (parent === 'routes' && grandparent) return cleanLabel(grandparent);
      const routeStem = base.replace(/\.routes$/i, '');
      if (routeStem && routeStem !== 'index') return cleanLabel(routeStem);
      return cleanLabel(parent || grandparent || 'General');
    }

    if (base.endsWith('.controller')) {
      const controllerStem = base.replace(/\.controller$/i, '');
      if ((parent === 'controllers' || parent === 'controller') && grandparent) {
        return cleanLabel(grandparent);
      }
      if (parent && !['src', 'modules', 'module'].includes(parent.toLowerCase())) {
        return cleanLabel(parent);
      }
      const grpcStem = controllerStem.replace(/^grpc[._-]?/i, '');
      if (grpcStem && grpcStem !== 'index') return cleanLabel(grpcStem);
      return cleanLabel(controllerStem || grandparent || 'General');
    }

    if (parent === 'routes') {
      return cleanLabel(base || grandparent || 'General');
    }

    if (parent) {
      if (parent === 'routes' && grandparent) return cleanLabel(grandparent);
      return cleanLabel(parent);
    }
  }

  if (endpoint.tags && endpoint.tags.length) {
    return cleanLabel(endpoint.tags[0]);
  }

  return cleanLabel(inferDomainFromPath(endpoint.path || '/'));
}

function deriveFolderSegments(endpoint, appVarMap) {
  const filePath = String(endpoint && endpoint.filePath ? endpoint.filePath : '');
  const appSegments = deriveAppAndModuleSegments(filePath, appVarMap);
  if (appSegments.length) return appSegments;

  if (endpoint.tags && endpoint.tags.length) {
    return [cleanLabel(endpoint.tags[0])];
  }

  return [deriveFolderName(endpoint)];
}

function splitFilePathSegments(filePath) {
  return String(filePath || '').split(/[\\/]+/).filter(Boolean);
}

function normalizeLookupName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function deriveAppAndModuleSegments(filePath, appVarMap) {
  if (!filePath) return [];

  const segments = splitFilePathSegments(filePath);
  if (!segments.length) return [];

  const knownApps = new Set(Array.from((appVarMap && appVarMap.keys()) || []).map(normalizeLookupName));
  const appInfo = detectAppFromPath(segments, knownApps);
  if (!appInfo || !appInfo.appNameRaw) return [];

  const appName = cleanLabel(appInfo.appNameRaw);
  const moduleSegments = deriveModuleSegmentsFromPath(segments, appInfo);

  const out = [appName];
  for (const segment of moduleSegments) {
    const cleaned = cleanLabel(segment);
    if (!cleaned) continue;
    if (cleaned.toLowerCase() === appName.toLowerCase()) continue;
    if (out.length && cleaned.toLowerCase() === out[out.length - 1].toLowerCase()) continue;
    out.push(cleaned);
  }

  if (out.length === 1) out.push('App');
  return out;
}

function detectAppFromPath(segments, knownApps) {
  const markers = new Set(['apps', 'services']);
  for (let i = 0; i < segments.length; i += 1) {
    const seg = String(segments[i] || '').toLowerCase();
    if (!markers.has(seg)) continue;
    if (!segments[i + 1]) continue;
    return {
      appNameRaw: segments[i + 1],
      appNameNorm: normalizeLookupName(segments[i + 1]),
      markerIndex: i
    };
  }

  if (knownApps && knownApps.size > 0) {
    for (let i = 0; i < segments.length; i += 1) {
      const norm = normalizeLookupName(segments[i]);
      if (knownApps.has(norm)) {
        return {
          appNameRaw: segments[i],
          appNameNorm: norm,
          markerIndex: -1
        };
      }
    }
  }

  return null;
}

function deriveModuleSegmentsFromPath(segments, appInfo) {
  const filename = segments[segments.length - 1] || '';
  const pathUntilFile = segments.slice(0, -1);

  const scanStart = appInfo.markerIndex >= 0 ? appInfo.markerIndex + 2 : 0;
  let srcIndex = -1;
  for (let i = scanStart; i < pathUntilFile.length; i += 1) {
    if (String(pathUntilFile[i] || '').toLowerCase() === 'src') {
      srcIndex = i;
      break;
    }
  }

  const relevant = srcIndex >= 0
    ? pathUntilFile.slice(srcIndex + 1)
    : pathUntilFile.slice(scanStart);

  const ignored = new Set([
    'src', 'modules', 'module', 'routes', 'route', 'controllers', 'controller',
    'api', 'http', 'grpc', 'rest', 'internal', 'public', 'server', 'main',
    'dist', 'build', 'domain', 'application', 'infra', 'infrastructure',
    'shared', 'common', 'handlers', 'handler', 'v1', 'v2', 'v3', 'v4'
  ]);

  const appNorm = normalizeLookupName(appInfo.appNameNorm || appInfo.appNameRaw);
  const moduleSegments = [];
  for (const segment of relevant) {
    const raw = String(segment || '');
    const norm = normalizeLookupName(raw);
    if (!norm) continue;
    if (ignored.has(raw.toLowerCase())) continue;
    if (norm === appNorm) continue;
    moduleSegments.push(raw);
  }

  if (moduleSegments.length) return moduleSegments;

  const stem = deriveFileStem(filename);
  if (stem) return [stem];
  return [];
}

function deriveFileStem(filename) {
  let base = String(filename || '').replace(/\.(t|j)sx?$/i, '');
  if (!base) return '';

  base = base
    .replace(/\.routes?$/i, '')
    .replace(/\.controller$/i, '')
    .replace(/router$/i, '')
    .replace(/^grpc[._-]?/i, '')
    .trim();

  if (!base) return '';
  const low = base.toLowerCase();
  if (['index', 'routes', 'route', 'controller', 'handler'].includes(low)) return '';
  return base;
}

function inferDomainFromPath(routePath) {
  const segments = normalizePath(routePath)
    .split('/')
    .filter(Boolean)
    .filter((s) => s.toLowerCase() !== 'api');

  for (const segment of segments) {
    if (isPathParamSegment(segment)) continue;
    return segment;
  }

  return 'General';
}

function cleanLabel(label) {
  const value = String(label || '')
    .replace(/\.(t|j)sx?$/i, '')
    .replace(/\.routes$/i, '')
    .replace(/^routes$/i, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();

  if (!value) return 'General';

  return value
    .split(/\s+/)
    .map((word) => {
      if (word.toUpperCase() === 'API') return 'API';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function toDisplayPath(routePath) {
  return normalizePath(routePath || '/')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}')
    .replace(/{{([A-Za-z0-9_]+)}}/g, '{$1}');
}

function resolveSummary(endpoint) {
  if (endpoint.summary && String(endpoint.summary).trim()) {
    return String(endpoint.summary).trim();
  }

  const description = String(endpoint.description || '').trim();
  if (description && !isAutoDescription(description, endpoint.method, endpoint.path)) {
    const cleaned = stripMethodPrefix(description, endpoint.method);
    if (cleaned) return cleaned;
  }

  return fallbackSummary(endpoint.method, endpoint.path);
}

function stripMethodPrefix(text, method) {
  const value = String(text || '').trim();
  if (!value) return '';
  const methodName = String(method || '').toUpperCase();

  const withDash = new RegExp(`^${methodName}\\s+[^-]+-\\s*`, 'i');
  if (withDash.test(value)) return value.replace(withDash, '').trim();

  const direct = new RegExp(`^${methodName}\\s+`, 'i');
  if (direct.test(value)) return value.replace(direct, '').trim();

  return value;
}

function fallbackSummary(method, routePath) {
  const methodName = String(method || 'GET').toUpperCase();
  const segments = normalizePath(routePath || '/').split('/').filter(Boolean);
  const cleanSegments = segments.filter((s) => !isPathParamSegment(s)).map((s) => cleanLabel(s));
  const resource = cleanSegments.length ? cleanSegments[cleanSegments.length - 1] : 'Root';

  const action = {
    GET: 'Get',
    POST: 'Create',
    PUT: 'Replace',
    PATCH: 'Update',
    DELETE: 'Delete',
    HEAD: 'Head',
    OPTIONS: 'Options'
  }[methodName] || 'Call';

  if (resource === 'Root') return action;
  return `${action} ${resource}`;
}

function isAutoDescription(description, method, routePath) {
  const text = String(description || '').trim();
  if (!text) return true;

  const methodName = String(method || '').toUpperCase();
  const pathVariants = new Set([
    normalizePath(routePath || '/'),
    toDisplayPath(routePath || '/'),
    toPostmanPath(routePath || '/')
  ]);

  for (const route of pathVariants) {
    if (text.toLowerCase() === `${methodName} ${route}`.toLowerCase()) return true;
  }

  return false;
}

function buildRequestDescription(endpoint, summary) {
  const description = String(endpoint.description || '').trim();
  const hasExplicitSummary = !!(endpoint.summary && String(endpoint.summary).trim());
  if (!description || isAutoDescription(description, endpoint.method, endpoint.path)) {
    return hasExplicitSummary ? summary : '';
  }

  if (hasExplicitSummary && summary && summary.toLowerCase() !== description.toLowerCase()) {
    return `${summary}\n\n${description}`;
  }
  return description;
}

function needsAuthorization(endpoint, postmanPath) {
  if (endpoint.auth) return true;

  const middlewareNames = []
    .concat(endpoint.middleware || [])
    .concat(endpoint.guards || [])
    .concat(endpoint.decorators || [])
    .join(' ')
    .toLowerCase();

  if (/(auth|guard|protect|require|role|permission|bearer|jwt)/.test(middlewareNames)) {
    return true;
  }

  const segments = normalizePath(postmanPath || '/')
    .toLowerCase()
    .split('/')
    .filter(Boolean)
    .filter((segment) => !isPathParamSegment(segment));

  const requiresAuthSegment = new Set(['admin', 'me', 'ping', 'export', 'wholesale', 'my', 'all']);
  return segments.some((segment) => requiresAuthSegment.has(segment));
}

function buildQueryParams(queryParams) {
  return (queryParams || []).map((q) => {
    const key = q.key || q.name;
    const type = normalizeType(q.type);
    const required = q.required === true;
    const inferred = inferPrimitiveExample(key, type, 'query');
    const useProvidedExample = q.example !== undefined &&
      q.example !== '' &&
      !preferInferredQueryExample(key, q.example);

    const rawExample = q.value !== undefined
      ? q.value
      : useProvidedExample
        ? q.example
        : inferred;

    const value = toQueryStringValue(rawExample);
    const item = { key, value };

    if (q.disabled !== undefined) {
      item.disabled = !!q.disabled;
    } else if (!required && shouldDisableOptionalQuery(key)) {
      item.disabled = true;
    }

    return item;
  });
}

function preferInferredQueryExample(key, example) {
  const normalizedKey = String(key || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  if (['userid', 'orderid', 'wholesalecustomerid', 'limit', 'offset', 'status'].includes(normalizedKey)) {
    return true;
  }
  if (example === '' || example === null || example === undefined) return true;
  return false;
}

function shouldDisableOptionalQuery(key) {
  const value = String(key || '').toLowerCase();
  if (!value) return false;
  if (['limit', 'offset', 'page', 'size', 'perpage', 'userid'].includes(value)) return false;
  return ['status', 'search', 'sort', 'filter', 'from', 'to', 'q'].includes(value);
}

function buildPathVariables(postmanPath, endpoint) {
  const params = new Map();
  for (const name of extractPathParams(postmanPath)) {
    params.set(name, { name, type: 'string', required: true });
  }

  const explicit = []
    .concat((endpoint.parameters && endpoint.parameters.path) || [])
    .concat((endpoint.parameters && endpoint.parameters.params) || []);

  for (const param of explicit) {
    const key = param && (param.key || param.name);
    if (!key) continue;
    params.set(key, {
      name: key,
      type: normalizeType(param.type),
      required: param.required !== false,
      example: param.example
    });
  }

  return Array.from(params.values()).map((param) => {
    const inferred = param.example !== undefined
      ? param.example
      : inferPrimitiveExample(param.name, param.type || 'string', 'path');
    return {
      key: param.name,
      value: typeof inferred === 'string' ? inferred : String(inferred)
    };
  });
}

function buildRawUrl(postmanPath, queryParams, baseVarToken = '{{baseUrl}}') {
  let raw = `${baseVarToken}${postmanPath}`;
  const queryString = (queryParams || [])
    .filter((q) => !q.disabled)
    .map((q) => `${q.key}=${q.value || ''}`)
    .join('&');

  if (queryString) raw += `?${queryString}`;
  return raw;
}

function exampleFromSchema(schema, depth = 0, keyPath = []) {
  if (!schema || depth > 6) {
    return inferPrimitiveExample(keyPath[keyPath.length - 1], 'string', 'body');
  }

  if (schema.example !== undefined) return clone(schema.example);
  if (Array.isArray(schema.enum) && schema.enum.length) return clone(schema.enum[0]);

  const type = normalizeType(schema.type || (schema.properties ? 'object' : schema.items ? 'array' : 'string'));

  if (type === 'object') {
    const properties = schema.properties || {};
    const requiredSet = new Set(schema.required || []);
    const keys = Object.keys(properties).sort((a, b) => {
      const aReq = requiredSet.has(a) ? 0 : 1;
      const bReq = requiredSet.has(b) ? 0 : 1;
      if (aReq !== bReq) return aReq - bReq;
      return a.localeCompare(b);
    });

    const out = {};
    for (const key of keys) {
      out[key] = exampleFromSchema(properties[key], depth + 1, [...keyPath, key]);
    }
    return out;
  }

  if (type === 'array') {
    const itemSchema = schema.items || { type: 'string' };
    return [exampleFromSchema(itemSchema, depth + 1, [...keyPath, 'item'])];
  }

  return inferPrimitiveExample(keyPath[keyPath.length - 1], type, 'body');
}

function inferPrimitiveExample(name, type, context) {
  const key = String(name || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  const normalizedType = normalizeType(type);

  const variableMap = {
    userid: '{{userId}}',
    orderid: '{{orderId}}',
    wholesalecustomerid: '{{wholesaleCustomerId}}',
    authtoken: '{{authToken}}'
  };

  if (variableMap[key]) return variableMap[key];

  if (normalizedType === 'number' || normalizedType === 'integer') {
    if (key.includes('limit')) return 20;
    if (key.includes('offset')) return 0;
    if (key.includes('page')) return 1;
    if (key.includes('quantity')) return 2;
    if (key.includes('count')) return 1;
    if (key.includes('amount') || key.includes('total') || key.includes('price')) return 100;
    return 1;
  }

  if (normalizedType === 'boolean') {
    return false;
  }

  if (context === 'query') {
    if (key.includes('limit')) return '20';
    if (key.includes('offset')) return '0';
    if (key.includes('status')) return 'pending';
  }

  if (key.includes('pushtoken')) return 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';
  if (key === 'title') return 'Test Notification';
  if (key === 'body' || key.includes('message')) return 'This is a test notification message';
  if (key === 'type') return 'test';
  if (key === 'action') return 'open';
  if (key.includes('status')) return 'pending';
  if (key.includes('address')) return '123 Main St, Addis Ababa, Ethiopia';
  if (key.includes('phone')) return '+251911223344';
  if (key.includes('zoneid') || key.includes('productid') || key.includes('batchid')) return UUID_SAMPLE;
  if (key.endsWith('id') || key.includes('uuid')) return UUID_SAMPLE;
  if (key.includes('email')) return 'user@example.com';
  if (key.includes('name')) return 'Sample Name';
  if (key.includes('notes')) return 'Please deliver in the morning';
  if (key.includes('method')) return 'card';
  if (key.includes('token')) return 'token_example';

  return 'string';
}

function toQueryStringValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function normalizeType(type) {
  const value = String(type || 'string').toLowerCase();
  if (value === 'int' || value === 'float' || value === 'double') return 'number';
  return value;
}

function isPathParamSegment(segment) {
  return /^:/.test(segment) || /^{.+}$/.test(segment) || /^{{.+}}$/.test(segment);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export { buildPostmanCollection };
