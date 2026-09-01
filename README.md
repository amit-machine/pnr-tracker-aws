# PNR Tracker

PNR Tracker is a lightweight personal project for checking Indian Railways PNR status and receiving email notifications when a booking status changes.

The project is intended for personal use and a small group of friends rather than as a public or production-scale service.

---

## Repository Layout

```text
backend/     4 Lambda functions (pnr-checker, pnr-track-request, pnr-get-tracking, pnr-update-tracking)
frontend/    React + Vite app
```

## Architecture

The project consists of:

- React + Vite frontend
- AWS API Gateway
- AWS Lambda
- DynamoDB
- Amazon SNS
- Amazon EventBridge
- Railkit API for PNR status

The high-level flow is:

```text
                              ┌──────────────────┐
                              │   React Client   │
                              └─────────┬────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
        GET /pnr/{pnr}             POST /track          GET /track/{trackingId}
              │                         │                         │
              ▼                         ▼                         ▼
        pnr-checker             pnr-track-request           pnr-get-tracking
              │                         │                         │
              ▼                         ├──> Railkit               ▼
           Railkit                      │                     DynamoDB
                                         ▼
                                    DynamoDB
                                         │
                                         ▼
                                        SNS


EventBridge
(every 30 minutes)
      │
      ▼
pnr-update-tracking
      │
      ├──> Railkit
      ├──> DynamoDB
      └──> Amazon SNS
                 │
                 ▼
              Recipient
```

---

# Frontend

The frontend is built using React + Vite.

## Frontend structure

```text
frontend/
│
├── src/
│   ├── components/
│   │   ├── PassengerCard.jsx
│   │   ├── PnrForm.jsx
│   │   ├── PnrStatus.jsx
│   │   ├── TrackingForm.jsx
│   │   └── TrackingLookup.jsx
│   │
│   ├── services/
│   │   └── pnrApi.js
│   │
│   ├── utils/
│   │   └── pnrUtils.js
│   │
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
│
├── public/
├── .env.example
├── .env.local
├── .gitignore
├── eslint.config.js
├── index.html
├── package.json
├── package-lock.json
└── vite.config.js
```

The frontend is intentionally split into smaller components instead of keeping the entire UI inside one large component.

### Components

#### `PnrForm.jsx`

Responsible for:

- Accepting the 10-digit PNR.
- Validating the PNR.
- Calling the PNR status API.
- Handling loading and error states.
- Displaying the status and tracking sections.

#### `PnrStatus.jsx`

Responsible for displaying:

- PNR number.
- Chart status.
- Train information.
- Journey details.
- Class and quota.
- Distance.
- Passenger information.

#### `PassengerCard.jsx`

Responsible for displaying information for an individual passenger, including a human-readable status label (for example "Waiting List" instead of the raw `WL` code).

#### `TrackingForm.jsx`

Responsible for:

- Accepting an email address.
- Validating the email.
- Starting PNR tracking.
- Displaying tracking confirmation.
- Displaying the tracking ID with a copy-to-clipboard button so it can be used later to check on the request.

#### `TrackingLookup.jsx`

Responsible for:

- Accepting an existing tracking ID.
- Retrieving that tracking request.
- Displaying its current PNR, train, chart, and passenger status.

#### `services/pnrApi.js`

Contains API-related functionality so that HTTP calls are kept separate from UI components.

#### `utils/pnrUtils.js`

Contains shared frontend logic that doesn't belong in a component:

- `canTrackPnr` — determines whether a PNR is still eligible for tracking (chart not yet prepared, journey not yet passed).
- `isChartPrepared` — the same lenient chart-status check used by the backend, so the frontend and backend agree on eligibility.
- `statusLabel` — maps raw passenger status codes (`WL`, `CNF`, `RAC`, `CAN`) to human-readable labels.

---

# Backend

The backend uses AWS Lambda functions behind API Gateway.

## Lambda functions

### `pnr-checker`

Checks the current status of a 10-digit PNR.

```text
GET /pnr/{pnr}
```

### `pnr-track-request`

Starts tracking a PNR for an email address.

Responsibilities:

- Validate the request.
- Reject the request if this PNR/email pair is already being actively tracked.
- Check the current PNR status.
- Reject the request if the railway chart has already been prepared or the journey has already passed.
- Create an SNS topic.
- Subscribe the email address to the topic.
- Store the initial tracking information in DynamoDB.

```text
POST /track
```

Request:

```json
{
  "pnr": "2842762869",
  "email": "your-email@example.com"
}
```

### `pnr-get-tracking`

Returns an existing tracking request using its tracking ID.

The response only includes fields relevant to the client (`trackingId`, `pnr`, `trainNumber`, `trainName`, `journeyDate`, `lastStatus`, `active`, `notificationStatus`, `stopReason`). It intentionally excludes the recipient's email address and the internal SNS topic/subscription ARNs.

```text
GET /track/{trackingId}
```

### `pnr-update-tracking`

