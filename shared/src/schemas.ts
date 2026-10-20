import { z } from 'zod';
import { DAY_TYPES, FUEL_LEVEL_UNITS, FUEL_TYPES, OWNERSHIP_TYPES, VEHICLE_CLASSES } from './enums';

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const numericInput = (v: unknown) =>
  typeof v === 'number' || typeof v === 'string' ? blankToUndefined(v) : Number.NaN;

const optionalText = (max: number) =>
  z.preprocess(
    blankToUndefined,
    z.string().trim().max(max, `Use at most ${max} characters`).optional(),
  );

export const passwordSchema = z
  .string({ error: 'Enter a password' })
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one digit');

export const registerSchema = z.object({
  email: z.email({ error: 'Enter a valid email address' }).max(254, 'Email is too long'),
  password: passwordSchema,
  acceptPrivacy: z.literal(true, {
    error: 'Agree to the privacy notice to create an account',
  }),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const deleteAccountSchema = z.object({
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password'),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export const loginSchema = z.object({
  email: z.email({ error: 'Enter a valid email address' }),
  password: z.string({ error: 'Enter your password' }).min(1, 'Enter your password'),
  remember: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.email({ error: 'Enter a valid email address' }).max(254, 'Email is too long'),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z
    .string({ error: 'This reset link is incomplete. Open the link from the email again.' })
    .min(20, 'This reset link is incomplete. Open the link from the email again.')
    .max(200),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const vehicleSchema = z.object({
  displayName: z
    .string({ error: 'Enter a display name' })
    .trim()
    .min(1, 'Enter a display name')
    .max(60, 'Use at most 60 characters'),
  ownershipType: z.enum(OWNERSHIP_TYPES, { error: 'Choose owned or rented' }),
  fuelType: z.enum(FUEL_TYPES, { error: 'Choose a fuel type' }),
  vehicleClass: z
    .enum(VEHICLE_CLASSES, { error: 'Choose a vehicle class' })
    .default('PASSENGER_CAR_LGV_TAXI'),
  make: optionalText(40),
  model: optionalText(40),
  consumptionRate: z.preprocess(
    numericInput,
    z.coerce
      .number({ error: 'Enter the consumption rate in L/100 km' })
      .positive('Consumption rate must be greater than 0')
      .max(100, 'Use at most 100 L/100 km')
      .optional(),
  ),
  tankCapacity: z.preprocess(
    numericInput,
    z.coerce
      .number({ error: 'Enter the tank capacity in litres' })
      .positive('Tank capacity must be greater than 0')
      .max(2000, 'Use at most 2000 litres'),
  ),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const SINGAPORE_BOUNDS = {
  minLat: 1.13,
  maxLat: 1.49,
  minLng: 103.55,
  maxLng: 104.15,
} as const;

export function isInSingapore(lat: number, lng: number): boolean {
  return (
    lat >= SINGAPORE_BOUNDS.minLat &&
    lat <= SINGAPORE_BOUNDS.maxLat &&
    lng >= SINGAPORE_BOUNDS.minLng &&
    lng <= SINGAPORE_BOUNDS.maxLng
  );
}

const locationSchema = z
  .object({
    name: z.string({ error: 'Choose a location' }).trim().min(1, 'Choose a location').max(200),
    lat: z.number({ error: 'Choose a location from the suggestions' }),
    lng: z.number({ error: 'Choose a location from the suggestions' }),
  })
  .refine((l) => isInSingapore(l.lat, l.lng), {
    error: 'Choose a location in Singapore',
    path: ['name'],
  });
export type LocationInput = z.infer<typeof locationSchema>;

const isoDateTime = (message: string) => z.iso.datetime({ offset: true, error: message });

export const tripSchema = z
  .object({
    vehicleProfileId: z.string({ error: 'Choose a vehicle' }).min(1, 'Choose a vehicle'),
    origin: locationSchema,
    destination: locationSchema,
    departureTime: isoDateTime('Enter the departure date and time'),
    isReturnTrip: z.boolean().default(false),
    returnDepartureTime: z.preprocess(
      blankToUndefined,
      isoDateTime('Enter the return date and time').optional(),
    ),
    parkingDurationMin: z.preprocess(
      numericInput,
      z.coerce
        .number({ error: 'Enter the parking duration in minutes' })
        .int('Use whole minutes')
        .min(0, 'Parking duration cannot be negative')
        .max(10080, 'Use at most 7 days (10080 minutes)')
        .optional(),
    ),
  })
  .superRefine((t, ctx) => {
    const sameSpot =
      Math.abs(t.origin.lat - t.destination.lat) < 0.0005 &&
      Math.abs(t.origin.lng - t.destination.lng) < 0.0005;
    if (sameSpot) {
      ctx.addIssue({
        code: 'custom',
        path: ['destination', 'name'],
        message: 'Destination must be a different place from the origin',
      });
    }
    if (new Date(t.departureTime).getTime() <= Date.now()) {
      ctx.addIssue({
        code: 'custom',
        path: ['departureTime'],
        message: 'Departure must be in the future',
      });
    }
    if (t.isReturnTrip) {
      if (!t.returnDepartureTime) {
        ctx.addIssue({
          code: 'custom',
          path: ['returnDepartureTime'],
          message: 'Enter the return departure date and time',
        });
      } else if (new Date(t.returnDepartureTime).getTime() <= new Date(t.departureTime).getTime()) {
        ctx.addIssue({
          code: 'custom',
          path: ['returnDepartureTime'],
          message: 'Return departure must be after the outbound departure',
        });
      }
    }
  });
export type TripInput = z.infer<typeof tripSchema>;

const fuelLevel = (message: string) =>
  z.preprocess(
    numericInput,
    z.coerce
      .number({ error: message })
      .min(0, 'A fuel level cannot be negative')
      .max(100000, 'Check the value'),
  );

export const topUpSchema = z
  .object({
    pickUpLevel: fuelLevel('Enter the fuel level at pick-up'),
    requiredReturnLevel: fuelLevel('Enter the fuel level required at return'),
    unit: z.enum(FUEL_LEVEL_UNITS, { error: 'Choose a unit' }),
  })
  .superRefine((v, ctx) => {
    const max = v.unit === 'TANK_FRACTION' ? 1 : v.unit === 'PERCENT' ? 100 : null;
    const label =
      v.unit === 'TANK_FRACTION'
        ? 'A tank fraction is between 0 and 1'
        : 'A percentage is between 0 and 100';
    if (max !== null) {
      if (v.pickUpLevel > max)
        ctx.addIssue({ code: 'custom', path: ['pickUpLevel'], message: label });
      if (v.requiredReturnLevel > max)
        ctx.addIssue({ code: 'custom', path: ['requiredReturnLevel'], message: label });
    }
  });
export type TopUpInput = z.infer<typeof topUpSchema>;

const optionalMoney = (label: string) =>
  z.preprocess(
    numericInput,
    z.coerce
      .number({ error: `Enter the actual ${label} as a number` })
      .min(0, `The actual ${label} cannot be negative`)
      .max(100000, 'Check the value')
      .optional(),
  );

export const tripLogSchema = z
  .object({
    actualFuelCost: optionalMoney('fuel cost'),
    actualRoadUsageCharge: optionalMoney('road usage charge'),
    actualParkingFee: optionalMoney('parking fee'),
  })
  .refine(
    (v) =>
      [v.actualFuelCost, v.actualRoadUsageCharge, v.actualParkingFee].some((x) => x !== undefined),
    { error: 'Enter at least one actual cost', path: ['actualFuelCost'] },
  );
export type TripLogInput = z.infer<typeof tripLogSchema>;

export const fuelPriceSchema = z.object({
  brand: z
    .string({ error: 'Enter a brand' })
    .trim()
    .min(1, 'Enter a brand')
    .max(40, 'Use at most 40 characters'),
  fuelType: z.enum(FUEL_TYPES, { error: 'Choose a fuel type' }),
  price: z.preprocess(
    numericInput,
    z.coerce
      .number({ error: 'Enter a price per litre' })
      .positive('Price must be greater than 0')
      .max(20, 'Check the price; it should be in SGD per litre'),
  ),
});
export type FuelPriceInput = z.infer<typeof fuelPriceSchema>;

const hhmm = z
  .string({ error: 'Use HH:MM' })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, for example 07:30');

export const erpRateSchema = z
  .object({
    chargePointId: z.string({ error: 'Choose a charge point' }).min(1, 'Choose a charge point'),
    vehicleClass: z.enum(VEHICLE_CLASSES, { error: 'Choose a vehicle class' }),
    dayType: z.enum(DAY_TYPES, { error: 'Choose a day type' }),
    startTime: hhmm,
    endTime: hhmm,
    rate: z.preprocess(
      numericInput,
      z.coerce
        .number({ error: 'Enter a rate in SGD' })
        .min(0, 'A rate cannot be negative; use 0 for a free period')
        .max(50, 'Check the rate'),
    ),
    effectiveDate: z.iso.date({ error: 'Enter the effective date as YYYY-MM-DD' }),
  })
  .refine((r) => r.startTime < r.endTime, {
    error: 'End time must be after the start time',
    path: ['endTime'],
  });
export type ErpRateInput = z.infer<typeof erpRateSchema>;

export const efficiencyRecordSchema = z.object({
  make: z
    .string({ error: 'Enter a make' })
    .trim()
    .min(1, 'Enter a make')
    .max(40, 'Use at most 40 characters'),
  model: z
    .string({ error: 'Enter a model' })
    .trim()
    .min(1, 'Enter a model')
    .max(40, 'Use at most 40 characters'),
  consumptionRate: z.preprocess(
    numericInput,
    z.coerce
      .number({ error: 'Enter the consumption rate in L/100 km' })
      .positive('Consumption rate must be greater than 0')
      .max(100, 'Use at most 100 L/100 km'),
  ),
  tankCapacity: z.preprocess(
    numericInput,
    z.coerce
      .number({ error: 'Enter the tank capacity in litres' })
      .positive('Tank capacity must be greater than 0')
      .max(2000, 'Use at most 2000 litres')
      .optional(),
  ),
  fuelType: z.preprocess(
    blankToUndefined,
    z.enum(FUEL_TYPES, { error: 'Choose a fuel type' }).optional(),
  ),
  source: optionalText(200),
  // Car models use the passenger car class; motorcycles appear only in the motorcycle list
  vehicleClass: z.preprocess(
    blankToUndefined,
    z.enum(VEHICLE_CLASSES, { error: 'Choose car or motorcycle' }).optional(),
  ),
});
export type EfficiencyRecordInput = z.infer<typeof efficiencyRecordSchema>;

export const historyQuerySchema = z
  .object({
    from: z.preprocess(blankToUndefined, z.iso.date({ error: 'Use YYYY-MM-DD' }).optional()),
    to: z.preprocess(blankToUndefined, z.iso.date({ error: 'Use YYYY-MM-DD' }).optional()),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    error: 'End date must be on or after the start date',
    path: ['to'],
  });
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

export const locationSearchSchema = z.object({
  q: z
    .string({ error: 'Type a place to search for' })
    .trim()
    .min(2, 'Type at least two characters')
    .max(100),
});

export const applyDepartureSchema = z.object({
  departureTime: isoDateTime('Choose a departure slot'),
});
export type ApplyDepartureInput = z.infer<typeof applyDepartureSchema>;

export const chooseRouteSchema = z.object({
  optionId: z.string({ error: 'Choose a route option' }).min(1, 'Choose a route option'),
});
export type ChooseRouteInput = z.infer<typeof chooseRouteSchema>;

export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
