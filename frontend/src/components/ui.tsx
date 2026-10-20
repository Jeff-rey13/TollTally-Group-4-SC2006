import {
  cloneElement,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { sgd } from '../lib/format';
import { IconArrowLeft, IconCheck, IconInfo, IconWarning } from './icons';
import { MapBackdrop } from './MapBackdrop';

export function Page({
  width = 'wide',
  children,
}: {
  width?: 'narrow' | 'medium' | 'wide';
  children: ReactNode;
}) {
  return (
    <div className="page">
      <div className="page__band">
        <MapBackdrop />
      </div>
      <div className={`page__body page__body--${width}`}>{children}</div>
    </div>
  );
}

export function PageHeader({
  title,
  lede,
  actions,
  back,
}: {
  title: string;
  lede?: string;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          to={back.to}
          className="mb-3 inline-flex min-h-11 items-center gap-2 pr-2 text-[15px] font-bold text-ink hover:text-mint-deep"
        >
          <IconArrowLeft className="h-4.5 w-4.5" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-[2.25rem] leading-[1] font-black sm:text-[3rem]">{title}</h1>
          {lede && (
            <p className="mt-2 text-[15px] leading-relaxed wrap-anywhere text-muted">{lede}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  let describedBy: string | undefined;
  if (error) describedBy = `${id}-error`;
  else if (hint) describedBy = `${id}-hint`;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })
    : children;

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {control}
      {hint && !error && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function MoneyInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-1 left-1 grid place-items-center rounded-[10px] bg-tool px-2.5 text-xs font-bold text-muted"
      >
        SGD
      </span>
      <input {...props} inputMode="decimal" className="input pl-[4.25rem] text-lg font-semibold" />
    </div>
  );
}

const ALERT_STYLES = {
  info: 'border-[#c9d8ef] bg-parking-soft text-[#173d7a]',
  warning: 'border-[#efd78f] bg-amber-soft text-[#5c3a00]',
  error: 'border-red-200 bg-red-50 text-red-900',
  success: 'border-[#bcdccb] bg-mint-soft text-mint-darker',
};

export function Alert({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'warning' | 'error' | 'success';
  children: ReactNode;
}) {
  const Glyph = kind === 'success' ? IconCheck : kind === 'info' ? IconInfo : IconWarning;
  return (
    <div
      className={`flex gap-3 rounded-control border border-l-4 px-4 py-3 text-[15px] leading-relaxed ${ALERT_STYLES[kind]}`}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <Glyph className="mt-0.5 h-4.5 w-4.5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Money({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  return <span className={className}>{sgd(value)}</span>;
}

export function Range({ lower, upper }: { lower: string | null; upper: string | null }) {
  if (lower === null || upper === null)
    return <span className="opacity-80">no complete range</span>;
  if (lower === upper) return <span>exact</span>;
  return (
    <span>
      {lower} to {upper}
    </span>
  );
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return (
    <p className="flex items-center gap-3 text-[15px] font-medium text-muted" role="status">
      <span aria-hidden="true" className="lane-loader" />
      {what}…
    </p>
  );
}

/** A grey placeholder block with a soft shimmer, shown while content loads. */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton block ${className}`} />;
}

/**
 * Placeholder rows shaped like the list that is loading, with the loading message for screen
 * readers and anyone who prefers text.
 */
export function SkeletonList({ what, rows = 3 }: { what: string; rows?: number }) {
  return (
    <div className="grid gap-3">
      <Loading what={what} />
      <div className="grid gap-3" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="card flex items-center gap-4">
            <Skeleton className="h-11 w-11 shrink-0" />
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="hidden h-6 w-20 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted">{body}</p>
      {action && (
        <Link to={action.to} className="btn-primary mt-5">
          {action.label}
        </Link>
      )}
    </div>
  );
}
