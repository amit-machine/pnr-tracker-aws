export const DIGITS_ONLY_PATTERN = /^\d*$/;
export const PNR_PATTERN = /^\d{10}$/;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const TRACKING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDigitsOnly(value) {
  return DIGITS_ONLY_PATTERN.test(value);
}

export function isValidPnr(value) {
  return PNR_PATTERN.test(value);
}

export function isValidEmail(value) {
  return EMAIL_PATTERN.test(value);
}

export function isValidTrackingId(value) {
  return TRACKING_ID_PATTERN.test(String(value || "").trim());
}
