export const env = {
  browser: typeof window !== 'undefined' && typeof document !== 'undefined',
  worker: typeof window === 'undefined' &&
    typeof self !== 'undefined' &&
    typeof (self as { importScripts?: unknown }).importScripts === 'function',
};
