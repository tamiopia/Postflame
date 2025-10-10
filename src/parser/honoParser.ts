import { Hono } from 'hono';

export function extractRoutes(app: Hono) {
  return app.routes.map(r => ({
    method: r.method,
    path: r.path
  }));
}
