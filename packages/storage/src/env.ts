/**
 * Server-only Neon Object Storage configuration (PLATFORM-FOUNDATION §24,
 * SECURITY-ARCHITECTURE §31). Read when storage is first used at runtime,
 * never at build time and never with a NEXT_PUBLIC_ prefix.
 */

export type StorageEnv = {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
};

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function getStorageEnv(): StorageEnv {
  const endpoint = required('STORAGE_ENDPOINT');
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    throw new Error('STORAGE_ENDPOINT must be a valid URL');
  }

  if (url.protocol !== 'https:') {
    throw new Error('STORAGE_ENDPOINT must use https');
  }

  return {
    endpoint,
    region: required('STORAGE_REGION'),
    bucket: required('STORAGE_BUCKET'),
    accessKeyId: required('STORAGE_ACCESS_KEY_ID'),
    secretAccessKey: required('STORAGE_SECRET_ACCESS_KEY'),
  };
}
