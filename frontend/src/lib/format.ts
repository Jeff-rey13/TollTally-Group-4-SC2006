const SG = 'Asia/Singapore';

const dateTimeFormat = new Intl.DateTimeFormat('en-SG', {
  timeZone: SG,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const dateFormat = new Intl.DateTimeFormat('en-SG', {
  timeZone: SG,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const timeFormat = new Intl.DateTimeFormat('en-SG', {
  timeZone: SG,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function sgd(value: string | null | undefined): string {
  return value === null || value === undefined ? 'n/a' : `SGD ${value}`;
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatSgDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return dateFormat.format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function toLocalInputValue(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SG,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function fromLocalInputValue(value: string): string {
  if (!value) return '';
  const date = new Date(`${value}:00+08:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function todaySg(): string {
  return toLocalInputValue(new Date()).slice(0, 10);
}

export function defaultDeparture(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return toLocalInputValue(d);
}
