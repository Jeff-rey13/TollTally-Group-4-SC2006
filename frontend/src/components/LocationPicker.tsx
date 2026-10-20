import { useEffect, useId, useRef, useState } from 'react';
import type { LocationDto, LocationRef } from '@tolltally/shared';
import { describeError } from '../api/client';
import { locationsApi } from '../api/endpoints';
import { IconPin } from './icons';

interface Props {
  id: string;
  label: string;
  value: LocationRef | null;
  onChange: (value: LocationRef | null) => void;
  error?: string;
  marker?: 'origin' | 'destination';
}

/**
 * Search-as-you-type picker that only accepts Singapore places chosen from the results (FR-SET-06).
 */
export function LocationPicker({ id, label, value, onChange, error, marker }: Props) {
  const [query, setQuery] = useState(value?.name ?? '');
  const [results, setResults] = useState<LocationDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const listId = useId();
  const latestRequest = useRef(0);

  useEffect(() => {
    const request = ++latestRequest.current;
    if (value && query === value.name) return;
    if (query.trim().length < 2) {
      latestRequest.current += 1;
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setResults([]);
    setSearchError(null);
    setSearching(true);
    const handle = setTimeout(() => {
      locationsApi
        .search(query.trim())
        .then((res) => {
          if (request !== latestRequest.current) return;
          setResults(res.results);
          setSearchError(null);
        })
        .catch((err: unknown) => {
          if (request !== latestRequest.current) return;
          setResults([]);
          setSearchError(describeError(err).message);
        })
        .finally(() => {
          if (request === latestRequest.current) setSearching(false);
        });
    }, 300);
    return () => {
      clearTimeout(handle);
      latestRequest.current += 1;
    };
  }, [query, value]);

  useEffect(() => {
    return () => {
      latestRequest.current += 1;
    };
  }, []);

  const showList = !value && results.length > 0;
  const noMatches =
    !value && !searching && !searchError && query.trim().length >= 2 && results.length === 0;

  return (
    <div>
      <label htmlFor={id} className="label flex items-center gap-2">
        {marker && (
          <span
            aria-hidden="true"
            className={`h-3 w-3 rounded-full ${marker === 'origin' ? 'border-[3px] border-ink bg-white' : 'bg-mint-deep'}`}
          />
        )}
        {label}
      </label>
      <input
        id={id}
        className="input"
        value={query}
        placeholder="Type a place, road or postal code in Singapore"
        autoComplete="off"
        aria-controls={listId}
        aria-expanded={showList}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : `${id}-status`}
        onChange={(e) => {
          setQuery(e.target.value);
          if (value) onChange(null);
        }}
      />
      <p
        className={`hint ${value ? 'font-semibold text-mint-deep' : ''}`}
        id={`${id}-status`}
        role="status"
      >
        {value ? (
          <>Selected: {value.name}</>
        ) : searching ? (
          'Searching…'
        ) : showList ? (
          `${results.length} match${results.length === 1 ? '' : 'es'}. Choose one from the list below.`
        ) : noMatches ? (
          'No Singapore location matched that search.'
        ) : (
          'Choose a match from the list below.'
        )}
      </p>
      {searchError && <p className="field-error">{searchError}</p>}
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      {showList && (
        <ul
          id={listId}
          className="mt-2 grid max-h-64 gap-1 overflow-auto rounded-control border border-line bg-tool p-1.5"
          aria-label={`${label} matches`}
        >
          {results.map((r) => (
            <li key={`${r.name}-${r.lat}-${r.lng}`}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center gap-3 rounded-[10px] bg-white px-3 py-2 text-left text-sm shadow-[0_1px_2px_rgb(21_33_29/0.08)] hover:bg-mint-soft focus:bg-mint-soft focus:outline-none focus-visible:ring-4 focus-visible:ring-mint-deep/30"
                onClick={() => {
                  latestRequest.current += 1;
                  onChange({ name: r.name, lat: r.lat, lng: r.lng });
                  setQuery(r.name);
                  setResults([]);
                }}
              >
                <IconPin className="h-5 w-5 text-mint-deep" />
                <span className="min-w-0">
                  <span className="block font-bold">{r.name}</span>
                  {r.address && <span className="block text-xs text-muted">{r.address}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
