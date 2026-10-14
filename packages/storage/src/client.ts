import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getStorageEnv } from './env';

/**
 * The only code that talks to Neon Object Storage (APPLICATION-ARCHITECTURE
 * §18). The bucket is private; the browser only ever receives short-lived
 * presigned URLs for one object (SECURITY-ARCHITECTURE §31).
 */

let state: { readonly client: S3Client; readonly bucket: string } | undefined;

function storage() {
  if (!state) {
    const env = getStorageEnv();

    state = {
      bucket: env.bucket,
      client: new S3Client({
        endpoint: env.endpoint,
        region: env.region,
        credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
        // Neon Object Storage supports path-style addressing only.
        forcePathStyle: true,
        // Keep presigned uploads to plain PUTs the browser can send.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
    };
  }

  return state;
}

/**
 * A presigned PUT for exactly this type, size and Content-Disposition. The
 * disposition is stored with the object because Neon Object Storage ignores
 * the response-content-disposition override on presigned GETs.
 */
export async function presignPut(
  key: string,
  contentType: string,
  contentLength: number,
  contentDisposition: string,
  expiresIn: number,
): Promise<string> {
  const { client, bucket } = storage();

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
      ContentDisposition: contentDisposition,
    }),
    {
      expiresIn,
      signableHeaders: new Set(['content-type', 'content-length', 'content-disposition']),
    },
  );
}

/** A presigned GET that downloads the object as an attachment. */
export async function presignGet(
  key: string,
  contentType: string,
  contentDisposition: string,
  expiresIn: number,
): Promise<string> {
  const { client, bucket } = storage();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: contentDisposition,
    }),
    { expiresIn },
  );
}

/** Size and type of a stored object, or null when it does not exist. */
export async function head(
  key: string,
): Promise<{ readonly size: number; readonly contentType: string | null } | null> {
  const { client, bucket } = storage();

  try {
    const result = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: result.ContentLength ?? -1, contentType: result.ContentType ?? null };
  } catch (error) {
    if (error instanceof Error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) {
      return null;
    }

    throw error;
  }
}

/** The first `bytes` bytes of an object. */
export async function readStart(key: string, bytes: number): Promise<Uint8Array> {
  const { client, bucket } = storage();
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }),
  );

  return result.Body ? result.Body.transformToByteArray() : new Uint8Array();
}

/** Deletes an object. Deleting a missing object succeeds. */
export async function remove(key: string): Promise<void> {
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Stores bytes the server generated, such as a Writer export, with their
 * type and download disposition. Never used for browser uploads.
 */
export async function put(
  key: string,
  body: Uint8Array,
  contentType: string,
  contentDisposition: string,
): Promise<void> {
  const { client, bucket } = storage();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
      ContentDisposition: contentDisposition,
    }),
  );
}
