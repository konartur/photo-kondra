// Read-only deployment check. Never print configuration, credentials, keys or URLs.
import { config } from 'dotenv';
import {
  S3Client,
  GetPublicAccessBlockCommand,
  GetBucketPolicyStatusCommand,
  GetBucketAclCommand,
  GetBucketOwnershipControlsCommand,
  GetBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const bucket = process.env.AWS_S3_BUCKET;
if (!bucket || !process.env.AWS_REGION || process.env.AWS_S3_ENDPOINT) {
  console.log(
    'UNVERIFIED: AWS region/bucket required; custom providers need their own control-plane audit.',
  );
  process.exitCode = 2;
} else {
  const client = new S3Client({ region: process.env.AWS_REGION, maxAttempts: 1 });
  let failed = false;
  let unverified = false;
  async function check(name, Command, evaluate) {
    try {
      const result = await client.send(new Command({ Bucket: bucket }), {
        abortSignal: AbortSignal.timeout(15000),
      });
      const passed = evaluate(result);
      console.log(`${passed ? 'PASS' : 'FAIL'}: ${name}`);
      if (!passed) failed = true;
    } catch (error) {
      // SDK exception messages can contain storage identifiers. Keep output constant.
      const reason = [
        'AccessDenied',
        'InvalidAccessKeyId',
        'SignatureDoesNotMatch',
        'ExpiredToken',
        'NoSuchBucket',
        'NoSuchBucketPolicy',
        'NoSuchCORSConfiguration',
        'OwnershipControlsNotFoundError',
        'CredentialsProviderError',
      ].includes(error?.name)
        ? error.name
        : 'request unavailable';
      if (Command === GetBucketPolicyStatusCommand && reason === 'NoSuchBucketPolicy') {
        console.log(`PASS: ${name} (no bucket policy)`);
        return;
      }
      console.log(`UNVERIFIED: ${name} (${reason})`);
      unverified = true;
    }
  }
  await check('all four bucket public-access blocks enabled', GetPublicAccessBlockCommand, (r) =>
    ['BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets'].every(
      (k) => r.PublicAccessBlockConfiguration?.[k] === true,
    ),
  );
  await check(
    'bucket policy is not public',
    GetBucketPolicyStatusCommand,
    (r) => r.PolicyStatus?.IsPublic === false,
  );
  await check(
    'ACL grants belong only to bucket owner',
    GetBucketAclCommand,
    (r) =>
      Boolean(r.Owner?.ID) &&
      Boolean(r.Grants?.length) &&
      r.Grants.every((g) => g.Grantee?.Type === 'CanonicalUser' && g.Grantee.ID === r.Owner.ID),
  );
  await check('ACLs disabled by BucketOwnerEnforced', GetBucketOwnershipControlsCommand, (r) =>
    r.OwnershipControls?.Rules?.some((rule) => rule.ObjectOwnership === 'BucketOwnerEnforced'),
  );
  await check('conditional browser PUT allowed by CORS', GetBucketCorsCommand, (r) =>
    r.CORSRules?.some(
      (rule) =>
        rule.AllowedMethods?.includes('PUT') &&
        ['content-type', 'if-none-match'].every((header) =>
          rule.AllowedHeaders?.some((allowed) => ['*', header].includes(allowed.toLowerCase())),
        ) &&
        rule.AllowedOrigins?.includes(process.env.APP_URL),
    ),
  );
  client.destroy();
  process.exitCode = failed ? 1 : unverified ? 2 : 0;
}
