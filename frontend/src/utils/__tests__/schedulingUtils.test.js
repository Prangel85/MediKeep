import { describe, it, expect } from 'vitest';
import {
  daysUntil,
  emptyToNull,
  facilityPartsToApi,
  formatLeadTime,
  formatMoney,
  idOrNull,
  toNumberOrNull,
  utcToFacilityParts,
} from '../schedulingUtils';

const t = (key, opts) =>
  (opts?.defaultValue || key).replace('{{count}}', opts?.count);

describe('utcToFacilityParts', () => {
  it('converts UTC to the given timezone', () => {
    expect(utcToFacilityParts('2030-03-10T09:30:00+00:00', 'Europe/Rome')).toEqual({
      date: '2030-03-10',
      time: '10:30',
    });
  });

  it('handles a date change across midnight', () => {
    expect(utcToFacilityParts('2030-03-10T23:30:00Z', 'Europe/Rome')).toEqual({
      date: '2030-03-11',
      time: '00:30',
    });
  });

  it('returns empty parts for missing or invalid input', () => {
    expect(utcToFacilityParts(null)).toEqual({ date: '', time: '' });
    expect(utcToFacilityParts('nope', 'UTC')).toEqual({ date: '', time: '' });
  });
});

describe('facilityPartsToApi', () => {
  it('builds a naive datetime string', () => {
    expect(facilityPartsToApi('2030-03-10', '9:05')).toBe('2030-03-10T09:05:00');
  });

  it('defaults to midnight on a bad time and null without a date', () => {
    expect(facilityPartsToApi('2030-03-10', '')).toBe('2030-03-10T00:00:00');
    expect(facilityPartsToApi('', '10:00')).toBeNull();
  });
});

describe('daysUntil', () => {
  it('counts whole days, negative in the past', () => {
    expect(daysUntil('2030-03-17', '2030-03-10')).toBe(7);
    expect(daysUntil('2030-03-10', '2030-03-10')).toBe(0);
    expect(daysUntil('2030-03-08', '2030-03-10')).toBe(-2);
  });

  it('is not affected by DST changes', () => {
    expect(daysUntil('2030-04-01', '2030-03-25')).toBe(7);
  });

  it('returns null without a date', () => {
    expect(daysUntil(null, '2030-03-10')).toBeNull();
  });
});

describe('formatLeadTime', () => {
  it('picks the largest whole unit', () => {
    expect(formatLeadTime(10080, t)).toBe('7 days');
    expect(formatLeadTime(120, t)).toBe('2 hours');
    expect(formatLeadTime(90, t)).toBe('90 minutes');
  });
});

describe('formatMoney', () => {
  it('formats with the currency', () => {
    expect(formatMoney(36.15, 'EUR', 'en-US')).toBe('€36.15');
  });

  it('falls back on unknown currency codes', () => {
    expect(formatMoney('10', 'XX', 'en-US')).toBe('10.00 XX');
  });

  it('returns empty string for empty amounts', () => {
    expect(formatMoney('', 'EUR')).toBe('');
    expect(formatMoney(null, 'EUR')).toBe('');
  });
});

describe('value helpers', () => {
  it('normalize form values', () => {
    expect(toNumberOrNull('')).toBeNull();
    expect(toNumberOrNull('12')).toBe(12);
    expect(emptyToNull('')).toBeNull();
    expect(emptyToNull('x')).toBe('x');
    expect(idOrNull('3')).toBe(3);
    expect(idOrNull('')).toBeNull();
  });
});
