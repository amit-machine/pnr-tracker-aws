const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function getApiError(response, fallbackMessage) {
  let result;

  try {
    result = await response.json();
  } catch {
    return fallbackMessage;
  }

  if (response.status === 429) {
    return "PNR service limit reached. Please try again later.";
  }

  if (result?.error?.toLowerCase().includes("usage limit")) {
    return "PNR service limit reached. Please try again later.";
  }

  return result?.message || result?.error || fallbackMessage;
}

export async function getPnrStatus(pnr) {
  const response = await fetch(`${API_BASE_URL}/pnr/${pnr}`);

  if (!response.ok) {
    const message = await getApiError(response, "Failed to fetch PNR status");

    throw new Error(message);
  }

  const result = await response.json();

  if (!result.success) {
    if (result.error?.toLowerCase().includes("usage limit")) {
      throw new Error("PNR service limit reached. Please try again later.");
    }

    throw new Error(
      result.message || result.error || "Unable to fetch PNR status",
    );
  }

  return result.data;
}

export async function startPnrTracking(pnr, email) {
  const response = await fetch(`${API_BASE_URL}/track`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pnr,
      email,
    }),
  });

  if (!response.ok) {
    const message = await getApiError(response, "Failed to start PNR tracking");

    throw new Error(message);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(
      result.message || result.error || "Unable to start PNR tracking",
    );
  }

  return result;
}
