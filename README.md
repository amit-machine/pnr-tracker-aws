# PNR Tracker (AWS Lambda)

PNR Tracker is a lightweight personal project for checking Indian Railways PNR status and receiving an email when the status changes. It is intended for the owner and a small group of friends—not as a public or production-scale service.

## How it works

```text
Client
  |-- GET  /pnr/{pnr} ------------------> pnr-checker
  |-- POST /tracking { pnr, email } ----> pnr-track-request --+--> Railkit
  |-- GET  /tracking/{trackingId} ------> pnr-get-tracking ---+--> DynamoDB

EventBridge (every 6 hours)
  |--> pnr-update-tracking --> Railkit --> DynamoDB --> Amazon SES --> recipient
```

| Lambda | Purpose |
| --- | --- |
| `pnr-checker` | Checks the current status for a 10-digit PNR. |
| `pnr-track-request` | Starts tracking a PNR and stores the initial status and recipient email. |
| `pnr-get-tracking` | Returns a tracking request by `trackingId`. |
| `pnr-update-tracking` | Runs every six hours, checks active PNRs, emails on a status change, and stops tracking after a final state. |

## Configuration

Configure these in the relevant Lambda configuration or a secure deployment system; do not put secrets in this repository.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `RAILKIT_API_KEY` | checker, create-tracking, update-tracking | Railkit API credential. |
| `TRACKING_TABLE_NAME` | create-tracking, get-tracking, update-tracking | DynamoDB table name. |
| `AWS_REGION` | update-tracking | SES region, defaults in code to `ap-south-1`. |
| `FROM_EMAIL` | update-tracking | SES-verified sender address. Use `amit777kr@gmail.com` or another email address you own. |

The DynamoDB table uses `trackingId` (String) as its partition key.

## Email notifications with Amazon SES

SES is currently blocked by its sandbox. In the current SES console, **Request production access** stays disabled until a sending domain has been verified. An individually verified Gmail address is enough for sandbox tests, but it does not unlock this console flow for sending to unverified recipients.

To continue using SES for any recipient, purchase or use a domain you control, verify it in SES with its DNS records, then request production access in `ap-south-1`.

Because this is a small no-domain personal project, a better alternative is Amazon SNS email notifications. A friend enters their email address, receives an AWS subscription-confirmation email, and clicks the confirmation link once. After that, SNS can send that friend PNR alerts without SES production access or a domain. This requires a small code change and produces plain-text emails rather than the current custom HTML email.

## Scope

The project intentionally uses a simple DynamoDB scan and serial processing because it is only for a small number of people. A basic API rate limit is the only near-term protection planned before sharing it with friends.
