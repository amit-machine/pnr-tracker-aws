import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  ListSubscriptionsByTopicCommand,
  PublishCommand,
  SNSClient,
} from "@aws-sdk/client-sns";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { checkPNRStatus, configure } from "railkit";

configure(process.env.RAILKIT_API_KEY);

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

const sns = new SNSClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

// Number of consecutive scheduled runs that must all report this PNR
// as invalid before tracking is actually stopped. Guards against a
// single transient upstream error (e.g. indianrail.gov.in maintenance)
// being mistaken for a permanently dead PNR.
const INVALID_PNR_CONFIRMATION_THRESHOLD = 3;

// --------------------------------------------------
// Index passengers by serial number for diffing
// --------------------------------------------------

function toSerialMap(passengers) {
  return new Map(
    (passengers || []).map((passenger) => [passenger.serialNumber, passenger]),
  );
}

// --------------------------------------------------
// Check whether the status actually changed, comparing
// passengers by serialNumber (matches the diff logic in
// buildStatusNotification, instead of by array position).
// --------------------------------------------------

function hasStatusChanged(previousStatus, latestStatus) {
  if (!previousStatus) {
    return true;
  }

  if (previousStatus.chart !== latestStatus.chart) {
    return true;
  }

  const previousBySerial = toSerialMap(previousStatus.passengers);
  const latestBySerial = toSerialMap(latestStatus.passengers);

  if (previousBySerial.size !== latestBySerial.size) {
    return true;
  }

  for (const [serialNumber, current] of latestBySerial) {
    const previous = previousBySerial.get(serialNumber);

    if (
      !previous ||
      previous.status !== current.status ||
      previous.details !== current.details ||
      previous.coach !== current.coach ||
      previous.berthNo !== current.berthNo
    ) {
      return true;
    }
  }

  return false;
}

// --------------------------------------------------
// Build a plain-text status notification for Amazon SNS email delivery.
// --------------------------------------------------

