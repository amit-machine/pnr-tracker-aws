import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.TABLE_NAME || "pnr-tracking";
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || "ap-south-1" })
);

const PNR_RE = /^\d{10}$/;
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
  source: i.source,
  destination: i.destination,
  arrivalDate: i.arrivalDate,
  travelClass: i.travelClass,
  quota: i.quota,
  active: i.active,
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

  // Without a verified identity the caller may search by ?email= or ?pnr=.
  const rawPnr = !claims?.email ? event?.queryStringParameters?.pnr : undefined;
  const pnr = typeof rawPnr === "string" ? rawPnr.trim() : "";
  const byPnr = !email && PNR_RE.test(pnr);
  if (!byPnr && !EMAIL_RE.test(email)) {
    return respond(400, { success: false, message: "A valid email or 10-digit PNR is required" });
  }

  try {
    // trackingKey is "<pnr>#<email>", so the GSI can't be queried by email alone.
    // The table is small; paginate a filtered Scan. Add an email GSI if it grows.
    const items = [];
    let ExclusiveStartKey;
    do {
      const out = await ddb.send(
        new ScanCommand({
          TableName: TABLE,
          // Only active trackings are returned; stopped ones are of no use here.
          FilterExpression: (byPnr ? "pnr" : "email") + " = :k AND active = :t",
          ExpressionAttributeValues: { ":k": byPnr ? pnr : email, ":t": true },
          ExclusiveStartKey,
        })
      );
      items.push(...(out.Items || []));
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    return respond(200, { success: true, data: { email: byPnr ? undefined : email, pnr: byPnr ? pnr : undefined, count: items.length, items: items.map(toPublic) } });
  } catch (err) {
    console.error("list-tracking-by-email failed", err);
    return respond(500, { success: false, message: "Internal error" });
  }
};
