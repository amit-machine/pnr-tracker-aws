import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  CreateTopicCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { checkPNRStatus, configure } from "railkit";

configure(process.env.RAILKIT_API_KEY);

const dynamoClient = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(dynamoClient);

const sns = new SNSClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

export const handler = async (event) => {
  try {
    const body =
      typeof event.body === "string"
        ? JSON.parse(event.body)
        : event.body || event;

    const { pnr, email } = body;

    // --------------------------------------------------
    // Validate PNR
    // --------------------------------------------------

    if (!pnr || !/^\d{10}$/.test(String(pnr))) {
      return response(400, {
        success: false,
        message: "PNR must be a 10-digit number",
      });
    }

    // --------------------------------------------------
    // Validate email
    // --------------------------------------------------

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response(400, {
        success: false,
        message: "A valid email address is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPnr = String(pnr);

    // Used by the PnrEmailIndex GSI
    const trackingKey = `${normalizedPnr}#${normalizedEmail}`;

    // --------------------------------------------------
    // Check for an existing active tracking request
    // --------------------------------------------------

    const existingTracking = await findActiveTracking(trackingKey);

    if (existingTracking) {
      return response(409, {
        success: false,
        message: "This PNR is already being tracked for this email address.",
        trackingId: existingTracking.trackingId,
      });
    }

    // --------------------------------------------------
    // Check current PNR status
    // --------------------------------------------------

    const pnrResult = await checkPNRStatus(normalizedPnr);

    if (!pnrResult?.success) {
      if (isPnrInvalid(pnrResult?.error)) {
        return response(400, {
          success: false,
          message: "This PNR could not be found. Please check the PNR number.",
        });
      }

      return response(502, {
        success: false,
        message: "Unable to fetch PNR status",
      });
    }

    const data = pnrResult.data;

    // --------------------------------------------------
    // Determine whether tracking is allowed
    // --------------------------------------------------

    const chartStatus = data.chart?.status || null;

    const chartPrepared = isChartPrepared(chartStatus);

    const journeyDate = convertJourneyDateToIST(data.journey?.dateOfJourney);

    const journeyPassed = isJourneyPassed(journeyDate);

    if (chartPrepared) {
      return response(400, {
        success: false,
        message:
          "PNR tracking is not available because the railway chart has already been prepared.",
      });
    }

    if (journeyPassed) {
      return response(400, {
        success: false,
        message:
          "PNR tracking is not available because the journey has already started or passed.",
      });
    }

    // --------------------------------------------------
    // Store only the information needed for future
    // status comparisons
    // --------------------------------------------------

    const lastStatus = {
      chart: chartStatus,

      passengers: (data.passengers || []).map((passenger) => ({
        serialNumber: passenger.serialNumber,
        status: passenger.current?.status || null,
        details: passenger.current?.details || null,
        coach: passenger.current?.coach || null,
        berthNo: passenger.current?.berthNo || null,
      })),
    };

    const trackingId = randomUUID();
    const now = new Date().toISOString();

    // --------------------------------------------------
    // Create private SNS notification subscription
    // --------------------------------------------------

    const notification = await createNotificationSubscription(
      trackingId,
      normalizedEmail,
    );

    // --------------------------------------------------
    // Create DynamoDB tracking record
    // --------------------------------------------------

    const item = {
      trackingId,

      pnr: normalizedPnr,

      email: normalizedEmail,

      // Used by PnrEmailIndex
      trackingKey,

      active: true,
      verified: false,

      trainNumber: data.train?.number || null,
      trainName: data.train?.name || null,

      journeyDate,

      lastStatus,

      snsTopicArn: notification.topicArn,
      snsSubscriptionArn: notification.subscriptionArn,
      notificationStatus: "PENDING_CONFIRMATION",

      createdAt: now,
      updatedAt: now,
    };

    await dynamo.send(
      new PutCommand({
        TableName: process.env.TRACKING_TABLE_NAME,
        Item: item,
      }),
    );

    return response(200, {
      success: true,
      message:
        "PNR tracking created. Please confirm the Amazon SNS subscription email before status alerts can be delivered.",
      trackingId,
      pnr: normalizedPnr,
      email: normalizedEmail,
      currentStatus: lastStatus,
    });
  } catch (error) {
    console.error("Track request failed:", error);

    return response(500, {
      success: false,
      message: "Unable to create PNR tracking request",
    });
  }
};

// --------------------------------------------------
// Find an existing active tracking request
// --------------------------------------------------

async function findActiveTracking(trackingKey) {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: process.env.TRACKING_TABLE_NAME,

      IndexName: "PnrEmailIndex",

      KeyConditionExpression: "trackingKey = :trackingKey",

      FilterExpression: "#active = :active",

      ExpressionAttributeNames: {
        "#active": "active",
      },

      ExpressionAttributeValues: {
        ":trackingKey": trackingKey,
        ":active": true,
      },

      ProjectionExpression: "trackingId, pnr, email, active",
    }),
  );

  return result.Items?.[0] || null;
}

