// @ts-nocheck
function getPropertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return null;
}

function getObjectProperty(node, keyName) {
  if (!node || node.type !== 'ObjectExpression') return null;
  for (const prop of node.properties || []) {
    if (prop.type !== 'ObjectProperty') continue;
    const name = getPropertyName(prop.key);
    if (name === keyName) return prop.value;
  }
  return null;
}

function literalFromNode(node) {
  if (!node) return undefined;
  if (node.type === 'StringLiteral' || node.type === 'NumericLiteral' || node.type === 'BooleanLiteral') {
    return node.value;
  }
  if (node.type === 'NullLiteral') return null;
  if (node.type === 'ArrayExpression') {
    return (node.elements || []).map((el) => literalFromNode(el));
  }
  if (node.type === 'ObjectExpression') {
    const out = {};
    for (const prop of node.properties || []) {
      if (prop.type !== 'ObjectProperty') continue;
      const key = getPropertyName(prop.key);
      if (!key) continue;
      out[key] = literalFromNode(prop.value);
    }
    return out;
  }
  return undefined;
}

function resolveZodSchema(node, schemaDefs, depth = 0, seen = new Set()) {
  if (!node || depth > 12) return { type: 'string' };

  if (node.type === 'Identifier') {
    if (schemaDefs.has(node.name)) {
      if (seen.has(node.name)) return { type: 'object' };
      seen.add(node.name);
      const resolved = resolveZodSchema(schemaDefs.get(node.name), schemaDefs, depth + 1, seen);
      seen.delete(node.name);
      return resolved;
    }
    return { type: 'object' };
  }

  if (node.type === 'ObjectExpression') {
    const properties = {};
    const required = [];
    for (const prop of node.properties || []) {
      if (prop.type !== 'ObjectProperty') continue;
      const key = getPropertyName(prop.key);
      if (!key) continue;
      const propSchema = resolveZodSchema(prop.value, schemaDefs, depth + 1, seen);
      properties[key] = propSchema;
      if (!propSchema.optional) required.push(key);
    }
    return { type: 'object', properties, required: required.length ? required : undefined };
  }

  if (node.type === 'CallExpression') {
    const { callee } = node;

    if (callee.type === 'MemberExpression') {
      const methodName = callee.property.type === 'Identifier' ? callee.property.name : null;
      if (!methodName) return { type: 'string' };

      if (methodName === 'string') return { type: 'string' };
      if (methodName === 'number' || methodName === 'int' || methodName === 'bigint') return { type: 'number' };
      if (methodName === 'boolean') return { type: 'boolean' };
      if (methodName === 'date') return { type: 'string', format: 'date-time' };

      if (methodName === 'literal') {
        const literal = literalFromNode(node.arguments && node.arguments[0]);
        const type = typeof literal === 'number' ? 'number' : typeof literal === 'boolean' ? 'boolean' : 'string';
        return { type, example: literal, enum: literal !== undefined ? [literal] : undefined };
      }

      if (methodName === 'enum') {
        const arg = node.arguments && node.arguments[0];
        if (arg && arg.type === 'ArrayExpression') {
          const values = (arg.elements || [])
            .map((el) => literalFromNode(el))
            .filter((value) => value !== undefined);
          return { type: 'string', enum: values, example: values[0] };
        }
      }

      if (methodName === 'nativeEnum') {
        return { type: 'string' };
      }

      if (methodName === 'object') {
        const arg = node.arguments && node.arguments[0];
        if (arg && arg.type === 'ObjectExpression') {
          const properties = {};
          const required = [];
          for (const prop of arg.properties || []) {
            if (prop.type !== 'ObjectProperty') continue;
            const name = getPropertyName(prop.key);
            if (!name) continue;
            const propSchema = resolveZodSchema(prop.value, schemaDefs, depth + 1, seen);
            properties[name] = propSchema;
            if (!propSchema.optional) required.push(name);
          }
          return { type: 'object', properties, required: required.length ? required : undefined };
        }
        return { type: 'object' };
      }

      if (methodName === 'array') {
        return {
          type: 'array',
          items: resolveZodSchema(node.arguments && node.arguments[0], schemaDefs, depth + 1, seen)
        };
      }

      if (methodName === 'union') {
        const arg = node.arguments && node.arguments[0];
        if (arg && arg.type === 'ArrayExpression' && arg.elements && arg.elements.length) {
          return resolveZodSchema(arg.elements[0], schemaDefs, depth + 1, seen);
        }
      }

      if (methodName === 'optional') {
        const base = resolveZodSchema(callee.object, schemaDefs, depth + 1, seen);
        base.optional = true;
        return base;
      }

      if (methodName === 'nullable' || methodName === 'nullish') {
        const base = resolveZodSchema(callee.object, schemaDefs, depth + 1, seen);
        base.nullable = true;
        if (methodName === 'nullish') base.optional = true;
        return base;
      }

      if (methodName === 'default') {
        const base = resolveZodSchema(callee.object, schemaDefs, depth + 1, seen);
        const defValue = literalFromNode(node.arguments && node.arguments[0]);
        if (defValue !== undefined) base.example = defValue;
        base.optional = true;
        return base;
      }

      if (methodName === 'openapi') {
        const base = resolveZodSchema(callee.object, schemaDefs, depth + 1, seen);
        const args = node.arguments || [];
        const metaArg = args.find((arg) => arg && arg.type === 'ObjectExpression');
        if (metaArg) {
          const exampleNode = getObjectProperty(metaArg, 'example');
          if (exampleNode) {
            const exampleValue = literalFromNode(exampleNode);
            if (exampleValue !== undefined) base.example = exampleValue;
          }
          const descriptionNode = getObjectProperty(metaArg, 'description');
          if (descriptionNode && descriptionNode.type === 'StringLiteral') {
            base.description = descriptionNode.value;
          }
        }
        return base;
      }

      // Generic chain fallback (.min(), .max(), .email(), .uuid(), ...)
      return resolveZodSchema(callee.object, schemaDefs, depth + 1, seen);
    }

    if (callee.type === 'Identifier' && schemaDefs.has(callee.name)) {
      return resolveZodSchema(schemaDefs.get(callee.name), schemaDefs, depth + 1, seen);
    }
  }

  if (node.type === 'MemberExpression') {
    const prop = node.property.type === 'Identifier' ? node.property.name : null;
    if (prop === 'string') return { type: 'string' };
    if (prop === 'number' || prop === 'int') return { type: 'number' };
    if (prop === 'boolean') return { type: 'boolean' };
    if (node.object) return resolveZodSchema(node.object, schemaDefs, depth + 1, seen);
  }

  return { type: 'string' };
}

export { resolveZodSchema };
