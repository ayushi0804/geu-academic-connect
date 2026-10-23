import { routeRegistry } from '../utils/http';

/** OpenAPI 3 document generated from the route registry (every registered route, with tags and auth info). */
export function buildOpenApi() {
  const paths: Record<string, any> = {};
  for (const r of routeRegistry) {
    const p = '/api/v1' + r.path.replace(/:(\w+)/g, '{$1}');
    const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } }));
    const isPublic = ['/auth/login', '/auth/logout', '/auth/forgot-password', '/auth/set-password', '/health'].includes(r.path);
    (paths[p] ??= {})[r.method] = {
      tags: [r.tag],
      summary: `${r.method.toUpperCase()} ${r.path}`,
      parameters: params,
      security: isPublic ? [] : [{ cookieAuth: [] }],
      responses: { '200': { description: 'Success envelope: { success: true, data, meta? }' }, '400': { description: 'Validation error' }, '401': { description: 'Not authenticated' }, '403': { description: 'Forbidden' }, '404': { description: 'Not found' } },
    };
  }
  return {
    openapi: '3.0.3',
    info: { title: 'GEU Academic Connect API', version: '1.0.0', description: 'Demo university platform API (fictional data; not an official GEU system). All state-changing requests must send header X-Requested-With: XMLHttpRequest.' },
    servers: [{ url: '/' }],
    components: { securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'gac_token' } } },
    paths,
  };
}
