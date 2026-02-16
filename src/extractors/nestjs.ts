// @ts-nocheck
import traverseModule from '@babel/traverse';
import path from 'path';
import fs from 'fs-extra';
import { parseFile } from './ast.js';
import { joinPaths, normalizePath, toKey } from '../lib/utils.js';

const traverse = (traverseModule as any).default || traverseModule;

const HTTP_DECORATORS = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
  Options: 'OPTIONS',
  Head: 'HEAD'
};
const RPC_DECORATORS = new Set(['GrpcMethod', 'GrpcStreamMethod', 'MessagePattern', 'EventPattern']);

const OPTIONAL_DECORATORS = new Set(['IsOptional', 'ApiPropertyOptional']);
const TYPE_DECORATORS = new Map([
  ['IsString', 'string'],
  ['IsEmail', 'string'],
  ['IsUUID', 'string'],
  ['IsInt', 'number'],
  ['IsNumber', 'number'],
  ['Min', 'number'],
  ['Max', 'number'],
  ['IsBoolean', 'boolean']
]);
const AUTH_DECORATORS = new Set(['ApiBearerAuth', 'UseGuards', 'Auth', 'Roles', 'Permissions']);

function getDecoratorName(dec) {
  const expr = dec.expression;
  if (!expr) return null;
  if (expr.type === 'CallExpression') {
    if (expr.callee.type === 'Identifier') return expr.callee.name;
  }
  if (expr.type === 'Identifier') return expr.name;
  return null;
}

function getDecoratorArgs(dec) {
  const expr = dec.expression;
  if (expr && expr.type === 'CallExpression') return expr.arguments || [];
  return [];
}

function getStringArg(dec) {
  const args = getDecoratorArgs(dec);
  const first = args[0];
  if (!first) return '';
  if (first.type === 'StringLiteral') return first.value;
  if (first.type === 'TemplateLiteral' && first.quasis.length === 1) {
    return first.quasis[0].value.cooked || '';
  }
  return '';
}

function getTagsFromDecorator(dec) {
  const args = getDecoratorArgs(dec);
  const tags = [];
  for (const arg of args) {
    if (arg.type === 'StringLiteral') tags.push(arg.value);
  }
  return tags;
}

function getApiOperationMeta(dec) {
  const args = getDecoratorArgs(dec);
  const first = args[0];
  if (!first || first.type !== 'ObjectExpression') return { summary: null, description: null };
  let summary = null;
  let description = null;
  for (const prop of first.properties) {
    if (prop.type !== 'ObjectProperty') continue;
    if (prop.key.type !== 'Identifier') continue;
    if (prop.key.name === 'summary' && prop.value.type === 'StringLiteral') {
      summary = prop.value.value;
    }
    if (prop.key.name === 'description' && prop.value.type === 'StringLiteral') {
      description = prop.value.value;
    }
  }
  return { summary, description };
}

function hasAuthDecorator(dec) {
  const name = getDecoratorName(dec);
  if (!name) return false;
  if (AUTH_DECORATORS.has(name)) {
    if (name !== 'UseGuards') return true;
    const args = getDecoratorArgs(dec);
    return args.some((arg) => {
      if (arg.type === 'Identifier') return /auth|jwt|role|permission|guard/i.test(arg.name);
      if (arg.type === 'CallExpression' && arg.callee.type === 'Identifier') {
        return /auth|jwt|role|permission|guard/i.test(arg.callee.name);
      }
      return false;
    });
  }
  return /auth|jwt|guard|role|permission/i.test(name);
}

function getPropertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return null;
}

function getMethodName(memberNode) {
  if (!memberNode || !memberNode.key) return 'handler';
  return getPropertyName(memberNode.key) || 'handler';
}

function getSimpleLiteral(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'NumericLiteral') return String(node.value);
  if (node.type === 'BooleanLiteral') return String(node.value);
  if (node.type === 'TemplateLiteral' && node.quasis.length === 1) {
    return node.quasis[0].value.cooked || '';
  }
  return null;
}

