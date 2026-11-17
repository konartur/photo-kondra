# Storage and private-link audit

Issue: [#23 — Storage and Private Link Security Audit](https://github.com/konartur/photo-kondra/issues/23).
Audit performed on 2026-11-17/18. Scope: S3 adapter, uploads, token lookup, public gallery/photo/archive services, response caching and deployment boundaries.

## Findings and changes

| Finding | Result |
| --- | --- |
| Positive TTL configuration allowed arbitrarily long signatures | Fixed: upload/original maximum 900 seconds; preview/archive maximum 3600 seconds. Invalid configuration fails closed before signing. The S3 adapter independently rejects uploads over 900 and downloads over 3600 seconds. |
| Preview, original and ZIP URLs could outlive a known access-link expiration | Fixed: newly issued URLs are capped to whole seconds remaining on the link; ZIPs are also capped to archive retention. Less than one second remaining denies issuance. |
| A reusable presigned PUT could replace an original after processing/publication | Fixed for existing objects: browser PUTs require a signed `If-None-Match: *` and signed `Content-Type`. Reusing the URL cannot overwrite an existing object. Worker uploads retain normal replacement semantics. |
| Direct public gallery/photo responses lacked explicit cache prevention | Fixed: gallery metadata, photo lists and original URL responses use `Cache-Control: no-store`, matching existing archive responses. Upload URL and private-link creation responses also use `no-store`. |
| Hash-only private tokens | Confirmed in code: 32 cryptographically random bytes, base64url encoding, SHA-256 stored in a unique indexed field. Raw token appears only in the explicitly requested creation response. List responses omit hash and token. |
| Expiry, revocation, gallery state and cross-gallery boundaries | Confirmed: all public services resolve an active, unexpired token and require a READY gallery. Photo and archive queries include the resolved gallery ID. Selected archive inputs are constrained to that gallery. Existing integration regressions cover substituted gallery/photo/archive IDs. |
| Secret comparison timing | No raw secret string comparison exists: a fixed-size SHA-256 digest is looked up through the database index. `timingSafeEqual` would not make the database/network path constant-time. Uniform 404 responses and existing rate limits reduce enumeration; no strict timing-equivalence claim is made. |
| Public response data | DTOs omit storage-key fields and token hashes. Signed URLs are intentionally returned for authorized assets and necessarily contain their target object path; they are bearer capabilities, not secret-free metadata. |
| Actual AWS bucket privacy and development CORS | **Manually confirmed by the owner on 2026-11-18**: Block all public access On, no bucket policy, Bucket owner enforced, no ACL grants to public/authenticated groups. The owner reported that the manual access checks passed. Provided CORS allows PUT from `http://localhost:3001` and all request headers, including `if-none-match`. Automated control-plane checks still return `AccessDenied`; IAM and other delivery paths were not independently inspected. No cloud configuration was modified. |

## Deployment verification

Run `npm --prefix backend run storage:audit`. This read-only command checks bucket public-access blocks, public-policy status, ACL grants, ownership controls and conditional-PUT CORS. It prints only fixed check names and allowlisted error names. Exit status: 0 all checks passed, 1 failed check, 2 unverified (npm may map nonzero exits to 1).

Use a separate audit identity with these bucket-scoped read permissions:

```json
{
  "Effect": "Allow",
  "Action": [
    "s3:GetBucketPublicAccessBlock",
    "s3:GetBucketPolicyStatus",
    "s3:GetBucketAcl",
    "s3:GetBucketOwnershipControls",
    "s3:GetBucketCORS"
  ],
  "Resource": "arn:aws:s3:::YOUR_PRIVATE_BUCKET"
}
```

Require all four bucket public-access blocks, nonpublic bucket/access-point policies, and preferably BucketOwnerEnforced ownership. The script does not enumerate access points, object ACLs, CloudFront distributions, IAM policies or organization controls; review those in the deployment account separately. With all bucket public-access blocks enabled and ACLs disabled, object ACL grants cannot independently make photos public. For R2/MinIO, check equivalent provider controls; AWS control-plane checks intentionally do not run against custom endpoints.

Runtime object permissions should be restricted to `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` and `s3:AbortMultipartUpload` on `galleries/*` and `archives/*` in this bucket. Do not grant public ACL or bucket-policy mutation permissions to the runtime identity. The audit could not inspect the actual IAM policy; have the deployment owner verify that broader attached policies do not override this intended scope.

The owner-provided CORS configuration already allows GET, HEAD and PUT from `http://localhost:3001`, with `AllowedHeaders: ["*"]`, exposed `ETag`, and a 3000-second preflight cache. This supports the new signed `if-none-match` and `content-type` headers without a development CORS change. Before using a production frontend, add its exact HTTPS origin. See [the CORS example](../../infra/s3-cors.example.json); retain any required existing rules. A missing allowed header causes browser preflight failure. Removing or modifying either signed request header invalidates the signature. The browser handles a retry's 412 as an existing immutable object and proceeds through authenticated upload completion. A concurrent 409 remains a retryable upload error.

## Residual risks and recommendations

- Revoking a gallery token denies future API requests, but cannot recall an already issued S3 URL or downloaded bytes. URLs remain bearer credentials until their bounded expiry; downloads begun before expiry can continue. Lower configured TTLs when a shorter revocation window is needed. Immediate per-link revocation would require a different delivery authorization mechanism and is outside this audit's modular MVP changes. AWS describes these semantics in [presigned URL guidance](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html).
- Conditional PUT protects an existing key, not a deleted key: an unexpired PUT capability can create that key again after deletion. Keep upload TTL short; lifecycle cleanup should remove abandoned objects after the capability window. Anyone who steals a still-unused upload URL can perform its first write. Transfer URLs only over HTTPS and never log them. See [AWS conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).
- Upload DTO size/MIME checks describe the request. Completion currently checks object existence, while Sharp decodes the image later; the actual stored size and declared MIME are not compared by HEAD. A dishonest authenticated uploader can consume storage or exceed declared archive byte accounting. Recommended follow-up: add storage metadata validation before processing, validate actual image format, enforce actual byte limits while reading, and use a presigned POST content-length policy if a hard pre-transfer limit is required. This remains a documented upload-hardening risk, not a verified byte-size guarantee.
- Application logs avoid raw tokens, signed URLs and object keys on ordinary request paths. Infrastructure, SDK/debug output, process error paths and third-party telemetry need their own redaction review. Do not log request URLs, query strings, authorization headers or response bodies. Existing nginx guidance disables URL-bearing logs; configure other ingress/CDN/APM systems equivalently. The logging follow-up (#27) replaces the archive diagnostic helper with fixed error categories and adds safe queue/worker transport-error handlers; see [logging conventions](../logging.md).
- Response `no-store` prevents compliant caches from retaining newly returned API responses; it cannot remove prior copies or prevent users from saving assets. Asset cache headers and any CDN distribution must be verified independently.

Bucket privacy is recorded as owner-confirmed through manual checks and the supplied console settings, not an automated AWS audit pass. Runtime IAM, access-point/CloudFront delivery configuration and the production frontend origin remain outside that confirmation. No issue closure or production approval is implied by local tests.

## Validation

Regression coverage includes access-expiry caps for thumbnails/previews/originals/full and selected ZIPs, invalid TTL rejection, real offline AWS signing of required PUT headers, and HTTP `no-store` assertions. Browser coverage exercises successful and already-existing (412) uploads. Unit/integration/browser checks use fake storage; they do not write objects to the configured AWS bucket.

Results: lint and TypeScript passed for both applications; backend build and Next.js production webpack build passed. All 166 unit tests, 26 HTTP E2E tests, 12 database integration tests and 18 Playwright tests passed. Local HTTP/integration/browser checks needed execution outside the network-restricted sandbox. `git diff --check` passed. Automated AWS checks remained unverified with `AccessDenied`; manual bucket privacy and development CORS evidence was subsequently provided by the owner on 2026-11-18.
