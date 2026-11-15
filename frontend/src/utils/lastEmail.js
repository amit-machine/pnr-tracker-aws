// Remembers the single most recent email searched on the "My trackings" tab,
// so it can be searched again automatically after a page reload.

const KEY = "pnr-tracker:last-email";

export function loadLastEmail() {
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch {
    // Storage can be unavailable (private mode, blocked cookies).
    return "";
  }
}

export function saveLastEmail(email) {
  try {
    window.localStorage.setItem(KEY, email);
  } catch {
    // Ignore: remembering the email is a convenience only.
  }
}
