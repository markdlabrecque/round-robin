const DEPLOYED_CONTENT_SECURITY_POLICY = "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-src 'none'; img-src 'self'; media-src 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'";

export const RESPONSE_SECURITY_HEADERS = Object.freeze({
  'content-security-policy': `${DEPLOYED_CONTENT_SECURITY_POLICY}; frame-ancestors 'none'`,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'geolocation=(), microphone=(), camera=()',
});

const CORS_HEADER = /^access-control-/i;

/**
 * Returns a copy of a response with the security policy needed by both API and
 * static responses. CORS headers are deliberately removed: API composition is
 * same-origin only.
 */
export function applyResponseSecurityHeaders(response, request) {
  if (request) assertSameOriginApiRequest(request);

  const headers = new Headers(response.headers);
  for (const name of [...headers.keys()]) {
    if (CORS_HEADER.test(name)) headers.delete(name);
  }
  for (const [name, value] of Object.entries(RESPONSE_SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Rejects API requests whose Origin does not match the request URL's origin.
 * Requests without Origin are allowed so server-to-server and same-origin
 * navigation requests remain composable at the Worker boundary.
 */
export function isSameOriginApiRequest(request) {
  const origin = request.headers.get('origin');
  if (origin === null) return true;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function assertSameOriginApiRequest(request) {
  if (!isSameOriginApiRequest(request)) {
    throw new TypeError('Cross-origin API requests are not allowed.');
  }
}
