import { configure, checkPNRStatus } from "railkit";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

configure(process.env.RAILKIT_API_KEY);

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const ses = new SESClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

const FROM_EMAIL = "amit777kr@gmail.com";

// --------------------------------------------------
// Send status email
// --------------------------------------------------

async function sendStatusEmail(
  record,
  previousStatus,
  latestStatus,
  isFinal,
  finalReason,
) {
  const subject = isFinal
    ? `PNR Tracker - Final Update for ${record.pnr}`
    : `PNR Tracker - Status Update for ${record.pnr}`;

  let finalMessage = "";

  if (isFinal) {
    switch (finalReason) {
      case "CHART_PREPARED":
        finalMessage =
          "The railway chart has been prepared. Tracking has now been stopped.";
        break;

      case "ALL_CONFIRMED":
        finalMessage =
          "All passengers are confirmed. Tracking has now been stopped.";
        break;

      case "ALL_CANCELLED":
        finalMessage =
          "All passengers are cancelled. Tracking has now been stopped.";
        break;

      case "JOURNEY_OVER":
        finalMessage =
          "Your journey time has passed. Tracking has now been stopped.";
        break;

      default:
        finalMessage =
          "This is the final update. PNR tracking has now been stopped.";
    }
  }

  // Convert technical status codes into user-friendly labels
  const statusLabel = (status) => {
    const value = String(status || "Not available").toUpperCase();

    if (value.startsWith("CNF") || value === "CONFIRMED") {
      return "Confirmed";
    }

    if (value.startsWith("WL")) {
      return "Waiting List";
    }

    if (value.startsWith("RAC")) {
      return "RAC";
    }

    if (value.startsWith("CAN") || value === "CANCELLED") {
      return "Cancelled";
    }

    return status || "Not available";
  };

  // --------------------------------------------------
  // Plain-text email
  // --------------------------------------------------

  const passengerText = (latestStatus.passengers || [])
    .map((passenger) => {
      return `
${passenger.serialNumber || "Passenger"}
Status: ${statusLabel(passenger.status)}${
        passenger.details ? ` (${passenger.details})` : ""
      }
Coach: ${passenger.coach || "Not assigned"}
Berth: ${passenger.berthNo || "Not assigned"}`;
    })
    .join("\n");

  const textBody = `
Hello,

${
  isFinal
    ? "Here is the final update for your PNR."
    : "There has been an update to your PNR status."
}

PNR: ${record.pnr}
Train: ${record.trainName || "Not available"}
Train Number: ${record.trainNumber || "Not available"}
Journey Date: ${record.journeyDate || "Not available"}

CURRENT STATUS
Chart: ${latestStatus.chart || "Not available"}

PASSENGERS
${passengerText || "No passenger information available."}

${
  isFinal
    ? finalMessage
    : "Your PNR tracker will continue checking for further status changes."
}

This is an automated notification from PNR Tracker.
`;

  // --------------------------------------------------
  // Passenger HTML cards
  // --------------------------------------------------

  const passengerRows = (latestStatus.passengers || [])
    .map(
      (passenger) => `
        <div style="
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 12px;
          background: #ffffff;
        ">

          <div style="
            font-size: 16px;
            font-weight: 700;
            color: #111827;
            margin-bottom: 10px;
          ">
            ${passenger.serialNumber || "Passenger"}
          </div>

          <table style="
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          ">

            <tr>
              <td style="
                padding: 4px 0;
                color: #6b7280;
              ">
                Status
              </td>

              <td style="
                padding: 4px 0;
                font-weight: 600;
                color: #111827;
              ">
                ${statusLabel(passenger.status)}
                ${
                  passenger.details
                    ? ` <span style="color:#6b7280;">(${passenger.details})</span>`
                    : ""
                }
              </td>
            </tr>

            <tr>
              <td style="
                padding: 4px 0;
                color: #6b7280;
              ">
                Coach
              </td>

              <td style="
                padding: 4px 0;
                color: #111827;
              ">
                ${passenger.coach || "Not assigned"}
              </td>
            </tr>

            <tr>
              <td style="
                padding: 4px 0;
                color: #6b7280;
              ">
                Berth
              </td>

              <td style="
                padding: 4px 0;
                color: #111827;
              ">
                ${passenger.berthNo || "Not assigned"}
              </td>
            </tr>

          </table>
        </div>
      `,
    )
    .join("");

  // --------------------------------------------------
  // Tracking state banner
  // --------------------------------------------------

  const finalBanner = isFinal
    ? `
      <div style="
        margin-top: 20px;
        padding: 16px;
        border-radius: 10px;
        background: #fff7ed;
        border: 1px solid #fed7aa;
        color: #9a3412;
        font-size: 14px;
        line-height: 1.5;
      ">
        <strong>Final update</strong><br />
        ${finalMessage}
      </div>
    `
    : `
      <div style="
        margin-top: 20px;
        padding: 16px;
        border-radius: 10px;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        color: #1e40af;
        font-size: 14px;
        line-height: 1.5;
      ">
        <strong>Tracking is still active.</strong><br />
        We will continue checking your PNR and notify you when the status changes.
      </div>
    `;

  // --------------------------------------------------
  // HTML email
  // --------------------------------------------------

  const htmlBody = `
<!DOCTYPE html>

<html>

<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <title>PNR Tracker Update</title>
</head>

<body style="
  margin: 0;
  padding: 0;
  background: #f3f4f6;
  font-family: Arial, Helvetica, sans-serif;
  color: #111827;
">

  <div style="
    padding: 28px 12px;
  ">

    <div style="
      max-width: 600px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    ">

      <!-- Header -->

      <div style="
        background: #2563eb;
        padding: 24px;
        color: #ffffff;
      ">

        <div style="
          font-size: 13px;
          opacity: 0.9;
          margin-bottom: 6px;
        ">
          PNR TRACKER
        </div>

        <h1 style="
          margin: 0;
          font-size: 24px;
          line-height: 1.3;
        ">
          ${isFinal ? "Final PNR Update" : "PNR Status Update"}
        </h1>

        <p style="
          margin: 8px 0 0;
          font-size: 14px;
          opacity: 0.92;
        ">
          ${
            isFinal
              ? "Your tracking request has completed."
              : "Your journey status has changed."
          }
        </p>

      </div>

      <!-- Main content -->

      <div style="
        padding: 24px;
      ">

        <!-- Journey details -->

        <h2 style="
          margin: 0 0 14px;
          font-size: 18px;
        ">
          Journey Details
        </h2>

        <table style="
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        ">

          <tr>
            <td style="
              padding: 7px 0;
              color: #6b7280;
            ">
              PNR
            </td>

            <td style="
              padding: 7px 0;
              font-weight: 700;
              text-align: right;
            ">
              ${record.pnr}
            </td>
          </tr>

          <tr>
            <td style="
              padding: 7px 0;
              color: #6b7280;
            ">
              Train
            </td>

            <td style="
              padding: 7px 0;
              font-weight: 600;
              text-align: right;
            ">
              ${record.trainName || "Not available"}
            </td>
          </tr>

          <tr>
            <td style="
              padding: 7px 0;
              color: #6b7280;
            ">
              Train Number
            </td>

            <td style="
              padding: 7px 0;
              text-align: right;
            ">
              ${record.trainNumber || "Not available"}
            </td>
          </tr>

          <tr>
            <td style="
              padding: 7px 0;
              color: #6b7280;
            ">
              Journey Date
            </td>

            <td style="
              padding: 7px 0;
              text-align: right;
            ">
              ${record.journeyDate || "Not available"}
            </td>
          </tr>

        </table>

        <hr style="
          border: 0;
          border-top: 1px solid #e5e7eb;
          margin: 24px 0;
        " />

        <!-- Current status -->

        <h2 style="
          margin: 0 0 14px;
          font-size: 18px;
        ">
          Current Status
        </h2>

        <div style="
          padding: 16px;
          background: #f8fafc;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
        ">

          <div style="
            font-size: 12px;
            color: #6b7280;
            margin-bottom: 6px;
            text-transform: uppercase;
          ">
            Chart Status
          </div>

          <div style="
            font-size: 18px;
            font-weight: 700;
            color: #111827;
          ">
            ${latestStatus.chart || "Not available"}
          </div>

        </div>

        <!-- Passenger status -->

        <h2 style="
          margin: 24px 0 14px;
          font-size: 18px;
        ">
          Passenger Status
        </h2>

        ${
          passengerRows ||
          `
          <div style="
            color: #6b7280;
            font-size: 14px;
          ">
            No passenger information available.
          </div>
          `
        }

        <!-- Tracking status -->

        ${finalBanner}

      </div>

      <!-- Footer -->

      <div style="
        padding: 18px 24px;
        background: #f8fafc;
        border-top: 1px solid #e5e7eb;
        text-align: center;
        color: #6b7280;
        font-size: 12px;
        line-height: 1.5;
      ">
        This is an automated notification from PNR Tracker.
      </div>

    </div>

  </div>

</body>

</html>
`;

  // --------------------------------------------------
  // Send email through SES
  // --------------------------------------------------

  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,

      Destination: {
        ToAddresses: [record.email],
      },

      Message: {
        Subject: {
          Data: subject,
          Charset: "UTF-8",
        },

        Body: {
          Text: {
            Data: textBody,
            Charset: "UTF-8",
          },

          Html: {
            Data: htmlBody,
            Charset: "UTF-8",
          },
        },
      },
    }),
  );

  console.log(
    `${isFinal ? "Final" : "Status change"} email sent to ${record.email}`,
  );
}

