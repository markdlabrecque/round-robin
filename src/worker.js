import { healthResponse } from './contracts/api.js';
import { hasAssetBinding } from './contracts/worker_environment.js';

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers || {}) },
  });
}

async function fetch(request, environment) {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') return json(healthResponse());
  if (hasAssetBinding(environment)) return environment.ASSETS.fetch(request);
  return new Response('Not found', { status: 404 });
}

export default { fetch };
