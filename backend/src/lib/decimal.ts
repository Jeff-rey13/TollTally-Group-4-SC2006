import { Decimal } from '../domain/money';

type DecimalLike = { toString(): string } | string | number;

/**
 * Converts a database or JSON value to decimal.js without passing through binary floating point arithmetic.
 */
export function toDecimal(value: DecimalLike): Decimal {
  if (typeof value === 'string') return new Decimal(value);
  if (typeof value === 'number') return new Decimal(String(value));
  return new Decimal(value.toString());
}

export function toDecimalOrNull(value: DecimalLike | null | undefined): Decimal | null {
  return value === null || value === undefined ? null : toDecimal(value);
}

/**
 * Converts a decimal value to the string form stored by Prisma.
 */
export function toDb(value: Decimal): string {
  return value.toString();
}

export function toDbOrNull(value: Decimal | null): string | null {
  return value === null ? null : value.toString();
}
