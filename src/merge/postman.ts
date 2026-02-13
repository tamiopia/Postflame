// @ts-nocheck
import { buildPostmanCollection } from '../collection/postman.js';
import { toPostmanPath, normalizePath } from '../lib/utils.js';

function mergePostmanCollection(endpoints, config, existing) {
  const generated = buildPostmanCollection(endpoints, config);
  if (!existing || !existing.item) return generated;

  const newItems = flattenPostmanItems(generated.item);
  const existingItems = flattenPostmanItems(existing.item);

  const existingMap = new Map();
  for (const item of existingItems) {
    const key = keyFromPostmanItem(item);
    if (key) existingMap.set(key, item);
  }

  const mergedItems = [];
  for (const item of newItems) {
    const key = keyFromPostmanItem(item);
    if (key && existingMap.has(key)) {
      mergedItems.push(mergePostmanItem(item, existingMap.get(key)));
    } else {
      mergedItems.push(item);
    }
  }

  if (config.merge && config.merge.markDeprecated) {
    for (const [key, item] of existingMap.entries()) {
      if (!newItems.find((i) => keyFromPostmanItem(i) === key)) {
        const deprecated = { ...item };
        deprecated.name = deprecated.name.startsWith('[DEPRECATED]')
          ? deprecated.name
          : `[DEPRECATED] ${deprecated.name}`;
        mergedItems.push(deprecated);
      }
    }
  }

  const rebuilt = rebuildFromFlat(generated.item, mergedItems);

  return {
    ...existing,
    info: existing.info || generated.info,
    variable: generated.variable,
    item: rebuilt
  };
}

function flattenPostmanItems(items, out = []) {
  for (const item of items) {
    if (item.item && Array.isArray(item.item)) {
      flattenPostmanItems(item.item, out);
    } else {
      out.push(item);
    }
  }
  return out;
}

function rebuildFromFlat(templateItems, mergedItems) {
  // Create a map of merged items for quick lookup
  const mergedMap = new Map();
  for (const item of mergedItems) {
    const key = keyFromPostmanItem(item);
    if (key) mergedMap.set(key, item);
  }

  // 1. Rebuild the structure based on the template (newly generated structure)
  const rebuilt = replaceItemsRecursive(templateItems, mergedMap);

  // 2. Identify items that are in mergedItems (existing+deprecated) but NOT in template
  // These are effectively "extra" items (old manual items, or deprecated ones)
  // We want to keep them, usually appended to the root
  const usedKeys = new Set();
  traverseKeys(rebuilt, usedKeys);

  const leftovers = mergedItems.filter(item => {
    const key = keyFromPostmanItem(item);
    return key && !usedKeys.has(key);
  });

  // Add leftovers to the root
  return [...rebuilt, ...leftovers];
}

function replaceItemsRecursive(items, mergedMap) {
  return items.map(item => {
    if (item.item) {
      // It's a folder
      return { ...item, item: replaceItemsRecursive(item.item, mergedMap) };
    }
    // It's a request
    const key = keyFromPostmanItem(item);
    if (key && mergedMap.has(key)) {
      // Return the merged version (which has description etc from existing)
      // But we must preserve the new name/folder context if it changed?
      // Actually mergedMap has the MERGED item.
      // If the folder structure changed, 'item' here is from template, so it's in the right place.
      // We just want the content from mergedMap.
      return mergedMap.get(key);
    }
    return item;
  });
}

function traverseKeys(items, keySet) {
  for (const item of items) {
    if (item.item) {
      traverseKeys(item.item, keySet);
    } else {
      const key = keyFromPostmanItem(item);
      if (key) keySet.add(key);
    }
  }
}



function keyFromPostmanItem(item) {
  if (!item || !item.request) return null;
  const method = item.request.method || '';
  const url = item.request.url || {};
  let raw = '';
  if (typeof url === 'string') raw = url;
  if (url.raw) raw = url.raw;
  let path = '';
  if (raw) {
    path = raw
      .replace(/\{\{\s*baseUrl(?:_[A-Za-z0-9_]+)?\s*\}\}/ig, '')
      .split('?')[0]
      .split('#')[0];
  } else if (Array.isArray(url.path)) {
    path = `/${url.path.join('/')}`;
  }
  path = toPostmanPath(path || '/');
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

function mergePostmanItem(newItem, existingItem) {
  const merged = { ...existingItem };
  merged.name = newItem.name || existingItem.name;

  const newRequest = newItem.request || {};
  const existingRequest = existingItem.request || {};

  const headers = mergeHeaders(newRequest.header || [], existingRequest.header || []);
  const method = newRequest.method || existingRequest.method;
  const shouldDropBody = ['GET', 'DELETE', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());

  merged.request = {
    ...existingRequest,
    method,
    url: newRequest.url || existingRequest.url,
    header: headers,
    description: newRequest.description !== undefined ? newRequest.description : existingRequest.description
  };

  if (newRequest.body !== undefined) {
    merged.request.body = newRequest.body;
  } else if (shouldDropBody) {
    delete merged.request.body;
  } else if (existingRequest.body !== undefined) {
    merged.request.body = existingRequest.body;
  }

  if (newItem.description && !existingItem.description) {
    merged.description = newItem.description;
  }

  return merged;
}

function mergeHeaders(codeHeaders, existingHeaders) {
  const map = new Map();
  for (const h of existingHeaders) {
    if (!h || !h.key) continue;
    map.set(h.key.toLowerCase(), h);
  }
  for (const h of codeHeaders) {
    if (!h || !h.key) continue;
    map.set(h.key.toLowerCase(), h);
  }
  return Array.from(map.values());
}

export { mergePostmanCollection };