// --------------------------------------------------
// Create SNS topic + email subscription
// --------------------------------------------------

async function createNotificationSubscription(trackingId, email) {
  const topicResult = await sns.send(
    new CreateTopicCommand({
      Name: `pnr-tracker-${trackingId}`,
    }),
  );

  if (!topicResult.TopicArn) {
    throw new Error("SNS did not return a topic ARN");
  }

  const subscriptionResult = await sns.send(
    new SubscribeCommand({
      TopicArn: topicResult.TopicArn,
      Protocol: "email",
      Endpoint: email,
      ReturnSubscriptionArn: true,
    }),
  );

  return {
    topicArn: topicResult.TopicArn,
    subscriptionArn:
      subscriptionResult.SubscriptionArn || "PendingConfirmation",
  };
}

// --------------------------------------------------
// Check whether Railkit reported this PNR as permanently
// gone, as opposed to a temporary lookup failure
// --------------------------------------------------

function isPnrInvalid(errorText) {
  const error = String(errorText || "").toLowerCase();

  return error.includes("no pnr data found") || error.includes("invalid pnr");
}

// --------------------------------------------------
// Check whether the railway chart has been prepared
// --------------------------------------------------

function isChartPrepared(chartStatus) {
  const chart = String(chartStatus || "").toLowerCase();

  if (!chart) {
    return false;
  }

  return chart.includes("prepared") && !chart.includes("not prepared");
}

// --------------------------------------------------
// Check whether journey has already passed
// --------------------------------------------------

function isJourneyPassed(journeyDate) {
  if (!journeyDate) {
    return false;
  }

  const journeyTimestamp = new Date(journeyDate);

  if (Number.isNaN(journeyTimestamp.getTime())) {
    console.warn(
      `Unable to determine whether journey has passed: ${journeyDate}`,
    );

    return false;
  }

  return journeyTimestamp.getTime() <= Date.now();
}

// --------------------------------------------------
// Convert Railkit journey date to explicit IST ISO
// --------------------------------------------------

function convertJourneyDateToIST(journeyDate) {
  if (!journeyDate) {
    return null;
  }

  // If Railkit returns an ISO timestamp with timezone information,
  // keep it as-is.
  if (journeyDate.includes("Z") || /[+-]\d{2}:\d{2}$/.test(journeyDate)) {
    const date = new Date(journeyDate);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // Expected format:
  // "Sep 2, 2026 3:30:00 PM"

  const match = journeyDate.match(
    /^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i,
  );

  if (!match) {
    console.warn(`Unable to parse journey date: ${journeyDate}`);

    return null;
  }

  const [, monthName, day, year, hourString, minute, secondString, amPm] =
    match;

  const months = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  };

  const month = months[monthName];

  if (month === undefined) {
    console.warn(`Unknown month in journey date: ${journeyDate}`);

    return null;
  }

  let hour = Number(hourString);

  if (amPm.toUpperCase() === "PM" && hour !== 12) {
    hour += 12;
  }

  if (amPm.toUpperCase() === "AM" && hour === 12) {
    hour = 0;
  }

  const minuteNumber = Number(minute);
  const secondNumber = Number(secondString || 0);

  /*
   * Construct the timestamp as IST (+05:30).
   *
   * Example:
   * Sep 2, 2026 3:30:00 PM
   *
   * becomes:
   * 2026-09-02T15:30:00+05:30
   *
   * and is stored as:
   * 2026-09-02T10:00:00.000Z
   */

  const utcMilliseconds =
    Date.UTC(
      Number(year),
      month,
      Number(day),
      hour,
      minuteNumber,
      secondNumber,
    ) -
    5.5 * 60 * 60 * 1000;

  return new Date(utcMilliseconds).toISOString();
}

// --------------------------------------------------
// API response helper
// --------------------------------------------------

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