function normalizeRpcSegment(value, fallback) {
  const out = String(value || fallback || '').trim();
  if (!out) return fallback;
  return out.replace(/[^A-Za-z0-9_.-]+/g, '-');
}

function parseRpcMeta(dec, handlerName, controllerName) {
  const name = getDecoratorName(dec);
  if (!name || !RPC_DECORATORS.has(name)) return null;
  const args = getDecoratorArgs(dec);

  if (name === 'GrpcMethod' || name === 'GrpcStreamMethod') {
    const service = normalizeRpcSegment(getSimpleLiteral(args[0]), controllerName || 'GrpcService');
    const method = normalizeRpcSegment(getSimpleLiteral(args[1]), handlerName || 'Call');
    return {
      kind: name === 'GrpcStreamMethod' ? 'grpc-stream' : 'grpc',
      path: normalizePath(`/grpc/${service}/${method}`),
      summary: `${service}.${method}`,
      description: name === 'GrpcStreamMethod'
        ? `gRPC stream method ${service}.${method}`
        : `gRPC method ${service}.${method}`
    };
  }

  const pattern = normalizeRpcSegment(getSimpleLiteral(args[0]), handlerName || 'message');
  if (name === 'MessagePattern') {
    return {
      kind: 'message-pattern',
      path: normalizePath(`/rpc/message/${pattern}`),
      summary: `Message Pattern ${pattern}`,
      description: `NestJS MessagePattern handler for "${pattern}"`
    };
  }

  return {
    kind: 'event-pattern',
    path: normalizePath(`/rpc/event/${pattern}`),
    summary: `Event Pattern ${pattern}`,
    description: `NestJS EventPattern handler for "${pattern}"`
  };
}

function getDecoratorObjectArg(dec) {
  const args = getDecoratorArgs(dec);
  const first = args[0];
  if (first && first.type === 'ObjectExpression') return first;
  return null;
}

function getPropMetaFromDecorators(decorators) {
  let optional = false;
  let example;
  let overrideType;

  for (const dec of decorators || []) {
    const name = getDecoratorName(dec);
    if (!name) continue;
    if (OPTIONAL_DECORATORS.has(name)) optional = true;
    if (TYPE_DECORATORS.has(name)) overrideType = TYPE_DECORATORS.get(name);

    if (name === 'ApiProperty' || name === 'ApiPropertyOptional') {
      const obj = getDecoratorObjectArg(dec);
      if (name === 'ApiPropertyOptional') optional = true;
      if (obj) {
        for (const prop of obj.properties) {
          if (prop.type !== 'ObjectProperty') continue;
          if (prop.key.type !== 'Identifier') continue;
          if (prop.key.name === 'required' && prop.value.type === 'BooleanLiteral') {
            if (prop.value.value === false) optional = true;
          }
          if (prop.key.name === 'example') {
            if (prop.value.type === 'StringLiteral' || prop.value.type === 'NumericLiteral' || prop.value.type === 'BooleanLiteral') {
              example = prop.value.value;
            }
          }
          if (prop.key.name === 'type' && prop.value.type === 'Identifier') {
            overrideType = prop.value.name.toLowerCase();
          }
        }
      }
    }
  }

  return { optional, example, overrideType };
}

