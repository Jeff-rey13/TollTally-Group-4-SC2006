import type { Dispatch, SetStateAction } from 'react';
import type { z } from 'zod';
import { fieldErrorsOf } from '@tolltally/shared';

export function validate<T extends z.ZodType>(
  schema: T,
  values: unknown,
): { data: z.output<T> | null; errors: Record<string, string> } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: {} };
  return { data: null, errors: fieldErrorsOf(result.error) };
}

export function fieldSetter<T extends Record<string, string>>(
  setValues: Dispatch<SetStateAction<T>>,
) {
  return (key: keyof T) =>
    (event: { target: { value: string } }): void =>
      setValues((values) => ({ ...values, [key]: event.target.value }));
}
