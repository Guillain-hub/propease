import { describe, expect, it } from 'vitest';
import {
  getRentChargePeriod,
  getRentDueDate,
} from './rent-charges.processor.js';

describe('rent charge date helpers', () => {
  it('formats the rent period in UTC', () => {
    expect(getRentChargePeriod(new Date('2026-01-31T23:30:00.000Z'))).toBe(
      '2026-01',
    );
    expect(getRentChargePeriod(new Date('2026-02-01T00:30:00.000Z'))).toBe(
      '2026-02',
    );
  });

  it('clamps a due day to the last day of the month', () => {
    expect(getRentDueDate(new Date('2026-02-01T00:00:00.000Z'), 31)).toEqual(
      new Date('2026-02-28T00:00:00.000Z'),
    );
  });

  it('keeps valid due days within the rent month', () => {
    expect(getRentDueDate(new Date('2024-02-01T00:00:00.000Z'), 29)).toEqual(
      new Date('2024-02-29T00:00:00.000Z'),
    );
  });
});
