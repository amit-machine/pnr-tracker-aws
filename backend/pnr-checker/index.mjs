import { configure, checkPNRStatus } from "railkit";

configure(process.env.RAILKIT_API_KEY);

export const handler = async (event) => {
  // For now, support both:
  // 1. API Gateway: /pnr/{pnr}
  // 2. Direct Lambda test: { "pnr": "2842762869" }

  const pnr = event?.pathParameters?.pnr || event?.pnr;

  if (!pnr) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        message: "PNR number is required",
      }),
    };
  }

  if (!/^\d{10}$/.test(pnr)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        success: false,
        message: "PNR must be a 10-digit number",
      }),
    };
  }

  try {
    const result = await checkPNRStatus(pnr);

    console.log("PNR result:", JSON.stringify(result, null, 2));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error("PNR lookup failed:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Unable to fetch PNR status",
      }),
    };
  }
};
