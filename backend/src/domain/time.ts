export const SG_TIME_ZONE = 'Asia/Singapore';
const SG_OFFSET_HOURS = 8;

const partsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: SG_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export interface SgParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
  isoDate: string;
  minutesOfDay: number;
}

export function sgParts(instant: Date): SgParts {
  const map: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(instant)) map[part.type] = part.value;
  const hour = Number(map.hour) % 24;
  const minute = Number(map.minute);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute,
    weekday: WEEKDAYS[map.weekday] ?? 0,
    isoDate: `${map.year}-${map.month}-${map.day}`,
    minutesOfDay: hour * 60 + minute,
  };
}

export function sgLocal(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - SG_OFFSET_HOURS, minute));
}

export function parseHHMM(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function formatHHMM(minutesOfDay: number): string {
  return `${pad(Math.floor(minutesOfDay / 60))}:${pad(minutesOfDay % 60)}`;
}

export function sgDateString(instant: Date): string {
  return sgParts(instant).isoDate;
}

export function formatSgTime(instant: Date): string {
  const p = sgParts(instant);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function formatSgDateTime(instant: Date): string {
  const p = sgParts(instant);
  return `${p.isoDate} ${pad(p.hour)}:${pad(p.minute)}`;
}

export function sgDayStart(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return sgLocal(y, m, d, 0, 0);
}

export function sgDayEnd(isoDate: string): Date {
  return new Date(sgDayStart(isoDate).getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60 * 1000);
}

export function daysBetween(earlier: Date, later: Date): number {
  return (later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000);
}
