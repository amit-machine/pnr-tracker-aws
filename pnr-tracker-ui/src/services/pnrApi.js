const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export async function getPnrStatus(pnr) {
  const response = await fetch(`${API_BASE_URL}/pnr/${pnr}`);

  if (!response.ok) {
    throw new Error("Failed to fetch PNR status");
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error("Unable to fetch PNR status");
  }

  return result.data;
}
