# PNR Tracker (AWS Lambda)

PNR Tracker is a small personal learning project for checking Indian Railways PNR status through Railkit. It stores tracking requests in Amazon DynamoDB and sends an email when a tracked status changes. An Amazon EventBridge schedule invokes the tracker every six hours.

It is intended for the owner and a small group of friends—not as a public or production-scale service. The design intentionally stays simple.

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
| `FROM_EMAIL` | update-tracking | Verified SES sender address. Defaults temporarily to `amit777kr@gmail.com`. |

Set `FROM_EMAIL` to an email address you have verified in SES in `ap-south-1`. You do **not** need to buy or verify a domain for this small project; an individually verified Gmail address is enough as the sender.

## Required AWS permissions

Use a separate least-privilege IAM role for each Lambda.

| Lambda | Minimum permissions |
| --- | --- |
| `pnr-track-request` | `dynamodb:PutItem` on the tracking table |
| `pnr-get-tracking` | `dynamodb:GetItem` on the tracking table |
| `pnr-update-tracking` | `dynamodb:Scan`, `dynamodb:UpdateItem` on the tracking table; `ses:SendEmail` for the verified SES identity |
| all | CloudWatch Logs write permissions |

The EventBridge rule needs permission to invoke `pnr-update-tracking`.

## Sending emails to friends with SES

SES sandbox is expected to reject an email sent to an unverified recipient. While in the sandbox, verify both the sender and every recipient in the **same SES region**. This project uses `ap-south-1`, so verify the sender and request production access there—not in another region.

To let a friend use their own email address, request that SES production access be enabled:

1. Open the [SES console for ap-south-1](https://ap-south-1.console.aws.amazon.com/ses/home?region=ap-south-1#/account).
2. Verify `amit777kr@gmail.com` (or your chosen `FROM_EMAIL`) under **Verified identities**. Confirm its status is *Verified*.
3. On **Account dashboard**, use the sandbox notice: **View Get set up page** → **Request production access**.
4. Choose **Transactional**. Describe the use case clearly: “A small personal PNR tracking tool for me and friends. Users explicitly enter their own email address to receive status-change notifications only. No marketing or bulk email.”
5. State a small, realistic volume (for example, fewer than 20 recipients and fewer than 100 emails per day). Provide a contact email you monitor. If the form asks for a website, use this GitHub repository URL and explain that it is a private personal project with no public website.
6. Submit, then wait for AWS’s review. Approval is controlled by AWS; there is no code change that can bypass the sandbox safely.

After approval, test with an unverified friend’s address. If it fails, first confirm the SES account is out of the sandbox in `ap-south-1`, the sender identity is verified in `ap-south-1`, the Lambda uses that same region, and its IAM role allows `ses:SendEmail`.

## Local development and packaging

This repository currently keeps each Lambda as its own deployable package. That is valid for Lambda: each function needs only the dependencies it imports, and each folder has its own `package.json` and lock file. Do not commit `node_modules`; use the lock files to reproduce dependencies.

After installing Node.js locally, build each deployment zip from within its Lambda directory so `index.mjs` and its production dependencies are at the zip root. Confirm the Lambda handler is `index.handler`.

```powershell
cd pnr-track-request
npm ci --omit=dev
Compress-Archive -Path index.mjs, node_modules -DestinationPath ..\pnr-track-request.zip -Force
```

Repeat for the other three folders. If this grows, migrate to one root npm workspace with shared code in a `packages/shared` package and deploy through AWS SAM or the AWS CDK. That should be the next architecture refactor—not an immediate prerequisite for GitHub.

## Intentional scope and current limitations

- There is no infrastructure-as-code definition, so API Gateway routes, Lambda settings, IAM roles, EventBridge rule, and DynamoDB table are not reproducible from this repository.
- `pnr-update-tracking` uses DynamoDB `Scan` and processes records serially. This is acceptable for the very small number of personal tracking requests expected here, but it is not designed for a large user base.
- Tracking records are created with `verified: false`, but there is no email-verification flow and the value is not enforced. Keep use limited to people you know; add verification if the project is ever opened beyond that group.
- The get-tracking endpoint returns the stored email address. Treat `trackingId` links as private and do not share them.
- A basic API rate limit is still worth adding before sharing the endpoints, to avoid accidental or deliberate abuse.

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

The repository is intentionally private because this is a personal project.

## Recommended next steps

1. Add `FROM_EMAIL` to the `pnr-update-tracking` Lambda configuration and deploy this small code update.
2. Request SES production access in `ap-south-1` and test with one friend’s email.
3. Add a basic API Gateway rate limit before sharing the endpoints.
4. Keep the architecture as-is unless the group or message volume grows significantly.
