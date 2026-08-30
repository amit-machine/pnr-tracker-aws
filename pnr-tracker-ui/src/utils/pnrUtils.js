export function canTrackPnr(status) {
  if (!status) {
    return false;
  }

  if (isChartPrepared(status.chart?.status)) {
    return false;
  }

  const journeyDate = parseRailkitDate(status.journey?.dateOfJourney);

  if (!journeyDate) {
    return false;
  }

  return journeyDate > new Date();
}

// --------------------------------------------------
// Check whether the railway chart has been prepared
// --------------------------------------------------

export function isChartPrepared(chartStatus) {
  const chart = String(chartStatus || "").toLowerCase();

  if (!chart) {
    return false;
  }

  return chart.includes("prepared") && !chart.includes("not prepared");
}

// --------------------------------------------------
// Human-readable passenger status label
// --------------------------------------------------

export function statusLabel(status) {
  const value = String(status || "Not available").toUpperCase();

  if (value.startsWith("CNF") || value === "CONFIRMED") {
    return "Confirmed";
  }

  if (value.startsWith("WL")) {
    return "Waiting List";
  }

  if (value.startsWith("RAC")) {
    return "RAC";
  }

  if (value.startsWith("CAN") || value === "CANCELLED") {
    return "Cancelled";
  }

  return status || "Not available";
}

function parseRailkitDate(value) {
  if (!value) {
    return null;
  }

  // Expected:
  // "Sep 2, 2026 3:30:00 PM"

  const match = value.match(
    /^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i,
  );

  if (!match) {
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
    return null;
  }

  let hour = Number(hourString);

  if (amPm.toUpperCase() === "PM" && hour !== 12) {
    hour += 12;
  }

  if (amPm.toUpperCase() === "AM" && hour === 12) {
    hour = 0;
  }

  // Railkit date/time is IST.
  const utcMilliseconds =
    Date.UTC(
      Number(year),
      month,
      Number(day),
      hour,
      Number(minute),
      Number(secondString || 0),
    ) -
    5.5 * 60 * 60 * 1000;

  return new Date(utcMilliseconds);
}
