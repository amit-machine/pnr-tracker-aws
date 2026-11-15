import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.TABLE_NAME || "pnr-tracking";
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" })
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// CORS is handled by the API Gateway HTTP API configuration.
const headers = { "Content-Type": "application/json" };

const respond = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

// Only expose what the UI needs; SNS ARNs and internals stay server-side.
const toPublic = (i) => ({
  trackingId: i.trackingId,
  pnr: i.pnr,
  email: i.email,
  trainNumber: i.trainNumber,
  trainName: i.trainName,
  journeyDate: i.journeyDate,
  active: i.active,
  verified: i.verified,
  stopReason: i.stopReason,
  lastStatus: i.lastStatus,
  createdAt: i.createdAt,
  updatedAt: i.updatedAt,
});

export const handler = async (event) => {
  // TODO(auth): identity currently comes from ?email= (NO authentication yet).
  // Once a JWT authorizer is attached, verified claims win and REQUIRE_AUTH=true
  // disables the query-string fallback. See README.md.
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  let raw;
  if (claims?.email) {
    const ok = claims.email_verified === true || claims.email_verified === "true";
    if (!ok) return respond(401, { success: false, message: "Verified email required" });
    raw = claims.email;
  } else if (process.env.REQUIRE_AUTH === "true") {
    return respond(401, { success: false, message: "Authentication required" });
  } else {
    raw = event?.queryStringParameters?.email;
  }
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) return respond(400, { success: false, message: "A valid email is required" });

  try {
    // trackingKey is "<pnr>#<email>", so the GSI can't be queried by email alone.
    // The table is small; paginate a filtered Scan. Add an email GSI if it grows.
    const items = [];
    let ExclusiveStartKey;
    do {
      const out = await ddb.send(
        new ScanCommand({
          TableName: TABLE,
          FilterExpression: "email = :e",
          ExpressionAttributeValues: { ":e": email },
          ExclusiveStartKey,
        })
      );
      items.push(...(out.Items || []));
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return respond(200, { success: true, data: { email, count: items.length, items: items.map(toPublic) } });
  } catch (err) {
    console.error("list-tracking-by-email failed", err);
    return respond(500, { success: false, message: "Internal error" });
  }
};
