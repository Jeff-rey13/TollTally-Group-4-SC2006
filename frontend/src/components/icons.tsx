import type { ReactNode } from 'react';
import type { ComponentType } from '@tolltally/shared';

function Icon({ className = 'h-5 w-5', children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

type IconProps = { className?: string };

export const IconFuel = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
    <path d="M3 21h12" />
    <path d="M4 10h10" />
    <path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8.5L18 5.5" />
  </Icon>
);
export const IconGantry = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 20V7h18v13" />
    <path d="M3 11h18" />
    <path d="M8 7V4h8v3" />
  </Icon>
);
export const IconParking = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
  </Icon>
);
export const IconRoute = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="19" r="2" />
    <circle cx="18" cy="5" r="2" />
    <path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7" />
  </Icon>
);
export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);
export const IconDroplet = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />
  </Icon>
);
export const IconList = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <path d="M3 6h.01M3 12h.01M3 18h.01" />
  </Icon>
);
export const IconArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="M11 18l-6-6 6-6" />
  </Icon>
);
export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </Icon>
);
export const IconCar = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 16h14v-4l-2-5H7l-2 5z" />
    <circle cx="8" cy="17" r="1.6" />
    <circle cx="16" cy="17" r="1.6" />
  </Icon>
);
export const IconMotorcycle = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5.5" cy="16.5" r="3" />
    <circle cx="18.5" cy="16.5" r="3" />
    <path d="M5.5 16.5 10 10h5l3.5 6.5" />
    <path d="M14 6h2.5l1.5 4" />
    <path d="M9 10h-2" />
  </Icon>
);
export const IconHistory = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4" />
    <path d="M12 8v4l3 2" />
  </Icon>
);
export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const IconRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </Icon>
);
export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 8h.01" />
  </Icon>
);
export const IconWarning = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5" />
    <path d="M12 18h.01" />
  </Icon>
);
export const IconRain = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 15a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7H7z" />
    <path d="M9 18l-1 2.5" />
    <path d="M13 18l-1 2.5" />
    <path d="M17 18l-1 2.5" />
  </Icon>
);
export const IconCloud = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 11a3.5 3.5 0 0 1 .5 7H7z" />
  </Icon>
);
export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12l5 5L20 7" />
  </Icon>
);
export const IconPin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </Icon>
);
export const IconBookmark = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3h12v18l-6-4-6 4z" />
  </Icon>
);

export function BrandMark({
  className = 'h-7 w-7',
  dark = false,
}: {
  className?: string;
  dark?: boolean;
}) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" className={`shrink-0 ${className}`}>
      <rect width="32" height="32" rx="5" fill={dark ? '#f2b300' : '#00704f'} />
      <path
        d="M6 22h20M8 22V12h16v10M12 12V9h8v3"
        stroke={dark ? '#1e2629' : '#ffffff'}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const COMPONENT_ICON_STYLES: Record<ComponentType, string> = {
  FUEL: 'bg-mint-soft text-mint-deep',
  ROAD_USAGE: 'bg-amber-soft text-amber',
  PARKING: 'bg-parking-soft text-parking',
};

export function ComponentIcon({ type }: { type: ComponentType }) {
  const Glyph = type === 'FUEL' ? IconFuel : type === 'ROAD_USAGE' ? IconGantry : IconParking;
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-[10px] ${COMPONENT_ICON_STYLES[type]}`}
    >
      <Glyph className="h-4.5 w-4.5" />
    </span>
  );
}
