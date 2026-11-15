# PNR Tracker

PNR Tracker is a lightweight personal project for checking Indian Railways PNR status and getting an email when a booking's status changes.

It is meant for personal use and a small group of friends, not as a public or production-scale service.

**Live site:** https://main.d321bth21mrx57.amplifyapp.com

---

## Repository layout

```text
backend/               5 Lambda functions, one folder each
frontend/              React + Vite app
infra/                 IAM policy files for the GitHub Actions deploy role
.github/workflows/     deploy-lambdas.yml - deploys changed Lambdas on push
amplify.yml            Amplify build spec for the frontend (monorepo)
```

## Architecture

- React + Vite frontend, hosted on AWS Amplify
- Amazon API Gateway (HTTP API) in front of five AWS Lambda functions
- DynamoDB table `pnr-tracking`
- Amazon SNS for email notifications (one topic per tracking request)
- Amazon EventBridge **Scheduler** to run the update Lambda every 30 minutes
- Railkit API as the source of PNR data

```text
                         ┌──────────────────┐
                         │   React client   │
                         └────────┬─────────┘
                                  │
     ┌───────────────┬────────────┼──────────────┬─────────────────────┐
     │               │            │              │                     │
GET /pnr/{pnr}  POST /track  GET /track/{id}  GET /trackings?email|pnr
     │               │            │              │
     ▼               ▼            ▼              ▼
 pnr-checker   pnr-track-    pnr-get-       pnr-list-tracking-
     │          request       tracking        by-email
     ▼           │  │            │              │
  Railkit        │  └─> Railkit  └──────┬───────┘
                 ▼                      ▼
        DynamoDB + SNS              DynamoDB


EventBridge Scheduler (every 30 minutes)
      │
      ▼
pnr-update-tracking ──> Railkit
      │
      ├──> DynamoDB
      └──> SNS ──> recipient's email
```

---

# Frontend

React 19 + Vite. The UI has two tabs:

- **Check PNR** – look up a PNR and optionally start email tracking for it.
- **My trackings** – find your active tracking requests by **email**, **PNR** or **tracking ID**.

Both tabs stay mounted (the inactive one is just hidden), so what you typed and any results survive switching tabs.

## Structure

```text
frontend/
├── public/favicon.svg
├── src/
│   ├── components/
│   │   ├── FormField.jsx       labelled input with hint/error
│   │   ├── PnrForm.jsx         "Check PNR" tab
│   │   ├── PnrStatus.jsx       live PNR result -> TrainCard
│   │   ├── TrackingForm.jsx    start tracking (email) + tracking ID copy
│   │   ├── TrackingLookup.jsx  "My trackings" tab
│   │   ├── TrackingResult.jsx  saved tracking -> TrainCard
│   │   ├── TrainCard.jsx       the one-card-per-train UI
│   │   └── PassengerCard.jsx   one passenger row
│   ├── services/pnrApi.js      all HTTP calls
│   ├── utils/
│   │   ├── pnrUtils.js         eligibility, labels, IST date/time helpers
│   │   └── validation.js       PNR / email / tracking-ID validation
│   ├── App.jsx                 header + tabs
│   ├── index.css               all styling
│   └── main.jsx
├── .env.example
├── eslint.config.js
├── index.html
├── package.json
└── vite.config.js
```

## Components

- **`TrainCard`** – the shared card shown for every train, whether it comes from a live PNR check or from a saved tracking. It shows the PNR, train name and number, a departure → arrival timeline (times, dates, stations, journey duration, all in IST), chips for class (e.g. `Sleeper (SL)`, `AC 3 Tier (3A)`), quota, distance and chart status, and the passengers with colour-coded status pills (green confirmed, amber RAC, red waiting list, grey cancelled).
- **`PnrForm`** – validates a 10-digit PNR, calls `GET /pnr/{pnr}`, renders `PnrStatus`, and shows `TrackingForm` only if the PNR can still be tracked.
- **`TrackingForm`** – validates an email, calls `POST /track`, and shows the tracking ID with a copy button.
- **`TrackingLookup`** – a mode switch (Email / PNR / Tracking ID) over one input. Email and PNR search call `GET /trackings` and list **active** trackings only; Tracking ID calls `GET /track/{id}` and shows that request, including why it stopped if it did.