Runs periodically through an EventBridge Scheduler schedule named `pnr-tracker-update-schedule` (`rate(30 minutes)`), which invokes this Lambda directly via a dedicated execution role. This is EventBridge **Scheduler**, a separate AWS API from classic EventBridge **Rules** — worth remembering when checking whether it's still configured, since `aws events list-rules` won't show it.

Responsibilities:

- Find active tracking requests.
- Check the latest PNR status.
- Compare it with the previously stored status, matching passengers by serial number.
- Store the new status first, then send an email when the status changes. Storing before sending means a crash between the two steps can only skip a notification, never send a duplicate one on the next run.
- Stop tracking when a final state is reached.

---

# API Routes

The current API Gateway routes are:

| Method | Route                 | Lambda              | Purpose                     |
| ------ | --------------------- | ------------------- | --------------------------- |
| `GET`  | `/pnr/{pnr}`          | `pnr-checker`       | Check current PNR status    |
| `POST` | `/track`              | `pnr-track-request` | Start tracking a PNR        |
| `GET`  | `/track/{trackingId}` | `pnr-get-tracking`  | Retrieve a tracking request |

### Base URL

```text
https://wqhly6ibz1.execute-api.ap-south-1.amazonaws.com
```

### Example PNR check

```text
GET /pnr/2842762869
```

### Example tracking request

```text
POST /track
Content-Type: application/json

{
  "pnr": "2842762869",
  "email": "your-email@example.com"
}
```

---

# Configuration

## Frontend environment variables

The frontend API URL is configured using Vite environment variables.

Create a local environment file:

```text
.env.local
```

Example:

```env
VITE_API_BASE_URL=https://your-api-gateway-url
```

The application reads the value using:

```javascript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
```

The API URL should not be hardcoded inside React components.

`.env.example` should contain the required variable names without private or environment-specific values:

```env
VITE_API_BASE_URL=
```

`.env.local` should contain the actual local development value and should not be committed to Git.

## Backend environment variables

Configure these in the relevant Lambda configuration or secure deployment system.

Do not put secrets in the repository.

| Variable              | Used by                                                        | Purpose                |
| --------------------- | -------------------------------------------------------------- | ---------------------- |
| `RAILKIT_API_KEY`     | `pnr-checker`, `pnr-track-request`, `pnr-update-tracking`      | Railkit API credential |
| `TRACKING_TABLE_NAME` | `pnr-track-request`, `pnr-get-tracking`, `pnr-update-tracking` | DynamoDB table name    |
| `AWS_REGION`          | Relevant Lambda functions                                      | AWS region             |

The current deployment uses:

```text
ap-south-1
```

---

# DynamoDB

The tracking table uses `trackingId` as its partition key.

Tracking records contain the information required to:

