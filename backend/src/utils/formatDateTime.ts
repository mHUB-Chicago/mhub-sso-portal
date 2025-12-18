import { DateTime } from "luxon";

/**
 * Validates and formats a date string in 'YYYY-MM-DD' format to ISO 8601 format in UTC.
 * Example: '2023-10-05', 'America/New_York' -> '2023-10-05T00:00:00.000Z'
 * @param dateStr - The date string to validate and format. In 'YYYY-MM-DD' format.
 * @param timezone - The IANA timezone string (e.g., 'America/New_York').
 * @returns The formatted date string in ISO 8601 format in UTC.
 * @throws Error if the date string is invalid or the timezone is invalid.
 */
export const validateAndFormatDateTime = (dateStr: string, timezone: string): string => {
  const validDateString = /^\d{4}-\d{2}-\d{2}$/;
  if (!validDateString.test(dateStr)) {
    throw new Error("Invalid date format, expected YYYY-MM-DD");
  }
  const validZone = validateAndFormatTimezone(timezone);
  if (validZone === null) {
    throw new Error("Invalid timezone, only IANA time zone names are supported");
  }
  // Parse the date in the specified timezone and convert to ISO 8601 format
  let dt = DateTime.fromISO(dateStr, { zone: timezone });
  if (!dt || !dt.isValid) {
    throw new Error("Invalid date time");
  }
  const formattedDate = dt.toUTC().toISO();
  if (!formattedDate) {
    throw new Error("Failed to convert date to ISO format");
  }
  return formattedDate;
}

/**
 * Validates an IANA timezone string.
 * @param timezone - The IANA timezone string to validate (e.g., 'America/New_York').
 * @returns The validated timezone string.
 * @throws Error if the timezone string is invalid.
 */
export const validateAndFormatTimezone = (timezone: string): string => {
  if (!timezone) {
    throw new Error("Timezone is required");
  }
  const validZone = DateTime.now().setZone(timezone.trim()).zoneName;
  if (validZone === null) {
    throw new Error("Invalid timezone, only IANA time zone names are supported");
  }
  return timezone.trim();
}

export const getTimezoneMinuteOffset = (timezone: string): number => {
  const validZone = validateAndFormatTimezone(timezone);
  if (validZone === null) {
    throw new Error("Invalid timezone, only IANA time zone names are supported");
  }
  const dt = DateTime.now().setZone(timezone);
  if (!dt || !dt.isValid) {
    throw new Error("Invalid date time");
  }
  return dt.offset; // in minutes
}