## Shared logic (`utils/pnrUtils.js`)

- `canTrackPnr` / `isChartPrepared` – eligibility (chart not prepared, journey not passed). Same lenient chart check as the backend.
- `statusLabel`, `statusTone` – passenger status → readable label / colour.
- `classLabel` – class code → name (`SL` → `Sleeper (SL)`).
- `formatTime`, `formatDay`, `formatDuration` – IST formatting for the timeline.
- `parseRailkitDate` – parses Railkit's `"Sep 2, 2026 3:30:00 PM"` strings (IST).

---

# Backend

Five Lambda functions behind one API Gateway HTTP API, in `ap-south-1`.

| Method | Route | Lambda (deployed name) | Purpose |
| ------ | ----- | ---------------------- | ------- |
| `GET`  | `/pnr/{pnr}` | `pnr-checker` (`pnr-status-checker`) | Current PNR status from Railkit |
| `POST` | `/track` | `pnr-track-request` | Start tracking a PNR for an email |
| `GET`  | `/track/{trackingId}` | `pnr-get-tracking` | Get one tracking request |
| `GET`  | `/trackings?email=…` or `?pnr=…` | `pnr-list-tracking-by-email` | List **active** trackings for an email or PNR, newest first |
| –      | (EventBridge Scheduler) | `pnr-update-tracking` | Re-check every active PNR and notify on change |

Base URL: `https://wqhly6ibz1.execute-api.ap-south-1.amazonaws.com`

## `pnr-track-request`

`POST /track` with `{ "pnr": "2842762869", "email": "you@example.com" }`.

- Validates the request.
- Rejects with `409` (and the existing `trackingId`) if this PNR/email pair is already actively tracked.
- Checks the PNR now; rejects it if the chart is already prepared or the journey has passed.
- Creates an SNS topic, subscribes the email, and stores the record in DynamoDB.

## `pnr-get-tracking` and `pnr-list-tracking-by-email`

Both return only client-safe fields: `trackingId`, `pnr`, `trainNumber`, `trainName`, `source`, `destination`, `journeyDate` (departure), `arrivalDate`, `travelClass`, `quota`, `lastStatus`, `active`, `stopReason` (plus `notificationStatus` for get, `createdAt`/`updatedAt`/`email` for list). SNS ARNs and other internals are never returned.

The list Lambda runs a filtered `Scan` (`email = :k AND active = true`, or `pnr = :k …`) because the `PnrEmailIndex` GSI is keyed on `pnr#email` and cannot be queried by email alone. That is fine for a small table; add a GSI on `email` if it grows.

> **Known gap – authentication:** `GET /trackings` (and the other routes) are **unauthenticated**. Anyone who knows an email or PNR can list its trackings. This is accepted for a personal project. If it needs fixing: add a Cognito user pool + JWT authorizer on the route, set `REQUIRE_AUTH=true` on the Lambda (it already prefers a verified `email` claim and then ignores `?email=`/`?pnr=`), and add sign-in to the frontend.

## `pnr-update-tracking`

Invoked every 30 minutes by an EventBridge **Scheduler** schedule named `pnr-tracker-update-schedule` (`rate(30 minutes)`, Asia/Calcutta) through a dedicated execution role. Note this is EventBridge *Scheduler*, a separate API from classic EventBridge *Rules*: `aws scheduler list-schedules` shows it, `aws events list-rules` does not.

For each active tracking it:

1. Fetches the latest status from Railkit.
2. Compares it with the stored `lastStatus` (passengers matched by serial number).
3. Saves the new status **first**, then emails on change. Saving before sending means a crash between the two can skip a notification but never send a duplicate.
4. Stops tracking when a final state is reached (see below) and deletes that request's SNS topic.

## When tracking stops

Tracking stops when any of these is reached, and the reason is stored as `stopReason`:

