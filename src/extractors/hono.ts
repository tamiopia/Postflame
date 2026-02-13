// @ts-nocheck
import traverseModule from '@babel/traverse';
import path from 'path';
import fs from 'fs-extra';
import { parseFile } from './ast.js';
import { normalizePath, joinPaths, toKey, HTTP_METHODS } from '../lib/utils.js';
import { resolveZodSchema } from './zod.js';

const traverse = (traverseModule as any).default || traverseModule;

const ROUTER_CLASS_NAMES = new Set(['Hono', 'OpenAPIHono']);
const HONO_METHODS = new Set([...HTTP_METHODS, 'all']);
const ALLOWED_ON_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

function getStringLiteral(node) {
  if (!node) return '';
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.quasis.length === 1) {
    return node.quasis[0].value.cooked || '';
  }
  return '';
}

function getPropertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return null;
}

function resolveImportFile(baseDir, source) {
  const tryFiles = [];

  if (path.isAbsolute(source)) {
    tryFiles.push(source);
  } else {
    tryFiles.push(path.resolve(baseDir, source));
  }

  const ext = path.extname(source);
  if (ext === '.js') {
    tryFiles.push(path.resolve(baseDir, source.replace(/\.js$/, '.ts')));
    tryFiles.push(path.resolve(baseDir, source.replace(/\.js$/, '.tsx')));
  }
  if (ext === '.jsx') {
    tryFiles.push(path.resolve(baseDir, source.replace(/\.jsx$/, '.tsx')));
  }

  if (!ext) {
    tryFiles.push(path.resolve(baseDir, `${source}.ts`));
    tryFiles.push(path.resolve(baseDir, `${source}.tsx`));
    tryFiles.push(path.resolve(baseDir, `${source}.js`));
    tryFiles.push(path.resolve(baseDir, `${source}.jsx`));
    tryFiles.push(path.resolve(baseDir, source, 'index.ts'));
    tryFiles.push(path.resolve(baseDir, source, 'index.js'));
  }

  for (const candidate of tryFiles) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function parseCreateRoute(node, schemaDefs) {
  if (!node || node.type !== 'CallExpression') return null;
  if (node.callee.type !== 'Identifier' || node.callee.name !== 'createRoute') return null;
  const arg = node.arguments && node.arguments[0];
  if (!arg || arg.type !== 'ObjectExpression') return null;

  let method = null;
  let routePath = null;
  let summary = null;
  let description = null;
  let tags = [];
  let middleware = [];
  let request = null;

  for (const prop of arg.properties) {
    if (prop.type !== 'ObjectProperty') continue;
    if (prop.key.type !== 'Identifier') continue;

    const key = prop.key.name;
    const value = prop.value;

    if (key === 'method' && value.type === 'StringLiteral') {
      method = value.value;
    }
    if (key === 'path' && value.type === 'StringLiteral') {
      routePath = value.value;
    }
    if (key === 'summary' && value.type === 'StringLiteral') {
      summary = value.value;
    }
    if (key === 'description' && value.type === 'StringLiteral') {
      description = value.value;
    }
    if (key === 'tags' && value.type === 'ArrayExpression') {
      for (const el of value.elements || []) {
        if (el && el.type === 'StringLiteral') tags.push(el.value);
      }
    }
    if (key === 'middleware' && value.type === 'ArrayExpression') {
      for (const el of value.elements || []) {
        if (el && el.type === 'Identifier') middleware.push(el.name);
        if (el && el.type === 'CallExpression' && el.callee.type === 'Identifier') {
          middleware.push(el.callee.name);
        }
      }
    }
    if (key === 'request' && value.type === 'ObjectExpression') {
      request = parseRequestSchema(value, schemaDefs);
    }
  }

  if (!method || !routePath) return null;
  return {
    method: method.toUpperCase(),
    path: routePath,
    summary,
    description: description || summary,
    tags,
    middleware,
    request
  };
}

function parseRequestSchema(node, schemaDefs) {
  const schema = { query: null, params: null, body: null };

  for (const prop of node.properties || []) {
    if (prop.type !== 'ObjectProperty') continue;
    const key = getPropertyName(prop.key);
    if (!key) continue;

    if (key === 'query') {
      schema.query = resolveZodSchema(prop.value, schemaDefs);
    }
    if (key === 'params') {
      schema.params = resolveZodSchema(prop.value, schemaDefs);
    }
    if (key === 'body') {
      const bodyDef = prop.value;
      if (bodyDef.type === 'ObjectExpression') {
        for (const bodyProp of bodyDef.properties || []) {
          const bodyPropKey = bodyProp.key ? getPropertyName(bodyProp.key) : null;
          if (bodyPropKey === 'content') {
            const content = bodyProp.value;
            if (content.type === 'ObjectExpression') {
              for (const contentProp of content.properties || []) {
                const contentKey = contentProp.key ? getPropertyName(contentProp.key) : null;
                if (contentKey === 'application/json') {
                  const jsonDef = contentProp.value;
                  if (jsonDef.type === 'ObjectExpression') {
                    for (const jsonProp of jsonDef.properties || []) {
                      const jsonPropKey = jsonProp.key ? getPropertyName(jsonProp.key) : null;
                      if (jsonPropKey === 'schema') {
                        schema.body = resolveZodSchema(jsonProp.value, schemaDefs);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return schema;
}

function parseOpenApiRouteArg(node, routeDefs, schemaDefs) {
  if (!node) return null;
  if (node.type === 'Identifier' && routeDefs.has(node.name)) {
    return routeDefs.get(node.name);
  }
  if (node.type === 'CallExpression') {
    const parsed = parseCreateRoute(node, schemaDefs);
    if (parsed) return parsed;
  }
  if (node.type === 'ObjectExpression') {
    let method = null;
    let routePath = null;
    for (const prop of node.properties) {
      if (prop.type !== 'ObjectProperty') continue;
      if (prop.key.type !== 'Identifier') continue;
      if (prop.key.name === 'method' && prop.value.type === 'StringLiteral') {
        method = prop.value.value;
      }
      if (prop.key.name === 'path' && prop.value.type === 'StringLiteral') {
        routePath = prop.value.value;
      }
    }
    if (method && routePath) return { method: method.toUpperCase(), path: routePath };
  }
  return null;
}

function parseCallChain(node) {
  const calls = [];
  let current = node;
  while (current && current.type === 'CallExpression' && current.callee.type === 'MemberExpression') {
    const propName = getPropertyName(current.callee.property);
    if (!propName) break;
    calls.unshift({ name: propName, args: current.arguments || [] });
    current = current.callee.object;
  }
  return { root: current, calls };
}

function isHonoNewExpression(node) {
  if (!node || node.type !== 'NewExpression') return false;
  if (node.callee.type !== 'Identifier') return false;
  return ROUTER_CLASS_NAMES.has(node.callee.name);
}

function recordBasePath(routers, routerVar, basePath) {
  const existing = routers.get(routerVar) || { basePath: '' };
  if (!basePath) return;
  existing.basePath = normalizePath(joinPaths(existing.basePath, basePath));
  routers.set(routerVar, existing);
}

function parseMethodsFromOn(node) {
  if (!node || node.type !== 'CallExpression') return [];
  const args = node.arguments || [];
  const methodsArg = args[0];
  const methods = [];
  if (!methodsArg) return methods;
  if (methodsArg.type === 'StringLiteral') {
    const method = methodsArg.value.toUpperCase();
    if (ALLOWED_ON_METHODS.has(method)) methods.push(method);
  } else if (methodsArg.type === 'ArrayExpression') {
    for (const el of methodsArg.elements || []) {
      if (!el || el.type !== 'StringLiteral') continue;
      const method = el.value.toUpperCase();
      if (ALLOWED_ON_METHODS.has(method)) methods.push(method);
    }
  }
  return methods;
}

function middlewareNameFromNode(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'CallExpression') {
    if (node.callee.type === 'Identifier') return node.callee.name;
    if (node.callee.type === 'MemberExpression') {
      if (node.callee.property.type === 'Identifier') return node.callee.property.name;
    }
  }
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return null;
}

function parseValidatorArgs(args, schemaDefs) {
  // zValidator('json', schema)
  if (args.length < 2) return null;
  const target = getStringLiteral(args[0]);
  if (!['json', 'form', 'query', 'param'].includes(target)) return null;

  const schemaNode = args[1];
  const schema = resolveZodSchema(schemaNode, schemaDefs);
  return { target, schema };
}

function extractParameters(requestSchema) {
  const params = {};

  if (requestSchema.query) {
    const queryParams = [];
    if (requestSchema.query.properties) {
      for (const [key, val] of Object.entries(requestSchema.query.properties)) {
        queryParams.push({
          name: key,
          key: key,
          required: !val.optional,
          type: val.type || 'string',
          example: val.example || generateExampleValue(val)
        });
      }
    }
    params.query = queryParams;
  }

  if (requestSchema.params) {
    const pathParams = [];
    if (requestSchema.params.properties) {
      for (const [key, val] of Object.entries(requestSchema.params.properties)) {
        pathParams.push({
          name: key,
          key,
          required: true,
          type: val.type || 'string',
          example: val.example
        });
      }
    }
    params.params = pathParams;
  }

  if (requestSchema.body) {
    params.body = requestSchema.body;
  }

  return params;
}

function generateExampleValue(schema) {
  if (!schema) return '';
  if (schema.example !== undefined) return schema.example;
  if (schema.type === 'number' || schema.type === 'integer') return 20;
  if (schema.type === 'boolean') return false;
  return '';
}

async function parseHonoFile(filePath) {
  const ast = await parseFile(filePath);
  const routers = new Map();
  const endpoints = [];
  const mounts = [];
  const exports = { default: null, named: new Map() };
  const imports = new Map();
  const routeDefs = new Map();
  const schemaDefs = new Map(); // Store Zod schemas defined in variables

  traverse(ast, {
    ImportDeclaration(p) {
      const node = p.node;
      const source = node.source.value;
      if (!source || !source.startsWith('.')) return;
      const baseDir = path.dirname(filePath);
      const resolved = resolveImportFile(baseDir, source);
      if (!resolved) return;
      for (const spec of node.specifiers || []) {
        if (spec.type === 'ImportDefaultSpecifier') {
          imports.set(spec.local.name, { sourceFile: resolved, importName: 'default', isDefault: true });
        }
        if (spec.type === 'ImportSpecifier') {
          imports.set(spec.local.name, { sourceFile: resolved, importName: spec.imported.name, isDefault: false });
        }
      }
    },

    ExportDefaultDeclaration(path) {
      const node = path.node;
      if (node.declaration && node.declaration.type === 'Identifier') {
        exports.default = node.declaration.name;
      }
    },

    ExportNamedDeclaration(path) {
      const node = path.node;
      if (node.declaration && node.declaration.type === 'VariableDeclaration') {
        for (const decl of node.declaration.declarations) {
          if (decl.id.type === 'Identifier') {
            exports.named.set(decl.id.name, decl.id.name);
          }
        }
      }
      for (const spec of node.specifiers || []) {
        if (spec.type === 'ExportSpecifier') {
          exports.named.set(spec.exported.name, spec.local.name);
        }
      }
    },

    VariableDeclarator(path) {
      const node = path.node;
      if (node.id.type !== 'Identifier') return;
      const varName = node.id.name;
      const init = node.init;
      if (!init) return;

      if (init.type === 'CallExpression' || init.type === 'MemberExpression') {
        schemaDefs.set(varName, init);
      }

      const createRouteParsed = parseCreateRoute(init, schemaDefs);
      if (createRouteParsed) {
        routeDefs.set(varName, createRouteParsed);
        return;
      }

      if (init.type === 'NewExpression' && isHonoNewExpression(init)) {
        routers.set(varName, { basePath: '' });
        return;
      }

      if (init.type === 'CallExpression') {
        const { root, calls } = parseCallChain(init);
        if (isHonoNewExpression(root)) {
          routers.set(varName, { basePath: '' });
          for (const call of calls) {
            if (call.name === 'basePath') {
              const bp = getStringLiteral(call.args[0]);
              recordBasePath(routers, varName, bp);
            }
            if (HONO_METHODS.has(call.name)) {
              const method = call.name === 'all' ? 'ALL' : call.name.toUpperCase();
              const routePath = getStringLiteral(call.args[0]);
              if (routePath) {
                const params = {};
                const middleware = [];
                for (const arg of call.args.slice(1)) {
                  if (arg.type === 'CallExpression' && arg.callee.name === 'zValidator') {
                    const res = parseValidatorArgs(arg.arguments, schemaDefs);
                    if (res) {
                      if (res.target === 'json' || res.target === 'form') params.body = res.schema;
                      if (res.target === 'query') {
                        const queryParams = [];
                        if (res.schema.properties) {
                          for (const [key, val] of Object.entries(res.schema.properties)) {
                            queryParams.push({
                              name: key,
                              key,
                              required: !val.optional,
                              type: val.type || 'string',
                              example: val.example
                            });
                          }
                        }
                        params.query = queryParams;
                      }
                    }
                  }
                  const middlewareName = middlewareNameFromNode(arg);
                  if (middlewareName && middlewareName !== 'zValidator') {
                    middleware.push(middlewareName);
                  }
                }

                endpoints.push({
                  routerVar: varName,
                  method,
                  path: routePath,
                  description: `${method} ${routePath}`,
                  middleware,
                  parameters: params
                });
              }
            }
            if (call.name === 'on') {
              const methods = parseMethodsFromOn({ arguments: call.args });
              const routePath = getStringLiteral(call.args[1]);
              for (const method of methods) {
                endpoints.push({ routerVar: varName, method, path: routePath, description: `${method} ${routePath}` });
              }
            }
            if (call.name === 'openapi') {
              const route = parseOpenApiRouteArg(call.args[0], routeDefs, schemaDefs);
              if (route) {
                endpoints.push({
                  routerVar: varName,
                  method: route.method,
                  path: route.path,
                  summary: route.summary,
                  description: route.description || route.summary || `${route.method} ${route.path}`,
                  tags: route.tags || [],
                  middleware: route.middleware || [],
                  parameters: route.request ? extractParameters(route.request) : {}
                });
              }
            }
          }
        }
      }
    },

    CallExpression(path) {
      const node = path.node;
      if (node.callee.type !== 'MemberExpression') return;
      const prop = node.callee.property;
      if (prop.type !== 'Identifier') return;
      const methodName = prop.name;

      if (node.callee.object.type === 'Identifier') {
        const routerVar = node.callee.object.name;

        if (methodName === 'basePath') {
          if (!routers.has(routerVar)) routers.set(routerVar, { basePath: '' });
          const bp = getStringLiteral(node.arguments[0]);
          if (bp) recordBasePath(routers, routerVar, bp);
          return;
        }

        if (methodName === 'route') {
          if (!routers.has(routerVar)) routers.set(routerVar, { basePath: '' });
          const prefix = getStringLiteral(node.arguments[0]);
          const child = node.arguments[1];
          if (prefix && child && child.type === 'Identifier') {
            mounts.push({ parentVar: routerVar, childIdent: child.name, prefix });
          }
          return;
        }

        if (HONO_METHODS.has(methodName)) {
          if (!routers.has(routerVar)) routers.set(routerVar, { basePath: '' });
          const method = methodName === 'all' ? 'ALL' : methodName.toUpperCase();
          const routePath = getStringLiteral(node.arguments[0]);
          if (routePath) {
            const params = {};
            const middleware = [];
            for (const arg of node.arguments.slice(1)) {
              if (arg.type === 'CallExpression' && arg.callee.name === 'zValidator') {
                const res = parseValidatorArgs(arg.arguments, schemaDefs);
                if (res) {
                  if (res.target === 'json' || res.target === 'form') params.body = res.schema;
                  if (res.target === 'query') {
                    const queryParams = [];
                    if (res.schema.properties) {
                      for (const [key, val] of Object.entries(res.schema.properties)) {
                        queryParams.push({
                          name: key,
                          key,
                          required: !val.optional,
                          type: val.type || 'string',
                          example: val.example
                        });
                      }
                    }
                    params.query = queryParams;
                  }
                }
              }
              const middlewareName = middlewareNameFromNode(arg);
              if (middlewareName && middlewareName !== 'zValidator') {
                middleware.push(middlewareName);
              }
            }

            endpoints.push({
              routerVar,
              method,
              path: routePath,
              description: `${method} ${routePath}`,
              middleware,
              parameters: params
            });
          }
          return;
        }

        if (methodName === 'on') {
          if (!routers.has(routerVar)) routers.set(routerVar, { basePath: '' });
          const methods = parseMethodsFromOn(node);
          const routePath = getStringLiteral(node.arguments[1]);
          for (const method of methods) {
            endpoints.push({ routerVar, method, path: routePath, description: `${method} ${routePath}` });
          }
          return;
        }

        if (methodName === 'openapi') {
          if (!routers.has(routerVar)) routers.set(routerVar, { basePath: '' });
          const route = parseOpenApiRouteArg(node.arguments[0], routeDefs, schemaDefs);
          if (route) {
            endpoints.push({
              routerVar,
              method: route.method,
              path: route.path,
              summary: route.summary,
              description: route.description || route.summary || `${route.method} ${route.path}`,
              tags: route.tags || [],
              middleware: route.middleware || [],
              parameters: route.request ? extractParameters(route.request) : {}
            });
          }
        }
      }
    }
  });

  return { filePath, routers, endpoints, mounts, exports, imports };
}

function routerId(filePath, varName) {
  return `${filePath}::${varName}`;
}

function buildRouterIndex(fileDataMap) {
  const routers = new Map();

  for (const data of fileDataMap.values()) {
    for (const [varName, meta] of data.routers.entries()) {
      routers.set(routerId(data.filePath, varName), {
        filePath: data.filePath,
        varName,
        basePath: meta.basePath || ''
      });
    }
  }

  return routers;
}

function resolveChildRouterId(childIdent, data, fileDataMap) {
  if (data.routers.has(childIdent)) {
    return routerId(data.filePath, childIdent);
  }

  if (data.imports.has(childIdent)) {
    const imp = data.imports.get(childIdent);
    const target = fileDataMap.get(imp.sourceFile);
    if (!target) return null;
    if (imp.isDefault) {
      if (target.exports.default) return routerId(target.filePath, target.exports.default);
      return null;
    }
    const mapped = target.exports.named.get(imp.importName);
    if (mapped) return routerId(target.filePath, mapped);
  }

  return null;
}

function addPrefix(prefixesByRouter, routerIdValue, prefix) {
  const set = prefixesByRouter.get(routerIdValue) || new Set();
  if (set.has(prefix)) return false;
  set.add(prefix);
  prefixesByRouter.set(routerIdValue, set);
  return true;
}

async function extractHonoEndpoints(files) {
  const fileDataMap = new Map();
  for (const file of files) {
    try {
      const data = await parseHonoFile(file);
      fileDataMap.set(file, data);
    } catch (err) {
      // Ignore parse errors here; handled at caller level
    }
  }

  const routers = buildRouterIndex(fileDataMap);
  const endpointsByRouter = new Map();
  const edges = new Map();
  const childHasParent = new Set();

  for (const data of fileDataMap.values()) {
    for (const endpoint of data.endpoints) {
      const id = routerId(data.filePath, endpoint.routerVar);
      if (!endpointsByRouter.has(id)) endpointsByRouter.set(id, []);
      endpointsByRouter.get(id).push(endpoint);
    }

    for (const mount of data.mounts) {
      const parentId = routerId(data.filePath, mount.parentVar);
      const childId = resolveChildRouterId(mount.childIdent, data, fileDataMap);
      if (!childId) continue;
      if (!edges.has(parentId)) edges.set(parentId, []);
      edges.get(parentId).push({ childId, prefix: mount.prefix });
      childHasParent.add(childId);
    }
  }

  const prefixesByRouter = new Map();

  const routerIds = Array.from(routers.keys());
  const roots = routerIds.filter((id) => !childHasParent.has(id));
  const start = roots.length ? roots : routerIds;

  const queue = [];
  for (const id of start) {
    if (addPrefix(prefixesByRouter, id, '')) {
      queue.push({ id, prefix: '' });
    }
  }

  while (queue.length) {
    const { id, prefix } = queue.shift();
    const router = routers.get(id);
    if (!router) continue;
    const effective = joinPaths(prefix, router.basePath || '');
    const children = edges.get(id) || [];
    for (const edge of children) {
      const childPrefix = joinPaths(effective, edge.prefix);
      if (addPrefix(prefixesByRouter, edge.childId, childPrefix)) {
        queue.push({ id: edge.childId, prefix: childPrefix });
      }
    }
  }

  const results = [];
  for (const [id, list] of endpointsByRouter.entries()) {
    const router = routers.get(id);
    const prefixes = prefixesByRouter.get(id) || new Set(['']);
    for (const prefix of prefixes) {
      const effective = joinPaths(prefix, router ? router.basePath || '' : '');
      for (const endpoint of list) {
        const fullPath = normalizePath(joinPaths(effective, endpoint.path));
        results.push({
          method: endpoint.method,
          path: fullPath,
          summary: endpoint.summary,
          description: endpoint.description || `${endpoint.method} ${fullPath}`,
          tags: endpoint.tags || [],
          middleware: endpoint.middleware || [],
          parameters: endpoint.parameters || {},
          filePath: router ? router.filePath : undefined,
          key: toKey(endpoint.method, fullPath)
        });
      }
    }
  }

  return results;
}

export { extractHonoEndpoints };
