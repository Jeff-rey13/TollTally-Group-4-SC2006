/**
 * Lab 4, section 3.2.2: white-box basis path testing of two methods with complex
 * application logic.
 *
 *   selectRate (backend/src/domain/erp.ts)          V(G) = 10, ten feasible basis paths
 *   recommendDeparture (backend/src/domain/ranking.ts) V(G) = 8, five feasible paths
 *
 * Path IDs and decision labels (D1, D2, ...) match the control flow graphs in the
 * Lab 4 test report.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { selectRate, type RateLike } from '../../src/domain/erp';
import { D } from '../../src/domain/money';
import { recommendDeparture, type PricedSlot } from '../../src/domain/ranking';
import { sgLocal } from '../../src/domain/time';
import { createRecorder } from './recorder';

const rec = createRecorder('basis-path');
afterAll(() => rec.flush());

// ---------------------------------------------------------------------------------
// selectRate
// ---------------------------------------------------------------------------------

const CAR = 'PASSENGER_CAR_LGV_TAXI' as const;
const BIKE = 'MOTORCYCLE' as const;
const EFFECTIVE = new Date('2026-01-01T00:00:00Z');

function rate(
  id: string,
  startTime: string,
  endTime: string,
  amount: string,
  overrides: Partial<RateLike> = {},
): RateLike {
  return {
    id,
    chargePointId: 'CP1',
    vehicleClass: CAR,
    dayType: 'WEEKDAY',
    startTime,
    endTime,
    rate: D(amount),
    effectiveDate: EFFECTIVE,
    isWithdrawn: false,
    ...overrides,
  };
}

/** Weekday schedule at charge point CP1 used by every selectRate path. */
const RATES: RateLike[] = [
  rate('r0730', '07:30', '08:00', '1.00'),
  rate('r0800', '08:00', '08:30', '2.00'),
  rate('r0830', '08:30', '09:00', '3.00'),
  rate('bike1200', '12:00', '12:30', '0.50', { vehicleClass: BIKE }),
];
const TOLERANCE = 5;
// Tuesday 3 November 2026, Singapore time.
const at = (h: number, m: number) => sgLocal(2026, 11, 3, h, m);

interface SelectCase {
  id: string;
  path: string;
  input: string;
  chargePointId: string;
  dayType: 'WEEKDAY' | 'SATURDAY' | 'SUNDAY_PUBLIC_HOLIDAY';
  time: Date;
  expected: {
    rateId: string | null;
    adjacentId: string | null;
    adjacentRate: string | null;
    nearBoundary: boolean;
    outsideOperatingHours: boolean;
    missing: boolean;
  };
}