| `stopReason` | Meaning |
| ------------ | ------- |
| `CHART_PREPARED` | Railway chart prepared |
| `ALL_CONFIRMED` | All passengers confirmed |
| `ALL_CANCELLED` | All passengers cancelled |
| `JOURNEY_OVER` | Departure time has passed |
| `INVALID_PNR` | Railkit reports the PNR as not found on **3 consecutive** scheduled runs |

A single "invalid PNR" response is not enough: Railkit's upstream source can return the same error during an outage or maintenance window. `invalidCheckCount` must reach the threshold, and any successful check in between resets it to zero.

## Email notifications

Notifications use **Amazon SNS**, not SES, so no sending domain or SES production access is needed. Each tracking request has its own SNS topic, so one person's updates can never reach another person. The recipient must click **Confirm subscription** in the first SNS email (check spam) before updates are delivered. Messages are plain text and contain the PNR, train, journey date, chart status, each passenger's status/coach/berth, what changed, and whether tracking is still active or why it stopped.

## DynamoDB

Table `pnr-tracking`, partition key `trackingId`. A record holds:

- identity: `trackingId`, `pnr`, `email`, `trackingKey` (`{pnr}#{email}`, email lowercased)
- train: `trainNumber`, `trainName`, `source`, `destination`, `journeyDate` (departure, ISO/UTC), `arrivalDate`, `travelClass`, `quota`
- status: `lastStatus` (`chart` + `passengers[]` with serial number, status, details, coach, berth)
- tracking state: `active`, `stopReason`, `invalidCheckCount`
- notifications: `snsTopicArn`, `snsSubscriptionArn`, `notificationStatus`
- `createdAt`, `updatedAt`

GSI **`PnrEmailIndex`** (partition key `trackingKey`) lets `pnr-track-request` reject duplicate active requests.

Records created before `source`/`destination`/`arrivalDate`/`travelClass`/`quota` were added were backfilled for active trackings; stopped older ones simply show `--` in the UI.

## Configuration

Lambda environment variables (set in the Lambda configuration; never commit secrets):

| Variable | Used by | Purpose |
| -------- | ------- | ------- |
| `RAILKIT_API_KEY` | `pnr-checker`, `pnr-track-request`, `pnr-update-tracking` | Railkit credential |
| `TRACKING_TABLE_NAME` | `pnr-track-request`, `pnr-get-tracking`, `pnr-update-tracking` | DynamoDB table name |
| `TABLE_NAME` | `pnr-list-tracking-by-email` | DynamoDB table name (defaults to `pnr-tracking`) |
| `REQUIRE_AUTH` | `pnr-list-tracking-by-email` | Optional; `true` rejects unauthenticated calls (see the auth note) |

The AWS region comes from the Lambda runtime.

## IAM permissions (Lambda execution roles)

- `pnr-track-request`: `sns:CreateTopic`, `sns:Subscribe`, DynamoDB `PutItem` and `Query` (including on the `PnrEmailIndex` index).
- `pnr-get-tracking`: DynamoDB `GetItem`.
- `pnr-list-tracking-by-email`: DynamoDB `Scan`.
- `pnr-update-tracking`: DynamoDB `Scan` and `UpdateItem`; `sns:ListSubscriptionsByTopic`, `sns:Publish`, `sns:DeleteTopic`.

---

# Local development

Frontend, from `frontend/`:

```powershell
npm install
copy .env.example .env.local   # then set VITE_API_BASE_URL
npm run dev                    # http://localhost:5173
npm run lint
npm run build
```

`.env.local`:

```env
VITE_API_BASE_URL=https://wqhly6ibz1.execute-api.ap-south-1.amazonaws.com
```

`.env.local` is git-ignored; `.env.example` lists the required variable names. The API URL is read with `import.meta.env.VITE_API_BASE_URL` and must never be hardcoded in components. `http://localhost:5173` is already in the API's CORS allow-list.

---

# Deployment

Both halves deploy automatically when you push to `main`.

## Frontend – AWS Amplify

The Amplify app `pnr-tracker-aws` (`ap-south-1`) is connected to this repo's `main` branch and builds on every push.

