import { configure, checkPNRStatus } from "railkit";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  CreateTopicCommand,
  SNSClient,
  SubscribeCommand,
} from "@aws-sdk/client-sns";
import { randomUUID } from "crypto";

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

    // Validate PNR
    if (!pnr || !/^\d{10}$/.test(String(pnr))) {
      return response(400, {
        success: false,
        message: "PNR must be a 10-digit number",
      });
    }

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return response(400, {
        success: false,
        message: "A valid email address is required",
      });
    }

    // Check the current PNR status immediately
    const pnrResult = await checkPNRStatus(String(pnr));

    if (!pnrResult?.success) {
      return response(502, {
        success: false,
        message: "Unable to fetch PNR status",
      });
    }

    const data = pnrResult.data;

    // Store only the information needed for future comparisons
    const lastStatus = {
      chart: data.chart?.status || null,

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

    // Each tracking request gets its own topic. This keeps notifications
    // private: a subscriber only receives updates for this tracking ID.
    // SNS sends the recipient a confirmation email before any updates are
    // delivered, so SES production access is not required.
    const notification = await createNotificationSubscription(
      trackingId,
      email.toLowerCase().trim(),
    );

    // Railkit returns journey date/time as something like:
    // "Sep 2, 2026 3:30:00 PM"
    //
    // Convert it to an explicit IST timestamp so that
    // the scheduled tracking Lambda can reliably determine
    // when the journey has passed.
    const journeyDate = convertJourneyDateToIST(data.journey?.dateOfJourney);

    const item = {
      trackingId,

      pnr: String(pnr),

      email: email.toLowerCase().trim(),

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
      pnr: String(pnr),
      email: email.toLowerCase().trim(),
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
    subscriptionArn: subscriptionResult.SubscriptionArn || "PendingConfirmation",
  };
}

// --------------------------------------------------
// Convert Railkit journey date to explicit IST ISO
// --------------------------------------------------

function convertJourneyDateToIST(journeyDate) {
  if (!journeyDate) {
    return null;
  }

  // If Railkit ever returns an ISO timestamp with
  // timezone information already present, keep it.
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
   *
   * Both represent the same instant.
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

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
