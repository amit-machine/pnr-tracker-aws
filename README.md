# PNR Tracker (AWS Lambda)

PNR Tracker checks Indian Railways PNR status through Railkit, stores tracking requests in Amazon DynamoDB, and sends an email when a tracked status changes. An Amazon EventBridge schedule invokes the tracker every six hours.

## Current architecture

```text
Client
  |-- GET  /pnr/{pnr} ------------------> pnr-checker
  |-- POST /tracking { pnr, email } ----> pnr-track-request --+--> Railkit
  |-- GET  /tracking/{trackingId} ------> pnr-get-tracking ---+--> DynamoDB

EventBridge (rate: 6 hours)
  |--> pnr-update-tracking --> Railkit --> DynamoDB --> Amazon SES --> recipient
```

| Lambda | Trigger | Responsibility |
| --- | --- | --- |
| `pnr-checker` | API Gateway | Validates a 10-digit PNR and returns its current Railkit status. |
| `pnr-track-request` | API Gateway | Validates PNR and email, fetches the initial status, and creates an active DynamoDB tracking record. |
| `pnr-get-tracking` | API Gateway | Retrieves one tracking record by its `trackingId`. |
| `pnr-update-tracking` | EventBridge, every 6 hours | Scans active records, compares the latest Railkit status, emails on change, and stops tracking at a final state. |

## DynamoDB item shape

The table's partition key must be `trackingId` (String). Each item includes `pnr`, `email`, `active`, `journeyDate`, `lastStatus`, `createdAt`, and `updatedAt`.

## Environment variables

Configure these in the relevant Lambda configuration or a secure deployment system; do not put secrets in this repository.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `RAILKIT_API_KEY` | checker, create-tracking, update-tracking | Railkit API credential. |
| `TRACKING_TABLE_NAME` | create-tracking, get-tracking, update-tracking | DynamoDB table name. |
| `AWS_REGION` | update-tracking | SES region, defaults in code to `ap-south-1`. |

The SES sender is currently hard-coded in `pnr-update-tracking/index.mjs`. Move it to a `FROM_EMAIL` environment variable before production so code and environments stay separate.

## Required AWS permissions

Use a separate least-privilege IAM role for each Lambda.

| Lambda | Minimum permissions |
| --- | --- |
| `pnr-track-request` | `dynamodb:PutItem` on the tracking table |
| `pnr-get-tracking` | `dynamodb:GetItem` on the tracking table |
| `pnr-update-tracking` | `dynamodb:Scan`, `dynamodb:UpdateItem` on the tracking table; `ses:SendEmail` for the verified SES identity |
| all | CloudWatch Logs write permissions |

The EventBridge rule needs permission to invoke `pnr-update-tracking`.

## SES sandbox versus production

SES sandbox is expected to reject an email sent to an unverified recipient. While in the sandbox, verify both the sender and every recipient in the same SES region. To send tracker notifications to arbitrary users, request production access in that same region and verify a domain identity (recommended) with DKIM. The production-access request should describe this opt-in, transactional PNR-status use case, how recipient consent is obtained, expected volume, bounce/complaint handling, and an unsubscribe/contact path.

Do not work around the sandbox by using unverified addresses. Until production access is approved, use one verified test recipient. A separate transactional email provider is an alternative only if its terms, identity verification, and compliance suit the product.

## Local development and packaging

This repository currently keeps each Lambda as its own deployable package. That is valid for Lambda: each function needs only the dependencies it imports, and each folder has its own `package.json` and lock file. Do not commit `node_modules`; use the lock files to reproduce dependencies.

After installing Node.js locally, build each deployment zip from within its Lambda directory so `index.mjs` and its production dependencies are at the zip root. Confirm the Lambda handler is `index.handler`.

```powershell
cd pnr-track-request
npm ci --omit=dev
Compress-Archive -Path index.mjs, node_modules -DestinationPath ..\pnr-track-request.zip -Force
```

Repeat for the other three folders. If this grows, migrate to one root npm workspace with shared code in a `packages/shared` package and deploy through AWS SAM or the AWS CDK. That should be the next architecture refactor—not an immediate prerequisite for GitHub.

## Important current limitations

- There is no infrastructure-as-code definition, so API Gateway routes, Lambda settings, IAM roles, EventBridge rule, and DynamoDB table are not reproducible from this repository.
- `pnr-update-tracking` uses DynamoDB `Scan`, which becomes expensive and slow as tracking requests grow. Model active records for a `Query`, or use a scheduled queue-based design.
- The update Lambda processes records serially and has no pagination. It can time out or miss records once the table grows.
- Tracking records are created with `verified: false`, but there is no email-verification flow and the value is not enforced. Add a verification token before activating notifications.
- The get-tracking endpoint returns the stored email address. Restrict access or redact it from API responses.
- No tests, retries/dead-letter handling, structured metrics, TTL cleanup, or alarms are currently defined.

## GitHub publishing

1. Create an empty private GitHub repository in the GitHub website; do not initialize it with a README, license, or `.gitignore`.
2. In this project directory, run:

```powershell
git init
git add .
git commit -m "Initial PNR Tracker Lambda implementation"
git branch -M main
git remote add origin https://github.com/<your-account>/<your-repository>.git
git push -u origin main
```

3. Authenticate with GitHub when prompted (GitHub CLI, Git Credential Manager, or a fine-grained personal access token). Before the first push, review `git status` and `git diff --cached` to confirm no secrets, Lambda zip files, or `node_modules` are staged.

Use a private repository until API design and security are ready for public sharing.

## Recommended next steps

1. Publish the current source safely to a private GitHub repository.
2. Add infrastructure-as-code (AWS SAM is a simple fit) and move the sender address to configuration.
3. Build verified, double-opt-in email tracking and submit the SES production-access request.
4. Add tests, API authorization/rate limits, DynamoDB TTL, monitoring, and a scalable active-record processing model.

