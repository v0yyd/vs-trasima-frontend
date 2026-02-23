"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type VehicleState = {
  id: number;
  lat: number;
  lon: number;
  speed: number;
  direction: number;
};

type LeafletMarker = {
  setLatLng: (latLng: [number, number]) => void;
  addTo: (map: unknown) => void;
  remove: () => void;
  bindPopup: (html: string) => void;
  setPopupContent: (html: string) => void;
  setIcon: (icon: unknown) => void;
  on: (event: string, handler: () => void) => void;
};

type LeafletMap = {
  remove: () => void;
  fitBounds: (bounds: unknown, opts?: { padding?: [number, number] }) => void;
  setView: (center: [number, number], zoom: number) => void;
};

function isVehicleStateArray(value: unknown): value is VehicleState[] {
  if (!Array.isArray(value)) return false;
  return value.every((v) => {
    if (typeof v !== "object" || v === null) return false;
    const maybe = v as Partial<Record<keyof VehicleState, unknown>>;
    return (
      typeof maybe.id === "number" &&
      typeof maybe.lat === "number" &&
      typeof maybe.lon === "number" &&
      typeof maybe.speed === "number" &&
      typeof maybe.direction === "number"
    );
  });
}

function vehiclePopupHtml(v: VehicleState) {
  const lat = v.lat.toFixed(6);
  const lon = v.lon.toFixed(6);
  return `
    <div style="min-width: 220px">
      <div style="font-weight: 600; margin-bottom: 6px">Vehicle #${v.id}</div>
      <div><b>Speed</b>: ${v.speed.toFixed(2)}</div>
      <div><b>Direction</b>: ${v.direction.toFixed(1)}°</div>
      <div><b>Position</b>: ${lat}, ${lon}</div>
    </div>
  `;
}

function vehicleDivIcon(L: any, v: VehicleState) {
  const size = 28;
  const html = `
    <div class="vehicle-icon" style="--rot:${v.direction}deg" aria-label="Vehicle ${v.id}">
      <svg viewBox="0 0 24 24" role="img" focusable="false">
        <path d="M12 2l6.5 20-6.5-4-6.5 4L12 2z"></path>
      </svg>
    </div>
  `;

  return L.divIcon({
    className: "vehicle-marker",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

async function waitForLeaflet(timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const L = (globalThis as any).L as any;
    if (L?.map && L?.tileLayer && L?.marker) return L;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

export default function VehiclesMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<number, LeafletMarker>>(new Map());
  const firstFitDoneRef = useRef(false);
  const selectedIdRef = useRef<number | null>(null);

  const [selected, setSelected] = useState<VehicleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [vehicleCount, setVehicleCount] = useState<number>(0);

  const details = useMemo(() => {
    if (!selected) return null;
    return {
      id: selected.id,
      lat: selected.lat.toFixed(6),
      lon: selected.lon.toFixed(6),
      speed: selected.speed.toFixed(2),
      direction: `${selected.direction.toFixed(1)}°`,
    };
  }, [selected]);

  useEffect(() => {
    selectedIdRef.current = selected?.id ?? null;
  }, [selected]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!containerRef.current || mapRef.current) return;

      const L = await waitForLeaflet(4000);
      if (!L) {
        setError("Leaflet konnte nicht geladen werden (keine Internetverbindung?).");
        return;
      }
      if (cancelled) return;

      const map = L.map(containerRef.current).setView([48.0, 9.0], 12) as LeafletMap;
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let interval: number | null = null;
    const abortController = new AbortController();

    async function refresh() {
      try {
        const res = await fetch("/api/trasima/vehicles", {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const payload: unknown = await res.json();
        if (!isVehicleStateArray(payload)) {
          throw new Error("Unerwartetes JSON-Format vom Server.");
        }

        setError(null);
        setLastUpdated(new Date());
        setVehicleCount(payload.length);

        const map = mapRef.current;
        const L = (globalThis as any).L as any;
        if (!map || !L) return;

        const seen = new Set<number>();
        for (const v of payload) {
          seen.add(v.id);

          const existing = markersRef.current.get(v.id);
          if (existing) {
            existing.setLatLng([v.lat, v.lon]);
            existing.setPopupContent(vehiclePopupHtml(v));
            existing.setIcon(vehicleDivIcon(L, v));
            if (selectedIdRef.current === v.id) setSelected(v);
            continue;
          }

          const marker = L.marker([v.lat, v.lon], { icon: vehicleDivIcon(L, v) }) as LeafletMarker;
          marker.bindPopup(vehiclePopupHtml(v));
          marker.on("click", () => setSelected(v));
          marker.addTo(map);
          markersRef.current.set(v.id, marker);
        }

        for (const [id, marker] of markersRef.current.entries()) {
          if (!seen.has(id)) {
            marker.remove();
            markersRef.current.delete(id);
            if (selectedIdRef.current === id) setSelected(null);
          }
        }

        if (!firstFitDoneRef.current && payload.length > 0) {
          const bounds = L.latLngBounds(payload.map((v) => [v.lat, v.lon]));
          map.fitBounds(bounds, { padding: [24, 24] });
          firstFitDoneRef.current = true;
        }
      } catch (e) {
        if (abortController.signal.aborted) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(
          `Server nicht erreichbar oder Fehler beim Laden. (${message}) — erneuter Versuch in 5 Sekunden.`,
        );
      }
    }

    void refresh();
    interval = window.setInterval(() => void refresh(), 5000);

    return () => {
      abortController.abort();
      if (interval !== null) window.clearInterval(interval);
      interval = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="flex h-screen w-full flex-col">
      <header className="flex flex-col gap-1 border-b border-black/10 bg-white px-4 py-3 dark:border-white/10 dark:bg-black">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-lg font-semibold">Trasima Vehicles</h1>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            {vehicleCount} Fahrzeuge{lastUpdated ? ` • ${lastUpdated.toLocaleTimeString()}` : ""}
          </div>
        </div>
        {error ? (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Datenquelle: <code className="rounded bg-black/5 px-1 dark:bg-white/10">/api/trasima/vehicles</code>
          </div>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div ref={containerRef} className="h-full min-h-0 flex-1" />

        <aside className="hidden w-80 shrink-0 border-l border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black md:block">
          <div className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Fahrzeugdetails
          </div>
          {details ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-zinc-500 dark:text-zinc-400">ID</dt>
              <dd className="text-right">{details.id}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Speed</dt>
              <dd className="text-right">{details.speed}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Direction</dt>
              <dd className="text-right">{details.direction}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Lat</dt>
              <dd className="text-right">{details.lat}</dd>
              <dt className="text-zinc-500 dark:text-zinc-400">Lon</dt>
              <dd className="text-right">{details.lon}</dd>
            </dl>
          ) : (
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Marker anklicken, um Details zu sehen.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
