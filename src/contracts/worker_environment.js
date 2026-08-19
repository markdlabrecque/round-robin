// This is descriptive only: contracts must remain usable outside a Worker runtime.
export const WORKER_BINDINGS = Object.freeze({
  ASSETS: 'asset fetcher',
  DB: 'roster database',
});

export function hasAssetBinding(environment) {
  return Boolean(environment && environment.ASSETS && typeof environment.ASSETS.fetch === 'function');
}