const SELECT_CASES: SelectCase[] = [
  {
    id: 'SR-P1',
    path: 'D1F D3F D5F D6F D7F D8F',
    input: 'CP1, weekday, car, 08:15',
    chargePointId: 'CP1',
    dayType: 'WEEKDAY',
    time: at(8, 15),
    expected: {
      rateId: 'r0800',
      adjacentId: null,
      adjacentRate: null,
      nearBoundary: false,
      outsideOperatingHours: false,
      missing: false,
    },
  },
  {
    id: 'SR-P2',
    path: 'D1T D2T',
    input: 'CP1, Sunday/public holiday, car, 08:15 (no Sunday schedule)',
    chargePointId: 'CP1',
    dayType: 'SUNDAY_PUBLIC_HOLIDAY',
    time: at(8, 15),
    expected: {
      rateId: null,
      adjacentId: null,
      adjacentRate: null,
      nearBoundary: false,
      outsideOperatingHours: true,
      missing: false,
    },
  },
  {
    id: 'SR-P3',
    path: 'D1T D2F',
    input: 'CP2 (no rates at all), weekday, car, 08:15',
    chargePointId: 'CP2',
    dayType: 'WEEKDAY',
    time: at(8, 15),
    expected: {
      rateId: null,
      adjacentId: null,
      adjacentRate: null,
      nearBoundary: false,
      outsideOperatingHours: false,
      missing: true,
    },
  },
  {
    id: 'SR-P4',
    path: 'D1F D3T D4T',
    input: 'CP1, weekday, car, 07:27 (3 min before charging starts)',
    chargePointId: 'CP1',
    dayType: 'WEEKDAY',
    time: at(7, 27),
    expected: {
      rateId: null,
      adjacentId: 'r0730',
      adjacentRate: '1',
      nearBoundary: true,
      outsideOperatingHours: true,
      missing: false,
    },
  },
  {
    id: 'SR-P5',
    path: 'D1F D3T D4F',
    input: 'CP1, weekday, car, 06:00 (far outside charging hours)',
    chargePointId: 'CP1',
    dayType: 'WEEKDAY',
    time: at(6, 0),
    expected: {
      rateId: null,
      adjacentId: null,
      adjacentRate: null,
      nearBoundary: false,
      outsideOperatingHours: true,
      missing: false,
    },
  },
  {
    id: 'SR-P6',
    path: 'D1F D3F D5T',
    input: 'CP1, weekday, car, 12:10 (only a motorcycle rate covers 12:00-12:30)',
    chargePointId: 'CP1',
    dayType: 'WEEKDAY',
    time: at(12, 10),
    expected: {
      rateId: null,
      adjacentId: null,
      adjacentRate: null,
      nearBoundary: false,
      outsideOperatingHours: false,
      missing: true,
    },
  },
  {
    id: 'SR-P7',
    path: 'D1F D3F D5F D6T D8T D9T',
    input: 'CP1, weekday, car, 08:02 (2 min after 08:00 start, previous period exists)',
    chargePointId: 'CP1',
    dayType: 'WEEKDAY',
    time: at(8, 2),
    expected: {
      rateId: 'r0800',
      adjacentId: 'r0730',
      adjacentRate: '1',
      nearBoundary: true,
      outsideOperatingHours: false,
      missing: false,
    },
  },
  {
    id: 'SR-P8',
    path: 'D1F D3F D5F D6T D8T D9F',
    input: 'CP1, weekday, car, 07:32 (2 min after the first period starts, nothing before it)',
    chargePointId: 'CP1',
    dayType: 'WEEKDAY',
    time: at(7, 32),
    expected: {
      rateId: 'r0730',
      adjacentId: null,
      adjacentRate: '0',
      nearBoundary: true,
      outsideOperatingHours: false,
      missing: false,
    },
  },
  {
    id: 'SR-P9',
    path: 'D1F D3F D5F D6F D7T D8T D9T',
    input: 'CP1, weekday, car, 08:27 (3 min before 08:30, next period exists)',
    chargePointId: 'CP1',
    dayType: 'WEEKDAY',
    time: at(8, 27),
    expected: {
      rateId: 'r0800',
      adjacentId: 'r0830',
      adjacentRate: '3',
      nearBoundary: true,
      outsideOperatingHours: false,
      missing: false,
    },
  },
  {
    id: 'SR-P10',
    path: 'D1F D3F D5F D6F D7T D8T D9F',
    input: 'CP1, weekday, car, 08:57 (3 min before charging ends, nothing after it)',
    chargePointId: 'CP1',
    dayType: 'WEEKDAY',
    time: at(8, 57),
    expected: {
      rateId: 'r0830',
      adjacentId: null,
      adjacentRate: '0',
      nearBoundary: true,
      outsideOperatingHours: false,
      missing: false,
    },
  },
];

describe('Lab 4 basis path: selectRate (erp.ts)', () => {
  for (const c of SELECT_CASES) {
    it(`${c.id} ${c.path}: ${c.input}`, () => {
      const s = selectRate(
        RATES,
        { chargePointId: c.chargePointId, vehicleClass: CAR, dayType: c.dayType },
        c.time,
        TOLERANCE,
      );
      const actual = {
        rateId: s.rate?.id ?? null,
        adjacentId: s.adjacent?.id ?? null,
        adjacentRate: s.adjacentRate === null ? null : s.adjacentRate.toString(),
        nearBoundary: s.nearBoundary,
        outsideOperatingHours: s.outsideOperatingHours,
        missing: s.missing,
      };
      rec.record({
        id: c.id,
        technique: `Basis path ${c.path}`,
        input: c.input,
        expected: JSON.stringify(c.expected),
        actual: JSON.stringify(actual),
      });
      expect(actual).toEqual(c.expected);
    });
  }
});

