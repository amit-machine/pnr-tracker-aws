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

SES is the current blocker. While an SES account is in the sandbox, it can email only verified recipient addresses. To send PNR updates to friends without manually verifying every one of their emails, request production access in **ap-south-1**.

You do not need to buy a domain. A verified Gmail address can be used as the sender.

1. Open the [SES account dashboard in ap-south-1](https://ap-south-1.console.aws.amazon.com/ses/home?region=ap-south-1#/account).
2. In **Verified identities**, make sure `amit777kr@gmail.com` is verified.
3. On **Account dashboard**, use the sandbox notice: **View Get set up page** → **Request production access**.
4. Choose **Transactional**. Describe the use case clearly: “A small personal PNR tracking tool for me and friends. Users explicitly enter their own email address to receive status-change notifications only. No marketing or bulk email.”
5. Use a small, realistic volume, such as fewer than 20 recipients and fewer than 100 emails per day, then submit the request.
6. After AWS approves it, test with a friend’s email address that has not been verified in SES.

The SES sender identity and the production-access request must be in `ap-south-1`, because that is the region used by the update Lambda. If sending still fails after approval, confirm the Lambda role has `ses:SendEmail` permission and that `FROM_EMAIL` is verified in that same region.

## Scope

The project intentionally uses a simple DynamoDB scan and serial processing because it is only for a small number of people. A basic API rate limit is the only near-term protection planned before sharing it with friends.