function collectDtoSchemasFromAst(ast) {
  const dtoMap = new Map();

  function mapTypeElements(typeElements = []) {
    const props = [];
    for (const member of typeElements) {
      if (member.type !== 'TSPropertySignature') continue;
      const name = getPropertyName(member.key);
      if (!name) continue;
      const typeNode = member.typeAnnotation ? member.typeAnnotation.typeAnnotation : null;
      props.push({ name, optional: member.optional === true, typeNode });
    }
    return props;
  }

  traverse(ast, {
    ClassDeclaration(path) {
      const classNode = path.node;
      if (!classNode.id || !classNode.id.name) return;
      const className = classNode.id.name;
      const props = [];

      for (const member of classNode.body.body || []) {
        if (member.type !== 'ClassProperty') continue;
        const name = getPropertyName(member.key);
        if (!name) continue;
        const meta = getPropMetaFromDecorators(member.decorators || []);
        const optional = member.optional === true || meta.optional;
        const typeNode = member.typeAnnotation ? member.typeAnnotation.typeAnnotation : null;
        props.push({ name, optional, typeNode, example: meta.example, overrideType: meta.overrideType });
      }

      if (props.length) dtoMap.set(className, { name: className, props });
    },

    TSInterfaceDeclaration(path) {
      const node = path.node;
      if (!node.id || !node.id.name) return;
      const interfaceName = node.id.name;
      const props = mapTypeElements(node.body && node.body.body ? node.body.body : []);
      if (props.length) dtoMap.set(interfaceName, { name: interfaceName, props });
    },

    TSTypeAliasDeclaration(path) {
      const node = path.node;
      if (!node.id || !node.id.name) return;
      if (!node.typeAnnotation || node.typeAnnotation.type !== 'TSTypeLiteral') return;
      const aliasName = node.id.name;
      const props = mapTypeElements(node.typeAnnotation.members || []);
      if (props.length) dtoMap.set(aliasName, { name: aliasName, props });
    }
  });

  return dtoMap;
}

function collectImportMap(ast, filePath) {
  const map = new Map();
  const baseDir = path.dirname(filePath);

  traverse(ast, {
    ImportDeclaration(path) {
      const node = path.node;
      const source = node.source.value;
      if (!source || !source.startsWith('.')) return;
      const abs = resolveImportFile(baseDir, source);
      if (!abs) return;
      for (const spec of node.specifiers || []) {
        if (spec.type === 'ImportSpecifier' || spec.type === 'ImportDefaultSpecifier') {
          map.set(spec.local.name, abs);
        }
      }
    }
  });

  return map;
}