// ---------------------------------------------------------------------------------
// recommendDeparture
// ---------------------------------------------------------------------------------

const slot = (h: number, m: number, total: string, width = '0.50'): PricedSlot => ({
  time: at(h, m),
  total: D(total),
  lower: D(total),
  upper: D(total).plus(width),
});
const unpriced = (h: number, m: number, total: string): PricedSlot => ({
  time: at(h, m),
  total: D(total),
  lower: D(total),
  upper: null,
});

interface DepartureCase {
  id: string;
  path: string;
  input: string;
  slots: PricedSlot[];
  planned: Date;
  expected: {
    bestTime: string | null;
    saving: string | null;
    withinMargin: boolean;
    plannedIsCheapest: boolean;
    allIdentical: boolean;
  };
}

const hhmm = (d: Date | null) =>
  d === null
    ? null
    : new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Singapore',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(d);

const DEPARTURE_CASES: DepartureCase[] = [
  {
    id: 'RD-P1',
    path: 'D1F D2T D3F D2T D3T D2F D4aT D4bF D5T D6T',
    input: 'planned 08:00 $5.00, 08:15 $3.00 (ranges 0.50 wide)',
    slots: [slot(8, 0, '5.00'), slot(8, 15, '3.00')],
    planned: at(8, 0),
    expected: {
      bestTime: '08:15',
      saving: '2',
      withinMargin: false,
      plannedIsCheapest: false,
      allIdentical: false,
    },
  },
  {
    id: 'RD-P2',
    path: 'D1T',
    input: 'every slot has an unavailable component (no upper bound)',
    slots: [unpriced(8, 0, '5.00'), unpriced(8, 15, '3.00')],
    planned: at(8, 0),
    expected: {
      bestTime: null,
      saving: null,
      withinMargin: false,
      plannedIsCheapest: false,
      allIdentical: false,
    },
  },
  {
    id: 'RD-P3',
    path: 'D1F D2T D3F D2T D3F D2F D4aT D4bT D5T D6T',
    input: '07:45 $3.00, planned 08:00 $3.00 (planned ties for cheapest)',
    slots: [slot(7, 45, '3.00'), slot(8, 0, '3.00')],
    planned: at(8, 0),
    expected: {
      bestTime: '08:00',
      saving: '0',
      withinMargin: false,
      plannedIsCheapest: true,
      allIdentical: true,
    },
  },
  {
    id: 'RD-P4',
    path: 'D1F D2T D3F D2T D3T D2F D4aF D5F D6F',
    input: 'planned 08:00 slot cannot be fully priced, 07:45 $4.00, 08:15 $3.00',
    slots: [slot(7, 45, '4.00'), unpriced(8, 0, '5.00'), slot(8, 15, '3.00')],
    planned: at(8, 0),
    expected: {
      bestTime: '08:15',
      saving: null,
      withinMargin: false,
      plannedIsCheapest: false,
      allIdentical: false,
    },
  },
  {
    id: 'RD-P5',
    path: 'D1F D2T D3F D2T D3F D2F D4aT D4bF D5T D6T',
    input: '07:45 $3.00, planned 08:00 $3.20 (saving 0.20 is inside the 0.50 margin)',
    slots: [slot(7, 45, '3.00'), slot(8, 0, '3.20')],
    planned: at(8, 0),
    expected: {
      bestTime: '07:45',
      saving: '0.2',
      withinMargin: true,
      plannedIsCheapest: false,
      allIdentical: false,
    },
  },
];

describe('Lab 4 basis path: recommendDeparture (ranking.ts)', () => {
  for (const c of DEPARTURE_CASES) {
    it(`${c.id} ${c.path}: ${c.input}`, () => {
      const r = recommendDeparture(c.slots, c.planned);
      const actual = {
        bestTime: hhmm(r.bestTime),
        saving: r.saving === null ? null : r.saving.toString(),
        withinMargin: r.withinMargin,
        plannedIsCheapest: r.plannedIsCheapest,
        allIdentical: r.allIdentical,
      };
      rec.record({
        id: c.id,
        technique: `Basis path ${c.path}`,
        input: c.input,
        expected: JSON.stringify(c.expected),
        actual: JSON.stringify(actual),
      });
      expect(actual).toEqual(c.expected);
    });
  }
});
