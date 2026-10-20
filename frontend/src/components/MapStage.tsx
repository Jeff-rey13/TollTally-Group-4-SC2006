import type { ReactNode } from 'react';

export function MapStage({ map, children }: { map: ReactNode; children: ReactNode }) {
  return (
    <div className="map-stage">
      <div className="map-stage__map">{map}</div>
      <div className="map-stage__content">
        <div className="map-stage__inner">{children}</div>
      </div>
    </div>
  );
}

export function StagePanel({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <section data-stage-panel aria-labelledby={labelledBy} className="stage-panel">
      {children}
    </section>
  );
}