function resolveImportFile(baseDir, source) {
  const candidates = [
    path.resolve(baseDir, `${source}.ts`),
    path.resolve(baseDir, `${source}.tsx`),
    path.resolve(baseDir, `${source}.js`),
    path.resolve(baseDir, `${source}.jsx`),
    path.resolve(baseDir, source, 'index.ts'),
    path.resolve(baseDir, source, 'index.js')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function collectDtoSchemas(ast, filePath) {
  const dtoMap = collectDtoSchemasFromAst(ast);
  const importMap = collectImportMap(ast, filePath);
  const visited = new Set([filePath]);

  for (const [, importFile] of importMap.entries()) {
    if (visited.has(importFile)) continue;
    visited.add(importFile);
    try {
      const importedAst = await parseFile(importFile);
      const importedDtos = collectDtoSchemasFromAst(importedAst);
      for (const [name, dto] of importedDtos.entries()) {
        if (!dtoMap.has(name)) dtoMap.set(name, dto);
      }
    } catch (err) {
      // Ignore missing or unparsable imports
    }
  }

  return dtoMap;
}

function schemaFromTypeNode(typeNode, dtoMap, depth = 0, memo = new Map(), meta = {}) {
  if (!typeNode) {
    if (meta.overrideType) return { type: meta.overrideType, example: meta.example };
    return { type: 'object', example: meta.example };
  }

  if (typeNode.type === 'TSStringKeyword') return { type: 'string', example: meta.example };
  if (typeNode.type === 'TSNumberKeyword') return { type: 'number', example: meta.example };
  if (typeNode.type === 'TSBooleanKeyword') return { type: 'boolean', example: meta.example };

  if (typeNode.type === 'TSArrayType') {
    return {
      type: 'array',
      items: schemaFromTypeNode(typeNode.elementType, dtoMap, depth + 1, memo)
    };
  }

  if (typeNode.type === 'TSTypeReference') {
    if (typeNode.typeName.type === 'Identifier') {
      const name = typeNode.typeName.name;
      if (name === 'Array' && typeNode.typeParameters && typeNode.typeParameters.params.length === 1) {
        return {
          type: 'array',
          items: schemaFromTypeNode(typeNode.typeParameters.params[0], dtoMap, depth + 1, memo)
        };
      }
      if (dtoMap.has(name) && depth < 2) {
        return buildSchemaForDto(name, dtoMap, depth + 1, memo);
      }
    }
  }

  if (typeNode.type === 'TSTypeLiteral') {
    const properties = {};
    for (const member of typeNode.members || []) {
      if (member.type !== 'TSPropertySignature') continue;
      const name = getPropertyName(member.key);
      if (!name) continue;
      const propSchema = schemaFromTypeNode(member.typeAnnotation?.typeAnnotation, dtoMap, depth + 1, memo);
      properties[name] = propSchema;
    }
    return { type: 'object', properties };
  }

  if (meta.overrideType) return { type: meta.overrideType, example: meta.example };
  return { type: 'object', example: meta.example };
}

function buildSchemaForDto(dtoName, dtoMap, depth = 0, memo = new Map()) {
  if (memo.has(dtoName)) return memo.get(dtoName);
  const dto = dtoMap.get(dtoName);
  if (!dto) return { type: 'object' };

  const schema = { type: 'object', properties: {} };
  memo.set(dtoName, schema);

  const required = [];
  for (const prop of dto.props) {
    const propSchema = schemaFromTypeNode(prop.typeNode, dtoMap, depth + 1, memo, prop);
    schema.properties[prop.name] = propSchema;
    if (!prop.optional) required.push(prop.name);
  }
  if (required.length) schema.required = required;

  return schema;
}

function getParamDecoratorTarget(paramNode) {
  return paramNode && (paramNode.decorators ? paramNode : paramNode.left || paramNode);
}

function getParamDecorators(paramNode, dtoSchemas) {
  const decoratorTarget = getParamDecoratorTarget(paramNode);
  const decorators = decoratorTarget.decorators || [];
  const params = [];
  const query = [];
  let body = null;

  for (const dec of decorators) {
    const name = getDecoratorName(dec);
    if (!name) continue;
    const arg = getStringArg(dec);
    if (name === 'Param') {
      if (arg) params.push({ name: arg, key: arg, required: true, type: 'string' });
    }
    if (name === 'Query') {
      if (arg) {
        query.push({ name: arg, key: arg, required: false, type: 'string' });
      } else {
        // @Query() query: SearchDto
        // Check if there is a type annotation that maps to a DTO
        const typeNode = decoratorTarget.typeAnnotation ? decoratorTarget.typeAnnotation.typeAnnotation : null;
        if (typeNode && typeNode.type === 'TSTypeReference' && typeNode.typeName.type === 'Identifier') {
          const dtoName = typeNode.typeName.name;
          // Build schema to extract properties
          // Use a temporary memo to avoid polluting global state if we were caching heavily, but here it's fine
          const schema = buildSchemaForDto(dtoName, dtoSchemas);
          if (schema && schema.properties) {
            for (const [key, val] of Object.entries(schema.properties)) {
              // Determine if required based on schema.required array
              const isRequired = schema.required && schema.required.includes(key);
              query.push({
                name: key,
                key,
                required: !!isRequired,
                type: val.type || 'string',
                example: val.example
              });
            }
          }
        }
      }
    }
    if (name === 'Body') {
      const typeNode = decoratorTarget.typeAnnotation ? decoratorTarget.typeAnnotation.typeAnnotation : null;
      body = schemaFromTypeNode(typeNode, dtoSchemas);
    }
  }

  return { params, query, body };
}

function getRpcBodySchema(paramList, dtoSchemas) {
  const skipDecorators = new Set(['Ctx', 'Context', 'Metadata', 'Headers']);
  for (const paramNode of paramList || []) {
    const target = getParamDecoratorTarget(paramNode);
    if (!target) continue;
    const decorators = target.decorators || [];
    const shouldSkip = decorators.some((dec) => skipDecorators.has(getDecoratorName(dec)));
    if (shouldSkip) continue;

    const typeNode = target.typeAnnotation ? target.typeAnnotation.typeAnnotation : null;
    if (!typeNode) continue;
    return schemaFromTypeNode(typeNode, dtoSchemas);
  }
  return null;
}

async function extractNestJsEndpoints(filePath) {
  const ast = await parseFile(filePath);
  const endpoints = [];
  const dtoSchemas = await collectDtoSchemas(ast, filePath);

  traverse(ast, {
    ClassDeclaration(path) {
      const classNode = path.node;
      const decorators = classNode.decorators || [];
      const className = classNode.id && classNode.id.name ? classNode.id.name : 'GrpcService';
      let basePath = '';
      let tags = [];
      let classAuth = false;
      for (const dec of decorators) {
        const name = getDecoratorName(dec);
        if (name === 'Controller') {
          basePath = getStringArg(dec);
        }
        if (name === 'ApiTags') {
          tags = tags.concat(getTagsFromDecorator(dec));
        }
        if (hasAuthDecorator(dec)) classAuth = true;
      }

      const body = classNode.body.body || [];
      for (const memberNode of body) {
        const isMethod = memberNode.type === 'ClassMethod';
        const isPropertyWithFn =
          memberNode.type === 'ClassProperty' &&
          memberNode.value &&
          (memberNode.value.type === 'ArrowFunctionExpression' || memberNode.value.type === 'FunctionExpression');

        if (!isMethod && !isPropertyWithFn) continue;

        const methodDecorators = memberNode.decorators || [];
        const handlerName = getMethodName(memberNode);
        let httpMethod = null;
        let methodPath = '';
        let rpcMeta = null;
        let summary = null;
        let description = null;
        let methodAuth = false;
        const decoratorNames = [];

        for (const dec of methodDecorators) {
          const name = getDecoratorName(dec);
          if (name) decoratorNames.push(name);
          if (HTTP_DECORATORS[name]) {
            httpMethod = HTTP_DECORATORS[name];
            methodPath = getStringArg(dec);
          }
          const maybeRpc = parseRpcMeta(dec, handlerName, className);
          if (maybeRpc) rpcMeta = maybeRpc;
          if (name === 'ApiOperation') {
            const apiOp = getApiOperationMeta(dec);
            summary = apiOp.summary || summary;
            description = apiOp.description || description;
          }
          if (hasAuthDecorator(dec)) methodAuth = true;
        }

        if (!httpMethod && !rpcMeta) continue;

        const fullPath = httpMethod
          ? normalizePath(joinPaths(basePath, methodPath))
          : rpcMeta.path;
        const params = [];
        const query = [];
        let bodySchema = null;

        const paramList = isMethod ? memberNode.params || [] : memberNode.value.params || [];
        for (const paramNode of paramList) {
          const res = getParamDecorators(paramNode, dtoSchemas);
          params.push(...res.params);
          query.push(...res.query);
          if (res.body) bodySchema = res.body;
        }
        if (!bodySchema && rpcMeta) {
          bodySchema = getRpcBodySchema(paramList, dtoSchemas);
        }

        const method = httpMethod
          || (rpcMeta && rpcMeta.kind && rpcMeta.kind.startsWith('grpc') ? 'GRPC' : 'POST');
        const endpointSummary = summary || (rpcMeta ? rpcMeta.summary : undefined);
        const endpointDescription = description || (rpcMeta ? rpcMeta.description : `${method} ${fullPath}`);

        const endpoint = {
          method,
          path: fullPath,
          summary: endpointSummary || undefined,
          description: endpointDescription,
          tags: tags.length ? tags : undefined,
          decorators: decoratorNames,
          protocol: rpcMeta ? (rpcMeta.kind.startsWith('grpc') ? 'grpc' : 'rpc') : undefined,
          rpcKind: rpcMeta ? rpcMeta.kind : undefined,
          auth: classAuth || methodAuth || undefined,
          parameters: {
            path: httpMethod && params.length ? params : undefined,
            query: httpMethod && query.length ? query : undefined,
            body: bodySchema || undefined
          },
          filePath,
          key: toKey(method, fullPath)
        };
        endpoints.push(endpoint);
      }
    }
  });

  return endpoints;
}

export { extractNestJsEndpoints };
