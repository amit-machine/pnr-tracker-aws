import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
  try {
    const trackingId = event.pathParameters?.trackingId;

    if (!trackingId) {
      return response(400, {
        success: false,
        message: "trackingId is required",
      });
    }

    const result = await dynamo.send(
      new GetCommand({
        TableName: process.env.TRACKING_TABLE_NAME,
        Key: {
          trackingId,
        },
      }),
    );

    if (!result.Item) {
      return response(404, {
        success: false,
        message: "Tracking request not found",
      });
    }

    const {
      trackingId: id,
      pnr,
      trainNumber,
      trainName,
      journeyDate,
      lastStatus,
      active,
      notificationStatus,
      stopReason,
    } = result.Item;

    return response(200, {
      success: true,
      data: {
        trackingId: id,
        pnr,
        trainNumber,
        trainName,
        journeyDate,
        lastStatus,
        active,
        notificationStatus,
        stopReason,
      },
    });
  } catch (error) {
    console.error("Get tracking failed:", error);

    return response(500, {
      success: false,
      message: "Unable to retrieve tracking request",
    });
  }
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}