- `amplify.yml` is the monorepo build spec: `appRoot: frontend`, `npm ci`, `npm run build`, output `dist`.
- The only build setting is the Amplify environment variable `VITE_API_BASE_URL`; Vite bakes it into the bundle.
- The default `*.amplifyapp.com` URL is used on purpose (no custom domain, to avoid the cost).
- The site's URL must be in the API Gateway CORS `AllowOrigins`. If the Amplify app is ever recreated, add its new URL there.

## Backend – GitHub Actions

`.github/workflows/deploy-lambdas.yml` runs on pushes to `main` that touch `backend/**` (or the workflow file), and manually from the Actions tab.

- It deploys only the functions whose `backend/<folder>/` changed; editing the workflow file or running it manually deploys all five.
- For each one: `npm ci --omit=dev`, zip, `aws lambda update-function-code`, wait until updated. Each folder therefore needs a committed `package-lock.json`.
- Folder → function: `pnr-checker` → `pnr-status-checker`; the others use their folder name.
- It deploys **code only**. Lambda settings, environment variables, IAM roles, API routes, the schedule and DynamoDB are changed manually.

### AWS access (OIDC, no stored keys)

The workflow signs in with GitHub OIDC and assumes the IAM role `github-actions-pnr-deploy`. The files in `infra/` exist only for this:

- `infra/github-actions-trust-policy.json` – who may assume the role: only this repository's `main` branch. GitHub's subject claim carries numeric IDs (`repo:<owner>@<ownerId>/<repo>@<repoId>:ref:refs/heads/main`), so the policy uses that exact form.
- `infra/github-actions-deploy-policy.json` – what the role may do: `lambda:UpdateFunctionCode` and `lambda:GetFunctionConfiguration` on the five functions, nothing else.

To recreate it in a new account, put your account ID in both files and run:

```bash
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com
aws iam create-role --role-name github-actions-pnr-deploy --assume-role-policy-document file://infra/github-actions-trust-policy.json
aws iam put-role-policy --role-name github-actions-pnr-deploy --policy-name deploy-lambdas --policy-document file://infra/github-actions-deploy-policy.json
```

---

# Testing

Check a PNR:

```powershell
Invoke-RestMethod -Uri "https://wqhly6ibz1.execute-api.ap-south-1.amazonaws.com/pnr/2842762869"
```

Start tracking:

```powershell
$body = @{ pnr = "2842762869"; email = "you@example.com" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://wqhly6ibz1.execute-api.ap-south-1.amazonaws.com/track" `
    -Method POST -ContentType "application/json" -Body $body
```

Then confirm the SNS subscription email. Calling `/track` again for the same active PNR/email returns `409 Conflict` with the existing `trackingId`.

Look a tracking up:

```powershell
Invoke-RestMethod -Uri "https://wqhly6ibz1.execute-api.ap-south-1.amazonaws.com/track/<trackingId>"
Invoke-RestMethod -Uri "https://wqhly6ibz1.execute-api.ap-south-1.amazonaws.com/trackings?email=you@example.com"
Invoke-RestMethod -Uri "https://wqhly6ibz1.execute-api.ap-south-1.amazonaws.com/trackings?pnr=2842762869"
```

To test the scheduled flow without waiting, invoke `pnr-update-tracking` manually from the Lambda console. There are no automated tests yet.

---

# Scope and future work

The project intentionally uses a DynamoDB scan and serial processing because it is built for a handful of users. The API has no rate limiting beyond API Gateway defaults.

Possible next steps:

- Authentication for the tracking routes (see the known gap above) and rate limiting.
- A GSI on `email` instead of a filtered scan.
- Better monitoring and alarms (for example if the scheduler stops firing).
- Automated tests.

---

# Tech stack

- **Frontend:** React, Vite, JavaScript, CSS (hosted on AWS Amplify)
- **Backend:** AWS Lambda (Node.js), API Gateway, DynamoDB, SNS, EventBridge Scheduler
- **CI/CD:** AWS Amplify (frontend), GitHub Actions + OIDC (Lambdas)
- **External API:** Railkit
