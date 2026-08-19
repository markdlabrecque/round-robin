export const API_VERSION = 1;

export function healthResponse() {
  return { version: API_VERSION, status: 'ok' };
}
