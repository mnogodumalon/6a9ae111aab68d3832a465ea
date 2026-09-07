import { useEffect, useRef, useState } from 'react';

// Leaflet kommt GEBÜNDELT aus node_modules (im E2B-Template installiert):
// dynamic import → eigener Lazy-Chunk, der nur lädt, wenn wirklich eine Karte
// mountet. Vite dedupliziert das Modul mit dem MapWidget — beide teilen sich
// denselben Chunk und dasselbe L. Kein Runtime-Load von my.living-apps.de mehr.
let L: any;
let leafletPromise: Promise<void> | null = null;

function loadLeaflet(): Promise<void> {
  if (!leafletPromise) {
    leafletPromise = (async () => {
      await import('leaflet/dist/leaflet.css');
      const mod: any = await import('leaflet');
      L = mod.default ?? mod;
      (window as any).L = L; // UMD-Plugins/Alt-Konsumenten erwarten das Global
    })().catch(err => { leafletPromise = null; throw err; });
  }
  return leafletPromise;
}

interface GeoMapPickerProps {
  lat: number;
  lng: number;
  onChange?: (lat: number, lng: number) => void;
  readOnly?: boolean;
}

// Dashboard-styled zoom control — IDENTICAL to MapWidget's, so the +/- buttons
// match across the form picker and the display map. Leaflet renders its control
// as its OWN DOM (not React), so it can't take Tailwind classes directly; these
// `[&_.leaflet-*]:!…` arbitrary variants on the container beat its stylesheet.
const ZOOM_CONTROL_CLASSES = [
  '[&_.leaflet-control-zoom]:!m-3',
  '[&_.leaflet-control-zoom]:!rounded-xl',
  '[&_.leaflet-control-zoom]:!border-0',
  '[&_.leaflet-control-zoom]:!overflow-hidden',
  '[&_.leaflet-control-zoom]:!shadow-lg',
  '[&_.leaflet-control-zoom]:!ring-1',
  '[&_.leaflet-control-zoom]:!ring-black/5',
  '[&_.leaflet-bar_a]:!h-9',
  '[&_.leaflet-bar_a]:!w-9',
  '[&_.leaflet-bar_a]:!leading-9',
  '[&_.leaflet-bar_a]:!text-lg',
  '[&_.leaflet-bar_a]:!font-medium',
  '[&_.leaflet-bar_a]:!bg-card',
  '[&_.leaflet-bar_a]:!text-foreground',
  '[&_.leaflet-bar_a]:!border-border',
  '[&_.leaflet-bar_a:hover]:!bg-secondary',
  '[&_.leaflet-bar_a:hover]:!text-primary',
  '[&_.leaflet-bar_a.leaflet-disabled]:!bg-muted',
  '[&_.leaflet-bar_a.leaflet-disabled]:!text-muted-foreground/40',
].join(' ');

export function GeoMapPicker({ lat, lng, onChange, readOnly }: GeoMapPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const propsRef = useRef({ lat, lng, onChange });
  propsRef.current = { lat, lng, onChange };
  const [ready, setReady] = useState(typeof L !== 'undefined');

  useEffect(() => {
    if (!ready) { loadLeaflet().then(() => setReady(true)).catch(() => {}); }
  }, [ready]);

  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 16,
      zoomControl: !readOnly,
      dragging: !readOnly,
      scrollWheelZoom: !readOnly,
      doubleClickZoom: !readOnly,
      touchZoom: !readOnly,
      boxZoom: !readOnly,
      keyboard: !readOnly,
    });

    if (!readOnly) {
      L.control.zoom({ position: 'bottomright' }).addTo(map);
    }

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '\u00a9 <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    if (!readOnly) {
      map.on('moveend', () => {
        const c = map.getCenter();
        propsRef.current.onChange?.(c.lat, c.lng);
      });
    }

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 200);

    return () => { map.remove(); mapRef.current = null; };
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (Math.abs(c.lat - lat) > 0.00005 || Math.abs(c.lng - lng) > 0.00005) {
      map.setView([lat, lng], map.getZoom(), { animate: true });
    }
  }, [lat, lng]);

  return (
    // `isolate`: keep Leaflet's internal z-indexes (panes/controls up to 1000,
    // plus the centre-pin overlay below) inside this picker's own stacking
    // context, so they never leak past the app's --z-* token ladder (max 100).
    // Same fix as MapWidget — any Leaflet consumer needs it.
    <div className={`relative rounded-lg overflow-hidden border isolate ${ZOOM_CONTROL_CLASSES}`} style={{ height: 200 }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      {/* Fixed centre pin — the map moves under it; its TIP marks the chosen
          point. Positioned by translate (tip at the EXACT centre) instead of
          flex + marginBottom, which mis-placed it when the box was short. The
          translate also gives the pin its OWN compositing layer, so iOS Safari
          paints it ABOVE Leaflet's translate3d map layer — a plain z-index tie
          (both at 1000) left it INVISIBLE there. z-[1200] beats Leaflet's panes/
          controls (≤1000) and stays scoped by `isolate`, so it never escapes. */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 z-[1200]"
        style={{ transform: 'translate(-50%, -100%)' }}
      >
        <svg width="28" height="40" viewBox="0 0 28 40" className="block drop-shadow-md">
          <path
            d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.27 21.73 0 14 0z"
            fill="#ef4444"
          />
          <circle cx="14" cy="14" r="5" fill="white" />
        </svg>
      </div>
    </div>
  );
}
