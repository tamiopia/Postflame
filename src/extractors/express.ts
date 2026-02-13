// @ts-nocheck
import traverseModule from '@babel/traverse';
import { parseFile } from './ast.js';
import { normalizePath, toKey, HTTP_METHODS, joinPaths } from '../lib/utils.js';
import { resolveZodSchema } from './zod.js';

const traverse = (traverseModule as any).default || traverseModule;

function getStringLiteral(node) {
  if (!node) return '';
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.quasis.length === 1) {
    return node.quasis[0].value.cooked || '';
  }
  return '';
}

function isHttpMethod(prop) {
  return HTTP_METHODS.includes(prop);
}

function getMemberObjectName(memberExpr) {
  if (!memberExpr || memberExpr.type !== 'MemberExpression') return null;
  if (memberExpr.object.type === 'Identifier') return memberExpr.object.name;
  return null;
}

function getRouteCallInfo(callExpr) {
  // router.route('/path')
  if (!callExpr || callExpr.type !== 'CallExpression') return null;
  if (callExpr.callee.type !== 'MemberExpression') return null;
  const prop = callExpr.callee.property;
  if (!prop || prop.type !== 'Identifier' || prop.name !== 'route') return null;
  const routerName = getMemberObjectName(callExpr.callee);
  const args = callExpr.arguments || [];
  const routePath = getStringLiteral(args[0]);
  if (!routerName || !routePath) return null;
  return { routerName, routePath };
}

function getRouteCallInfoFromChain(callExpr) {
  let current = callExpr;
  while (current && current.type === 'CallExpression') {
    const info = getRouteCallInfo(current);
    if (info) return info;
    if (current.callee && current.callee.type === 'MemberExpression') {
      current = current.callee.object;
    } else {
      break;
    }
  }
  return null;
}

function middlewareNameFromNode(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'CallExpression') {
    if (node.callee.type === 'Identifier') return node.callee.name;
    if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
      return node.callee.property.name;
    }
  }
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
    return node.property.name;
  }
  return null;
}

function collectMiddlewareNames(args) {
  const middleware = [];
  for (const arg of args || []) {
    const name = middlewareNameFromNode(arg);
    if (name) middleware.push(name);
  }
  return Array.from(new Set(middleware));
}

function collectRouterBases(ast) {
  const baseMap = new Map();

  function getBase(name) {
    return baseMap.get(name) || '';
  }

  traverse(ast, {
    CallExpression(path) {
      const node = path.node;
      if (node.callee.type !== 'MemberExpression') return;
      const prop = node.callee.property;
      if (!prop || prop.type !== 'Identifier' || prop.name !== 'use') return;
      const ownerName = getMemberObjectName(node.callee);
      if (!ownerName) return;
      const args = node.arguments || [];
      if (args.length < 2) return;
      const prefix = getStringLiteral(args[0]);
      const routerArg = args[1];
      if (!prefix || !routerArg) return;
      if (routerArg.type !== 'Identifier') return;
      const routerName = routerArg.name;
      const combined = joinPaths(getBase(ownerName), prefix);
      baseMap.set(routerName, combined);
    }
  });

  return baseMap;
}

async function extractExpressEndpoints(filePath) {
  const ast = await parseFile(filePath);
  const endpoints = [];
  const routerBases = collectRouterBases(ast);
  const schemaDefs = new Map();

  // First pass: collect potential schemas
  traverse(ast, {
    VariableDeclarator(path) {
      const node = path.node;
      if (node.id.type === 'Identifier' && node.init) {
        // Collect everything that looks like it could be a schema (Call/Member expression)
        if (node.init.type === 'CallExpression' || node.init.type === 'MemberExpression') {
          schemaDefs.set(node.id.name, node.init);
        }
      }
    }
  });

  traverse(ast, {
    CallExpression(path) {
      const node = path.node;
      if (node.callee.type !== 'MemberExpression') return;
      const property = node.callee.property;
      if (!property || property.type !== 'Identifier') return;
      const methodName = property.name;

      // Extract schemas from middleware args
      function extractSchemasFromArgs(args, httpMethod) {
        let body = null;
        const query = [];

        for (const arg of args) {
          // Look for middleware calls: validate(schema)
          if (arg.type === 'CallExpression') {
            const middlewareArgs = arg.arguments || [];
            if (middlewareArgs.length > 0) {
              // Heuristic: check if the first arg resolves to a Zod schema
              const possibleSchema = middlewareArgs[0];
              const resolved = resolveZodSchema(possibleSchema, schemaDefs);

              // If it resolves to something meaningful (not just string fallback)
              // For now, resolveZodSchema defaults to {type:'string'} if parsing fails, 
              // but if it's an object with properties, it's likely a schema.
              if (resolved && resolved.type === 'object' && resolved.properties) {
                if (['GET', 'DELETE', 'HEAD'].includes(httpMethod)) {
                  // Likely query params
                  for (const [key, val] of Object.entries(resolved.properties)) {
                    query.push({
                      name: key,
                      key,
                      required: !val.optional,
                      type: val.type || 'string',
                      example: val.example
                    });
                  }
                } else {
                  // Likely body
                  body = resolved;
                }
              }
            }
          }
        }
        return { body, query };
      }

      if (isHttpMethod(methodName) && node.callee.object.type === 'Identifier') {
        // Handle router.get('/path', ...)
        const args = node.arguments || [];
        if (!args.length) return;
        const routePath = getStringLiteral(args[0]);
        if (!routePath) return;

        let base = '';
        const ownerName = getMemberObjectName(node.callee);
        if (ownerName && routerBases.has(ownerName)) {
          base = routerBases.get(ownerName);
        }

        const method = methodName.toUpperCase();
        const fullPath = normalizePath(joinPaths(base, routePath));
        const middleware = collectMiddlewareNames(args.slice(1));

        const { body, query } = extractSchemasFromArgs(args.slice(1), method);

        endpoints.push({
          method,
          path: fullPath,
          description: `${method} ${fullPath}`,
          middleware,
          parameters: { body, query },
          filePath,
          key: toKey(method, fullPath)
        });
        return;
      }

      // Handle router.route('/path').get(...)
      if (property.name && isHttpMethod(property.name) && node.callee.object.type === 'CallExpression') {
        const owner = node.callee.object;
        const routeInfo = getRouteCallInfoFromChain(owner);
        if (!routeInfo) return;
        const method = property.name.toUpperCase();
        const base = routerBases.get(routeInfo.routerName) || '';
        const fullPath = normalizePath(joinPaths(base, routeInfo.routePath));
        const middleware = collectMiddlewareNames(node.arguments);

        const { body, query } = extractSchemasFromArgs(node.arguments, method);

        endpoints.push({
          method,
          path: fullPath,
          description: `${method} ${fullPath}`,
          middleware,
          parameters: { body, query },
          filePath,
          key: toKey(method, fullPath)
        });
      }
    }
  });

  return endpoints;
}

export { extractExpressEndpoints };
