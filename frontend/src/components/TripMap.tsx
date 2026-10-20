import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CrossingDto, LegDto, LocationRef } from '@tolltally/shared';
import { formatTime } from '../lib/format';

const TILES = 'https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png';
const ATTRIBUTION =
  '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" style="height:16px;width:16px;display:inline;vertical-align:-3px"/>&nbsp;' +
  '<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&#124;&nbsp;' +
  '<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener">Singapore Land Authority</a>';
const SINGAPORE = L.latLngBounds([1.144, 103.535], [1.494, 104.1]);

const gantryIcon = L.divIcon({
  className: '',
  html: '<span class="tt-gantry">ERP</span>',
  iconSize: [34, 20],
  iconAnchor: [17, 10],
});

const incidentIcon = L.divIcon({
  className: '',
  html: '<span class="tt-incident">!</span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function pinIcon(label: string, color: string) {
  return L.divIcon({
    className: '',
    html: `<span class="tt-pin" style="background:${color}"><span>${label}</span></span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 36],
  });
}

function crossingLabel(c: CrossingDto) {
  if (c.isExcluded) return `${c.chargePointName} · not priced`;
  return `${c.chargePointName} · SGD ${c.charge} at ${formatTime(c.estimatedCrossingTime)}`;
}

function tooltipText(text: string) {
  const span = document.createElement('span');
  span.textContent = text;
  return span;
}

function addPin(layer: L.LayerGroup, point: L.LatLng, label: string, color: string, name?: string) {
  const marker = L.marker(point, { icon: pinIcon(label, color), keyboard: false });
  if (name) marker.bindTooltip(tooltipText(name), { direction: 'top', offset: [0, -34] });
  marker.addTo(layer);
}

function getPadding(): L.FitBoundsOptions {
  return { padding: [40, 40] };
}

interface Props {
  leg?: LegDto | null;
  origin?: LocationRef | null;
  destination?: LocationRef | null;
  label: string;
  /** Live traffic incidents on the route, drawn as warning markers. */
  incidents?: { lat: number; lng: number; type: string; message: string }[];
}

/**
 * Draws a leg's route and the ERP gantries it is charged for on a OneMap base map.
 */
export function TripMap({ leg, origin, destination, label, incidents }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hasFitted = useRef(false);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = L.map(container, {
      scrollWheelZoom: false,
      zoomSnap: 0.25,
      maxBounds: SINGAPORE.pad(0.1),
      minZoom: 11,
      maxZoom: 19,
      zoomControl: false,
    });
    map.attributionControl.setPrefix(false);
    L.control.zoom({ position: 'topright' }).addTo(map);
    L.tileLayer(TILES, {
      minZoom: 11,
      maxZoom: 19,
      detectRetina: true,
      attribution: ATTRIBUTION,
    }).addTo(map);
    map.fitBounds(SINGAPORE);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => {
      observer.disconnect();
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    const container = containerRef.current;
    if (!map || !layer || !container) return;
    layer.clearLayers();
    let points: L.LatLng[] = [];

    if (leg && leg.geometry.length >= 2) {
      points = leg.geometry.map((p) => L.latLng(p.lat, p.lng));
      L.polyline(points, { color: 'white', weight: 11, interactive: false }).addTo(layer);
      L.polyline(points, { color: '#00704f', weight: 6, interactive: false }).addTo(layer);
      const crossings = leg.components.find((c) => c.type === 'ROAD_USAGE')?.crossings ?? [];
      for (const c of crossings) {
        if (c.lat === undefined || c.lng === undefined) continue;
        L.marker([c.lat, c.lng], { icon: gantryIcon, keyboard: false })
          .bindTooltip(tooltipText(crossingLabel(c)), { direction: 'top', offset: [0, -10] })
          .addTo(layer);
      }
      for (const i of incidents ?? []) {
        L.marker([i.lat, i.lng], { icon: incidentIcon, keyboard: false, zIndexOffset: 1000 })
          .bindTooltip(tooltipText(`${i.type}: ${i.message}`), {
            direction: 'top',
            offset: [0, -12],
          })
          .addTo(layer);
      }
      addPin(layer, points[0], 'A', '#1e2629', origin?.name);
      addPin(layer, points[points.length - 1], 'B', '#00704f', destination?.name);
    } else {
      if (origin) {
        const point = L.latLng(origin.lat, origin.lng);
        addPin(layer, point, 'A', '#1e2629', origin.name);
        points.push(point);
      }
      if (destination) {
        const point = L.latLng(destination.lat, destination.lng);
        addPin(layer, point, 'B', '#00704f', destination.name);
        points.push(point);
      }
    }

    const bounds = points.length > 0 ? L.latLngBounds(points) : SINGAPORE;
    const options = { ...getPadding(), maxZoom: points.length === 1 ? 14 : 16 };
    // Glide to the new trip when the person changes it; jump straight there on first load
    // or when they have asked for reduced motion.
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (points.length > 0 && !reduceMotion && hasFitted.current) {
      map.flyToBounds(bounds, { ...options, duration: 0.7, easeLinearity: 0.3 });
    } else {
      map.fitBounds(bounds, { ...options, animate: false });
    }
    if (points.length > 0) hasFitted.current = true;
  }, [leg, origin, destination, incidents]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={label}
      className="tt-map absolute inset-0 h-full w-full"
    />
  );
}