async function buildStatusNotification(
  record,
  previousStatus,
  latestStatus,
  isFinal,
  finalReason,
) {
  // --------------------------------------------------
  // Helpers
  // --------------------------------------------------

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

  const formatStatus = (passenger) => {
    const label = statusLabel(passenger?.status);
    const details = passenger?.details;

    return details ? `${label} (${details})` : label;
  };

  const formatJourneyDate = (dateValue) => {
    if (!dateValue) {
      return "Not available";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
      return dateValue;
    }

    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(date);

    const get = (type) => parts.find((part) => part.type === type)?.value || "";

    return `${get("day")} ${get("month")} ${get("year")}, ${get(
      "hour",
    )}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
  };

  const formatValue = (value) => {
    if (value === null || value === undefined || value === "") {
      return "Not assigned";
    }

    return String(value);
  };

  // --------------------------------------------------
  // Final status message
  // --------------------------------------------------

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

      case "INVALID_PNR":
        finalMessage =
          "This PNR is no longer available. It may have expired or become invalid. Tracking has now been stopped.";
        break;

      default:
        finalMessage =
          "This is the final update. PNR tracking has now been stopped.";
    }
  }

  // --------------------------------------------------
  // Find exactly what changed
  // --------------------------------------------------

  const changes = [];

  // Chart status change
  if (previousStatus?.chart !== latestStatus?.chart) {
    changes.push(
      `Chart\n${formatValue(previousStatus?.chart)} → ${formatValue(
        latestStatus?.chart,
      )}`,
    );
  }

  // Passenger changes
  const previousPassengers = previousStatus?.passengers || [];
  const latestPassengers = latestStatus?.passengers || [];

  const previousBySerial = toSerialMap(previousPassengers);
  const latestBySerial = toSerialMap(latestPassengers);

  // Check current passengers
  for (const current of latestPassengers) {
    const previous = previousBySerial.get(current.serialNumber);

    // New passenger
    if (!previous) {
      changes.push(
        `${current.serialNumber || "Passenger"}\nNew passenger information detected.`,
      );

      continue;
    }

    const passengerChanges = [];

    // Status / WL / RAC / CNF change
    if (
      previous.status !== current.status ||
      previous.details !== current.details
    ) {
      passengerChanges.push(
        `${formatStatus(previous)} → ${formatStatus(current)}`,
      );
    }

    // Coach change
    if (previous.coach !== current.coach) {
      passengerChanges.push(
        `Coach: ${formatValue(previous.coach)} → ${formatValue(current.coach)}`,
      );
    }

    // Berth change
    if (previous.berthNo !== current.berthNo) {
      passengerChanges.push(
        `Berth: ${formatValue(previous.berthNo)} → ${formatValue(
          current.berthNo,
        )}`,
      );
    }

    if (passengerChanges.length > 0) {
      changes.push(
        `${current.serialNumber || "Passenger"}\n${passengerChanges.join(
          "\n",
        )}`,
      );
    }
  }

  // Detect removed passengers
  for (const previous of previousPassengers) {
    if (!latestBySerial.has(previous.serialNumber)) {
      changes.push(
        `${previous.serialNumber || "Passenger"}\nPassenger information is no longer available.`,
      );
    }
  }

  const changesText =
    changes.length > 0
      ? changes.join("\n\n")
      : "No specific field changes detected.";

  // --------------------------------------------------
  // Current passenger status
  // --------------------------------------------------

  const passengerText = latestPassengers
    .map((passenger) => {
      return `${passenger.serialNumber || "Passenger"}
Status: ${formatStatus(passenger)}
Coach: ${formatValue(passenger.coach)}
Berth: ${formatValue(passenger.berthNo)}`;
    })
    .join("\n\n");

  // --------------------------------------------------
  // Subject
  // --------------------------------------------------

  const subject = isFinal
    ? `PNR Tracker - Final Update for ${record.pnr}`
    : `PNR Tracker - Status Changed for ${record.pnr}`;

  // --------------------------------------------------
  // Plain-text SNS email
  // --------------------------------------------------

  const textBody = `
Hello,

${isFinal
      ? "There has been a final update to your PNR."
      : "Your PNR status has changed."
    }

PNR: ${record.pnr}
Train: ${record.trainNumber || "Not available"} - ${record.trainName || "Not available"
    }
Journey Date: ${formatJourneyDate(record.journeyDate)}

WHAT CHANGED
------------
${changesText}

CURRENT STATUS
--------------
Chart: ${latestStatus.chart || "Not available"}

PASSENGERS
----------
${passengerText || "No passenger information available."}

${isFinal
      ? `FINAL UPDATE
------------
${finalMessage}`
      : `TRACKING
--------
Your PNR tracker will continue checking for further status changes.`
    }

This is an automated notification from PNR Tracker.
`;

  return {
    subject,
    message: textBody.trim(),
  };
}

async function publishStatusNotification(record, notification) {
  if (!record.snsTopicArn) {
    // Existing SES-era records can still be updated and closed normally.
    // New tracking requests always include an SNS topic.
    console.warn(
      `Skipping notification for legacy tracking ${record.trackingId}: no SNS topic`,
    );
    return;
  }

  await sns.send(
    new PublishCommand({
      TopicArn: record.snsTopicArn,
      Subject: notification.subject,
      Message: notification.message,
    }),
  );

  console.log(
    `${record.active ? "Status change" : "Final"} SNS notification published for ${record.trackingId}`,
  );
}

async function isNotificationConfirmed(record) {
  if (!record.snsTopicArn) {
    // Records created before the SNS migration remain processable.
    return true;
  }

  const result = await sns.send(
    new ListSubscriptionsByTopicCommand({
      TopicArn: record.snsTopicArn,
    }),
  );

  return (result.Subscriptions || []).some(
    (subscription) =>
      subscription.Endpoint?.toLowerCase() === record.email?.toLowerCase() &&
      subscription.SubscriptionArn !== "PendingConfirmation",
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
// Check whether Railkit reported this PNR as permanently
// gone, as opposed to a temporary lookup failure. Only the
// exact confirmed error text should count - anything else
// (rate limits, outages) must stay classified as transient.
// --------------------------------------------------

function isPnrInvalid(errorText) {
  const error = String(errorText || "").toLowerCase();

  return error.includes("no pnr data found") || error.includes("invalid pnr");
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
    let invalidCount = 0;

    // 2. Process each active tracking record

    for (const record of records) {
      try {
        console.log(
          `Checking PNR ${record.pnr} for tracking ${record.trackingId}`,
        );

        if (!(await isNotificationConfirmed(record))) {
          unchangedCount++;

          console.log(
            `Waiting for SNS confirmation for tracking ${record.trackingId}`,
          );

          continue;
        }

        // 3. Fetch latest PNR status

        const result = await checkPNRStatus(record.pnr);

        if (!result?.success) {
          if (isPnrInvalid(result?.error)) {
            const invalidCheckCount = (record.invalidCheckCount || 0) + 1;

            console.log(
              `PNR ${record.pnr} looks invalid (check ${invalidCheckCount}/${INVALID_PNR_CONFIRMATION_THRESHOLD}): ${result?.error}`,
            );

            // A single "invalid" response can be a temporary upstream
            // issue (e.g. indianrail.gov.in maintenance) rather than a
            // genuinely dead PNR - Railkit doesn't distinguish the two
            // in its error text. Require several consecutive occurrences
            // across scheduled runs before treating it as final, so a
            // brief outage can't wrongly stop someone's tracking.
            if (invalidCheckCount < INVALID_PNR_CONFIRMATION_THRESHOLD) {
              await dynamo.send(
                new UpdateCommand({
                  TableName: process.env.TRACKING_TABLE_NAME,

                  Key: {
                    trackingId: record.trackingId,
                  },

                  UpdateExpression:
                    "SET updatedAt = :updatedAt, invalidCheckCount = :count",

                  ExpressionAttributeValues: {
                    ":updatedAt": new Date().toISOString(),
                    ":count": invalidCheckCount,
                  },
                }),
              );

              unchangedCount++;

              continue;
            }

            const previousStatus = record.lastStatus || null;

            const notification = await buildStatusNotification(
              record,
              previousStatus,
              previousStatus,
              true,
              "INVALID_PNR",
            );

            await dynamo.send(
              new UpdateCommand({
                TableName: process.env.TRACKING_TABLE_NAME,

                Key: {
                  trackingId: record.trackingId,
                },

                UpdateExpression:
                  "SET updatedAt = :updatedAt, active = :active, stopReason = :stopReason",

                ExpressionAttributeValues: {
                  ":updatedAt": new Date().toISOString(),
                  ":active": false,
                  ":stopReason": "INVALID_PNR",
                },
              }),
            );

            await publishStatusNotification(record, notification);

            invalidCount++;
            finalCount++;

            console.log(
              `Tracking ${record.trackingId} marked INACTIVE (invalid PNR, confirmed after ${invalidCheckCount} checks)`,
            );

            continue;
          }

          // Temporary Railkit failure (outage, rate limit, unexpected
          // shape, etc.) - stays active and is retried next run. Do
          // not mark the record invalid on anything but the confirmed
          // "PNR no longer exists" error text checked above.
          console.error(
            `Failed to fetch PNR ${record.pnr}: ${result?.error || "unknown error"}`,
          );

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

        const statusChanged = hasStatusChanged(previousStatus, latestStatus);

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
          // 9. Build the notification content
          // ------------------------------------------------

          const notification = await buildStatusNotification(
            record,
            previousStatus,
            latestStatus,
            isFinal,
            finalReason,
          );

          // ------------------------------------------------
          // 10. Save status first.
          //
          // Persisting before publishing means a crash between
          // the two calls can only drop a notification, not
          // cause the next run to re-detect the same change and
          // send a duplicate one.
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
                  "SET lastStatus = :status, updatedAt = :updatedAt, active = :active, stopReason = :stopReason, invalidCheckCount = :zero",

                ExpressionAttributeValues: {
                  ":status": latestStatus,
                  ":updatedAt": new Date().toISOString(),
                  ":active": false,
                  ":stopReason": finalReason,
                  ":zero": 0,
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
                  "SET lastStatus = :status, updatedAt = :updatedAt, invalidCheckCount = :zero",

                ExpressionAttributeValues: {
                  ":status": latestStatus,
                  ":updatedAt": new Date().toISOString(),
                  ":zero": 0,
                },
              }),
            );

            console.log(`Updated tracking ${record.trackingId}`);
          }

          // ------------------------------------------------
          // 11. Send the notification
          // ------------------------------------------------

          await publishStatusNotification(record, notification);
        } else {
          // A successful check with no status change still means
          // Railkit recognizes the PNR again - clear any invalid-check
          // streak so it doesn't carry over from an earlier, unrelated
          // transient blip.
          if (record.invalidCheckCount) {
            await dynamo.send(
              new UpdateCommand({
                TableName: process.env.TRACKING_TABLE_NAME,

                Key: {
                  trackingId: record.trackingId,
                },

                UpdateExpression: "SET invalidCheckCount = :zero",

                ExpressionAttributeValues: {
                  ":zero": 0,
                },
              }),
            );
          }

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
        invalid: invalidCount,
        failed: failedCount,
      }),
    };
  } catch (error) {
    console.error("Tracking update failed:", error);

    throw error;
  }
};
