# Provider storage uploads

Providers first request a scoped, 15-minute upload URL from the authenticated API, then PUT the file directly to S3. A 200 response from `/providers/me/uploads/presign` means a link was generated; signing a URL locally does not establish that AWS will accept the credentials or permit the upload.

The portal now distinguishes S3 rejection codes from browser/network failures, displays a safe AWS request ID when available, normalizes the MIME header to match backend signing, and limits the upload attempt to two minutes. It never forwards the provider API bearer token or cookies to storage, and does not display raw storage response text or signed URLs. Image and verification-document uploads use the same implementation. Failed uploads do not submit the product or verification document.

If AWS required replacing compromised keys, replace both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in the deployed backend's Coolify environment using the same newly issued key pair. Confirm `AWS_REGION` and `S3_BUCKET_NAME` refer to the intended bucket. Redeploy the backend so its running process reads the new environment; changing a local `.env` or rotating a key in AWS does not change an existing container. Use fresh upload links after redeployment.

Inspect the IAM key's status and permissions in AWS. The signer needs `s3:PutObject` on the intended `user-uploads/providers/*` object prefix. Existing download/delete operations have their own permissions. Bucket policies, explicit denies, encryption-key permissions, and any unresolved AWS account restriction can still deny access. Keep the bucket private; making it public or enabling public ACLs does not repair a revoked signing key.

Use the S3 Code from the failed PUT response to decide the next action:

| Code / failure | Check |
| --- | --- |
| `InvalidAccessKeyId` | Deleted key, incorrect key ID, or wrong deployed key pair |
| `ExpiredToken` / `InvalidToken` | Expired or invalid temporary credentials |
| `AccessDenied` | Active key permissions, bucket policy, encryption requirements, AWS account restrictions |
| `SignatureDoesNotMatch` | Matching secret, signing region and exact signed request headers |
| `RequestTimeTooSkewed` | Backend clock synchronization |
| Browser fetch failure / blocked preflight | Connection and bucket CORS for `https://provider.atlxpres.com`, `PUT`, `Content-Type` |

Preserve existing CORS rules needed by the admin/mobile upload paths. CORS does not grant IAM upload permission. After restoring configuration, create a product with a small JPG/PNG, save its draft, and confirm its image loads after revisiting the product. Repeat a verification-document upload if that flow is in use.

Sources: [AWS presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html), [AWS CORS troubleshooting](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors-troubleshooting.html).

Validation: `node scripts/test-storage-upload.cjs`; real DOMParser and mocked upload outcomes in Chrome. Successful production upload remains dependent on the deployed AWS credentials and bucket configuration.


Buyer and seller chat photos use `user-uploads/private-chat/<user-id>/*`.
The backend signing key needs `s3:PutObject` and `s3:GetObject` (including HEAD)
on that prefix. Preserve public access blocking and existing CORS for the
provider origin. Chat photos are excluded from the public image proxy and
receive 15-minute signed view URLs only after conversation membership is
checked. Each message supports four JPG, PNG or WebP photos up to 5 MB each.
Do not add public bucket access for this prefix. Validate a real buyer upload,
provider reply with a photo, and history reload after deployment.