- Identify the tracking request.
- Store the PNR.
- Store the recipient information.
- Store the latest PNR status.
- Determine whether tracking is still active (`active`) and, once stopped, why (`stopReason`).
- Track consecutive "PNR looks invalid" responses (`invalidCheckCount`) before treating one as final. See [When Tracking Stops](#when-tracking-stops).

## `PnrEmailIndex` (GSI)

A global secondary index named `PnrEmailIndex` uses `trackingKey` (`{pnr}#{email}`, lowercased email) as its partition key. `pnr-track-request` queries it to reject a new tracking request when the same PNR/email pair is already being actively tracked.

---

# Email Notifications

The project uses Amazon SNS instead of Amazon SES.

This avoids the requirement for an SES sending domain and SES production access.

When a user starts tracking a PNR:

```text
pnr-track-request
        │
        ▼
Create SNS Topic
        │
        ▼
Subscribe email address
        │
        ▼
SNS sends confirmation email
        │
        ▼
User confirms subscription
```

The user must confirm the SNS subscription before receiving PNR update notifications.

Each tracking request has its own SNS topic. This prevents one person's tracking notifications from being sent to another person.

Notifications are sent as plain-text email messages.

---

# Required SNS Permissions

The Lambda execution roles require the following SNS permissions in `ap-south-1`.

### `pnr-track-request`

```text
sns:CreateTopic
sns:Subscribe
```

### `pnr-update-tracking`

```text
sns:ListSubscriptionsByTopic
sns:Publish
```

`pnr-track-request` additionally requires `dynamodb:Query` permission on the `PnrEmailIndex` GSI (in addition to its existing table permissions) to check for duplicate active tracking requests. Other existing DynamoDB permissions remain unchanged.

---

# Tracking Lifecycle

A tracking request follows this general lifecycle:

```text
POST /track
      │
      ▼
Reject if this PNR/email
is already actively tracked
      │
      ▼
Check PNR immediately
      │
      ▼
Reject if chart already
prepared or journey passed
      │
      ▼
Create SNS topic
+ email subscription
      │
      ▼
Store initial status
in DynamoDB
      │
      ▼
Wait for email confirmation
      │
      ▼
EventBridge invokes
pnr-update-tracking
every 30 minutes
      │
      ▼
Check latest PNR status
      │
      ├── No change
      │       │
      │       ▼
      │   Keep tracking
      │
      ├── Status changed
      │       │
      │       ▼
      │   Save status
      │   + send notification
      │
      └── Final state
              │
              ▼
        Save status
        + send final notification
        + deactivate tracking
```

---

# When Tracking Stops

Tracking is stopped when one of the following conditions is reached:

- Railway chart is prepared.
- All passengers are confirmed.
- All passengers are cancelled.
- The journey time has passed.
- The PNR is no longer recognized by Railkit (`"No PNR data found or invalid PNR number"`), confirmed across 3 consecutive scheduled runs. A single occurrence is not enough on its own — Railkit's upstream source (indianrail.gov.in) can return this same error during a temporary outage or maintenance window, not just for a genuinely expired/invalid PNR, so the record's `invalidCheckCount` must reach the threshold before tracking is actually stopped. Any successful check in between resets the count to zero.

The reason tracking stopped is stored on the record as `stopReason` (`CHART_PREPARED` / `ALL_CONFIRMED` / `ALL_CANCELLED` / `JOURNEY_OVER` / `INVALID_PNR`).

---

# Status Comparison

The update Lambda stores a normalized PNR status snapshot containing:

- Chart status.
- Passenger serial number.
- Passenger current status.
- Passenger current details.
- Passenger coach.
- Passenger berth number.

During the next scheduled update, these values are compared with the previously stored `lastStatus`.

A notification is sent when one or more of these values changes.

---

# Email Update Contents

The update Lambda creates a user-friendly notification containing:

- PNR number.
- Train name and number.
- Journey date.
- Current chart status.
- Current status for each passenger.
- Coach and berth information when available.
- Whether tracking is still active or has reached a final state.

Final notifications explain why tracking stopped, for example:

```text
Chart prepared
All passengers confirmed
All passengers cancelled
Journey completed
```

---

# Local Development

## Frontend

From the `frontend/` directory, install dependencies:

```powershell
npm install
```

Create `.env.local`:

```env
VITE_API_BASE_URL=https://your-api-gateway-url
```

Start the development server:

```powershell
npm run dev
```

The application will be available at the local Vite development URL.

---

# Testing

The project is currently being tested with a clean DynamoDB table.

## 1. Check a PNR

PowerShell:

```powershell
Invoke-RestMethod `
    -Uri "https://wqhly6ibz1.execute-api.ap-south-1.amazonaws.com/pnr/2842762869" `
    -Method GET
```

## 2. Start Tracking

Use the `/track` route:

```powershell
$body = @{
    pnr   = "2842762869"
    email = "your-email@example.com"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "https://wqhly6ibz1.execute-api.ap-south-1.amazonaws.com/track" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

After a successful request:

1. Check the returned `trackingId`.
2. Check DynamoDB for the newly created record.
3. Check the email inbox for the Amazon SNS subscription confirmation.
4. Click **Confirm subscription**.
5. Verify that the DynamoDB record contains the expected tracking information.
6. Manually invoke `pnr-update-tracking` when testing the scheduled update flow.

Calling `/track` again with the same PNR and email while that request is still active returns `409 Conflict` with the existing `trackingId` instead of creating a new record.

## 3. Get a Tracking Request

After receiving a `trackingId`:

```powershell
Invoke-RestMethod `
    -Uri "https://wqhly6ibz1.execute-api.ap-south-1.amazonaws.com/track/<trackingId>" `
    -Method GET
```

---

# Important Testing Note

The current API Gateway route is:

```text
POST /track
```

There is **no `POST /tracking` route** in the current API Gateway configuration.

Calling:

```text
POST /tracking
```

will therefore return:

```json
{
  "message": "Not Found"
}
```

---

# Git and Environment Files

Environment-specific files should not be committed.

The repository should ignore:

```text
.env.local
.env
```

while keeping:

```text
.env.example
```

in the repository so other developers know which environment variables are required.

The frontend API URL should always be provided through the environment rather than hardcoded into the application.

---

# Project Scope

This project intentionally uses a simple DynamoDB scan and serial processing because it is designed for a small number of users.

It is not currently intended to be a production-scale public service.

A basic API rate limit is the only near-term protection planned before sharing the application with friends.

---

# Future Improvements

Potential future improvements include:

- Better API rate limiting.
- Improved PNR validation.
- Better error handling.
- Authentication for tracking requests.
- More efficient DynamoDB querying.
- Improved notification formatting.
- Deployment automation.
- Frontend production deployment.
- Better monitoring and logging.
- Automated testing.
- Improved handling of expired tracking requests.

---

# Tech Stack

## Frontend

- React
- Vite
- JavaScript
- CSS

## Backend

- AWS Lambda
- Amazon API Gateway
- Amazon DynamoDB
- Amazon SNS
- Amazon EventBridge

## External API

- Railkit

---

# Status

🚧 **Personal project — actively under development**

The core PNR status checking and tracking workflow is implemented. The frontend is being iteratively improved while the AWS backend and notification workflow are being tested.
