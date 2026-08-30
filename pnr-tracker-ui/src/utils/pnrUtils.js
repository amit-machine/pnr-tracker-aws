export function canTrackPnr(status) {
  if (!status) {
    return false;
  }

  const chartPrepared =
    status.chart?.status?.toLowerCase() === "chart prepared";

  if (chartPrepared) {
    return false;
  }

  const journeyDate = parseRailkitDate(status.journey?.dateOfJourney);

  if (!journeyDate) {
    return false;
  }

  return journeyDate > new Date();
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
