// One-time setup: lets https://ailaxx.com upload files straight to the
// private Neon Object Storage bucket with presigned PUT URLs (step 7).
// Downloads are normal page navigations, so only PUT is allowed. Uploads
// send Content-Disposition so the object always downloads as a file.
//
// Run from the repository root with scripts/set-storage-cors.ps1, which asks
// for the storage key without showing it. The key is read from
// STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY and never printed.

import { createRequire } from 'node:module';

// Use the AWS SDK installed for @aila/storage.
const require = createRequire(new URL('../packages/storage/package.json', import.meta.url));
const { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } = require('@aws-sdk/client-s3');

const ENDPOINT = 'https://br-rough-rice-b5mlj1zl.storage.c-7.us-east-2.aws.neon.tech';
const REGION = 'us-east-2';
const BUCKET = 'storage';
const ORIGIN = 'https://ailaxx.com';

const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY?.trim();

if (!accessKeyId || !secretAccessKey) {
  console.error('STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY are required.');
  process.exit(1);
}

const client = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

try {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [ORIGIN],
            AllowedMethods: ['PUT'],
            AllowedHeaders: ['content-type', 'content-disposition'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );

  const { CORSRules } = await client.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
  console.log(`CORS set on bucket "${BUCKET}":`);
  console.log(JSON.stringify(CORSRules, null, 2));
} catch (error) {
  console.error(`Could not set CORS: ${error?.name ?? 'Error'}: ${error?.message ?? 'unknown error'}`);
  process.exit(1);
}