// --------------------------------------------------
// Check whether all passengers are confirmed
// --------------------------------------------------

function areAllConfirmed(passengers) {
  if (!passengers?.length) {
    return false;
  }

  return passengers.every((passenger) => {
    const status = String(passenger.status || "").toUpperCase();

    return (
      status === "CNF" || status === "CONFIRMED" || status.startsWith("CNF")
    );
  });
}

// --------------------------------------------------
// Check whether all passengers are cancelled
// --------------------------------------------------

function areAllCancelled(passengers) {
  if (!passengers?.length) {
    return false;
  }

  return passengers.every((passenger) => {
    const status = String(passenger.status || "").toUpperCase();

    return (
      status === "CAN" || status === "CANCELLED" || status.startsWith("CAN")
    );
  });
}

// --------------------------------------------------
// Check whether chart has been prepared
// --------------------------------------------------

function isChartPrepared(chartStatus) {
  const chart = String(chartStatus || "").toLowerCase();

  if (!chart) {
    return false;
  }

  return chart.includes("prepared") && !chart.includes("not prepared");
}

// --------------------------------------------------
// Check whether journey has passed
// --------------------------------------------------

function isJourneyOver(journeyDate) {
  if (!journeyDate) {
    return false;
  }

  const journeyTime = new Date(journeyDate);
  const currentTime = new Date();

  if (Number.isNaN(journeyTime.getTime())) {
    console.error(`Invalid journeyDate: ${journeyDate}`);

    return false;
  }

  console.log(`Journey time: ${journeyTime.toISOString()}`);
  console.log(`Current time: ${currentTime.toISOString()}`);

  return currentTime >= journeyTime;
}

