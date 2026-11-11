/**
 * Date/time helpers for appointments, prescriptions and payments.
 *
 * Appointment times are stored in UTC. The form works in the facility
 * timezone (the same one timezoneService uses for display): we send a naive
 * "YYYY-MM-DDTHH:MM:00" string, which the backend reads as facility local
 * time, and we convert stored UTC values back to facility local date/time
 * parts when editing.
 */
import { timezoneService } from '../services/timezoneService';

const pad = n => String(n).padStart(2, '0');

/** UTC ISO string -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in facility time. */
export const utcToFacilityParts = (utcString, timezone = null) => {
  if (!utcString) return { date: '', time: '' };
  const d = new Date(utcString);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const tz = timezone || timezoneService.getTimezone() || 'UTC';
  // sv-SE formats as "YYYY-MM-DD HH:MM:SS"
  const formatted = d.toLocaleString('sv-SE', { timeZone: tz, hour12: false });
  const [date, time] = formatted.split(' ');
  return { date, time: (time || '').slice(0, 5) };
};

/** Facility-local date + time parts -> naive datetime string for the API. */
export const facilityPartsToApi = (date, time) => {
  if (!date) return null;
  const hhmm = /^\d{1,2}:\d{2}$/.test(time || '') ? time : '00:00';
  const [h, m] = hhmm.split(':');
  return `${date}T${pad(h)}:${m}:00`;
};

/** Today's date (YYYY-MM-DD) in the facility timezone. */
export const facilityToday = (timezone = null) =>
  utcToFacilityParts(new Date().toISOString(), timezone).date;

/** Whole days from today (facility time) to a YYYY-MM-DD date; negative if past. */
export const daysUntil = (dateString, today = null) => {
  if (!dateString) return null;
  const base = today || facilityToday();
  const toUtcMidnight = s => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtcMidnight(dateString) - toUtcMidnight(base)) / 86400000);
};

/**
 * Lead time in minutes -> translated label ("7 days", "2 hours").
 * Uses i18next plural keys scheduling.leadTime.days/hours/minutes.
 */
export const formatLeadTime = (minutes, t) => {
  if (minutes % 1440 === 0) {
    const count = minutes / 1440;
    return t('scheduling.leadTime.days', { count, defaultValue: '{{count}} days' });
  }
  if (minutes % 60 === 0) {
    const count = minutes / 60;
    return t('scheduling.leadTime.hours', { count, defaultValue: '{{count}} hours' });
  }
  return t('scheduling.leadTime.minutes', {
    count: minutes,
    defaultValue: '{{count}} minutes',
  });
};

/** Days before -> translated label ("1 day before"). */
export const formatDaysBefore = (days, t) =>
  t('scheduling.daysBefore', { count: days, defaultValue: '{{count}} days before' });

/** Amount + ISO currency -> localized money string; falls back to "12.50 EUR". */
export const formatMoney = (amount, currency, locale = undefined) => {
  if (amount === null || amount === undefined || amount === '') return '';
  const value = Number(amount);
  if (Number.isNaN(value)) return '';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'EUR',
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || ''}`.trim();
  }
};

/** Numeric-ish form values -> number or null. */
export const toNumberOrNull = value =>
  value === '' || value === null || value === undefined ? null : Number(value);

/** Empty strings -> null, for optional text fields sent to the API. */
export const emptyToNull = value =>
  value === '' || value === undefined ? null : value;

/** Select values are strings; ids go back as numbers (or null). */
export const idOrNull = value =>
  value === '' || value === null || value === undefined ? null : Number(value);
