# PNR Tracker (AWS Lambda)

PNR Tracker is a lightweight personal project for checking Indian Railways PNR status and receiving an email when the status changes. It is intended for the owner and a small group of friends—not as a public or production-scale service.

## How it works

```text
Client
  |-- GET  /pnr/{pnr} ------------------> pnr-checker
  |-- POST /tracking { pnr, email } ----> pnr-track-request --+--> Railkit
  |-- GET  /tracking/{trackingId} ------> pnr-get-tracking ---+--> DynamoDB

EventBridge (every 6 hours)
  |--> pnr-update-tracking --> Railkit --> DynamoDB --> Amazon SNS --> recipient
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
| `AWS_REGION` | create-tracking, update-tracking | SNS region, defaults in code to `ap-south-1`. |

The DynamoDB table uses `trackingId` (String) as its partition key.

## Email notifications with Amazon SNS

This project uses Amazon SNS instead of Amazon SES. It does not require a sending domain or SES production access.

When someone starts tracking a PNR, the create-tracking Lambda creates a private SNS topic and subscribes the email address to it. SNS sends that person a confirmation email. They must click **Confirm subscription** before they can receive PNR updates.

SNS notifications are plain text, so the former custom HTML SES email design is no longer used. Each tracking request has its own topic, which prevents one friend from receiving another person's PNR updates.

Give the Lambda roles these SNS permissions in `ap-south-1`:

| Lambda | Permissions |
| --- | --- |
| `pnr-track-request` | `sns:CreateTopic`, `sns:Subscribe` |
| `pnr-update-tracking` | `sns:ListSubscriptionsByTopic`, `sns:Publish` |

The existing DynamoDB permissions remain unchanged.

## Scope

The project intentionally uses a simple DynamoDB scan and serial processing because it is only for a small number of people. A basic API rate limit is the only near-term protection planned before sharing it with friends.
