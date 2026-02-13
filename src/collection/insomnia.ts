// @ts-nocheck
import { nanoid } from 'nanoid';

function buildInsomniaCollection(endpoints, config) {
  const baseUrl = config.sources.baseUrl || 'http://localhost:3000';
  const workspaceId = `wrk_${nanoid(10)}`;
  const envId = `env_${nanoid(10)}`;

  const resources = [
    {
      _id: workspaceId,
      _type: 'workspace',
      name: (config.output && config.output.insomnia && config.output.insomnia.workspaceName) || 'API Workspace'
    },
    {
      _id: envId,
      _type: 'environment',
      parentId: workspaceId,
      name: 'Base Environment',
      data: { baseUrl }
    }
  ];

  for (const endpoint of endpoints) {
    resources.push(buildRequest(endpoint, workspaceId));
  }

  return {
    _type: 'export',
    __export_format: 4,
    __export_date: new Date().toISOString(),
    __export_source: 'post-api-sync',
    resources
  };
}

function buildRequest(endpoint, workspaceId) {
  const bodySchema = endpoint.parameters && endpoint.parameters.body ? endpoint.parameters.body : null;
  const hasBody = !!bodySchema;
  const example = hasBody ? exampleFromSchema(bodySchema) : null;

  return {
    _id: `req_${nanoid(10)}`,
    _type: 'request',
    parentId: workspaceId,
    name: endpoint.description || `${endpoint.method} ${endpoint.path}`,
    method: endpoint.method,
    url: `{{ _.baseUrl }}${endpoint.path}`,
    headers: hasBody ? [{ name: 'Content-Type', value: 'application/json' }] : [],
    parameters: (endpoint.parameters && endpoint.parameters.query || []).map(q => ({
      name: q.name,
      value: '',
      disabled: !q.required
    })),
    body: hasBody
      ? {
        mimeType: 'application/json',
        text: JSON.stringify(example || {}, null, 2)
      }
      : {}
  };
}

function exampleFromSchema(schema, depth = 0) {
  if (!schema || depth > 3) return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.type === 'string') return '';
  if (schema.type === 'number') return 0;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'array') return [exampleFromSchema(schema.items || {}, depth + 1)];
  if (schema.type === 'object') {
    const obj = {};
    const props = schema.properties || {};
    for (const key of Object.keys(props)) {
      obj[key] = exampleFromSchema(props[key], depth + 1);
    }
    return obj;
  }
  return {};
}

export { buildInsomniaCollection };