// --------------------------------------------------
// Lambda handler
// --------------------------------------------------

export const handler = async () => {
  try {
    // 1. Get all active tracking records

    const scanResult = await dynamo.send(
      new ScanCommand({
        TableName: process.env.TRACKING_TABLE_NAME,

        FilterExpression: "#active = :true",

        ExpressionAttributeNames: {
          "#active": "active",
        },

        ExpressionAttributeValues: {
          ":true": true,
        },
      }),
    );

    const records = scanResult.Items || [];

    console.log(`Found ${records.length} active tracking records`);

    let changedCount = 0;
    let unchangedCount = 0;
    let failedCount = 0;
    let finalCount = 0;

    // 2. Process each active tracking record

    for (const record of records) {
      try {
        console.log(
          `Checking PNR ${record.pnr} for tracking ${record.trackingId}`,
        );

        // 3. Fetch latest PNR status

        const result = await checkPNRStatus(record.pnr);

        if (!result?.success) {
          console.error(`Failed to fetch PNR ${record.pnr}`);

          failedCount++;

          continue;
        }

        const data = result.data;

        // 4. Normalize latest status

        const latestStatus = {
          chart: data.chart?.status || null,

          passengers: (data.passengers || []).map((passenger) => ({
            serialNumber: passenger.serialNumber,
            status: passenger.current?.status || null,
            details: passenger.current?.details || null,
            coach: passenger.current?.coach || null,
            berthNo: passenger.current?.berthNo || null,
          })),
        };

        // 5. Get previous status

        const previousStatus = record.lastStatus || null;

        // 6. Compare previous and current status

        const statusChanged =
          !previousStatus ||
          previousStatus.chart !== latestStatus.chart ||
          previousStatus.passengers?.length !==
            latestStatus.passengers.length ||
          latestStatus.passengers.some((currentPassenger, index) => {
            const previousPassenger = previousStatus.passengers?.[index];

            return (
              !previousPassenger ||
              previousPassenger.serialNumber !==
                currentPassenger.serialNumber ||
              previousPassenger.status !== currentPassenger.status ||
              previousPassenger.details !== currentPassenger.details ||
              previousPassenger.coach !== currentPassenger.coach ||
              previousPassenger.berthNo !== currentPassenger.berthNo
            );
          });

        console.log(`Previous status: ${JSON.stringify(previousStatus)}`);

        console.log(`Current status: ${JSON.stringify(latestStatus)}`);

        console.log(`Status changed: ${statusChanged}`);

        // --------------------------------------------------
        // 7. Determine whether tracking is finished
        // --------------------------------------------------

        const chartPrepared = isChartPrepared(latestStatus.chart);

        const allConfirmed = areAllConfirmed(latestStatus.passengers);

        const allCancelled = areAllCancelled(latestStatus.passengers);

        const journeyOver = isJourneyOver(record.journeyDate);

        let isFinal = false;
        let finalReason = "NONE";

        if (chartPrepared) {
          isFinal = true;
          finalReason = "CHART_PREPARED";
        } else if (allConfirmed) {
          isFinal = true;
          finalReason = "ALL_CONFIRMED";
        } else if (allCancelled) {
          isFinal = true;
          finalReason = "ALL_CANCELLED";
        } else if (journeyOver) {
          isFinal = true;
          finalReason = "JOURNEY_OVER";
        }

        console.log(`Chart prepared: ${chartPrepared}`);
        console.log(`All confirmed: ${allConfirmed}`);
        console.log(`All cancelled: ${allCancelled}`);
        console.log(`Journey over: ${journeyOver}`);
        console.log(`Final status: ${isFinal}`);
        console.log(`Final reason: ${finalReason}`);

        // --------------------------------------------------
        // 8. Handle status change or final state
        // --------------------------------------------------

        if (statusChanged || isFinal) {
          if (statusChanged) {
            changedCount++;

            console.log(`STATUS CHANGED for PNR ${record.pnr}`);
          }

          if (isFinal) {
            finalCount++;

            console.log(`FINAL STATE reached for PNR ${record.pnr}`);

            console.log(`Final reason: ${finalReason}`);
          }

          // ------------------------------------------------
          // 9. Send email first
          // ------------------------------------------------

          await sendStatusEmail(
            record,
            previousStatus,
            latestStatus,
            isFinal,
            finalReason,
          );

          // ------------------------------------------------
          // 10. Save status
          //
          // Final -> also deactivate
          // Normal change -> remain active
          // ------------------------------------------------

          if (isFinal) {
            await dynamo.send(
              new UpdateCommand({
                TableName: process.env.TRACKING_TABLE_NAME,

                Key: {
                  trackingId: record.trackingId,
                },

                UpdateExpression:
                  "SET lastStatus = :status, updatedAt = :updatedAt, active = :active",

                ExpressionAttributeValues: {
                  ":status": latestStatus,
                  ":updatedAt": new Date().toISOString(),
                  ":active": false,
                },
              }),
            );

            console.log(`Tracking ${record.trackingId} marked INACTIVE`);
          } else {
            await dynamo.send(
              new UpdateCommand({
                TableName: process.env.TRACKING_TABLE_NAME,

                Key: {
                  trackingId: record.trackingId,
                },

                UpdateExpression:
                  "SET lastStatus = :status, updatedAt = :updatedAt",

                ExpressionAttributeValues: {
                  ":status": latestStatus,
                  ":updatedAt": new Date().toISOString(),
                },
              }),
            );

            console.log(`Updated tracking ${record.trackingId}`);
          }
        } else {
          unchangedCount++;

          console.log(`No change for PNR ${record.pnr}`);
        }
      } catch (error) {
        failedCount++;

        console.error(
          `Failed processing tracking ${record.trackingId}:`,
          error,
        );
      }
    }

    // --------------------------------------------------
    // 11. Return summary
    // --------------------------------------------------

    return {
      statusCode: 200,

      body: JSON.stringify({
        success: true,
        processed: records.length,
        changed: changedCount,
        unchanged: unchangedCount,
        final: finalCount,
        failed: failedCount,
      }),
    };
  } catch (error) {
    console.error("Tracking update failed:", error);

    throw error;
  }
};
