// Sea settings shared by the debug panel and, later, the ported ocean.
// Names match the URL knobs on the current page (windSpeed, sunElev, …).

export const SEA_DEFAULTS = {
  windSpeed: 7.0,
  windDir: 118,
  fetchKm: 90,
  swellHs: 1.8,
  swellDir: 94,
  swellLength: 120,
  swellSpread: 48,
  choppy: 1.25,
  turbidity: 1.6,
  foam: 1.0,
  sunElev: 2.6,
  sunAzim: 4,
  exposure: 1.35,
  haze: 3.0,
  clouds: 0.40,
  veil: 0.36,
  bloom: 0.10,
} as const;

export type SeaKey = keyof typeof SEA_DEFAULTS;
export type SeaParams = { [K in SeaKey]: number };

export const SEA_SLIDERS: readonly { key: SeaKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'windSpeed', label: 'Wind speed (m/s)', min: 2, max: 20, step: 0.1 },
  { key: 'windDir', label: 'Wind direction (deg)', min: 0, max: 360, step: 1 },
  { key: 'fetchKm', label: 'Fetch (km)', min: 5, max: 800, step: 1 },
  { key: 'swellHs', label: 'Swell height (m)', min: 0, max: 4, step: 0.05 },
  { key: 'swellLength', label: 'Swell wavelength (m)', min: 30, max: 300, step: 1 },
  { key: 'swellDir', label: 'Swell direction (deg)', min: 0, max: 360, step: 1 },
  { key: 'choppy', label: 'Choppiness', min: 0, max: 1.6, step: 0.01 },
  { key: 'turbidity', label: 'Water turbidity', min: 0.2, max: 3, step: 0.01 },
  { key: 'foam', label: 'Foam', min: 0, max: 3, step: 0.01 },
  { key: 'sunElev', label: 'Sun elevation (deg)', min: -2, max: 60, step: 0.1 },
  { key: 'sunAzim', label: 'Sun azimuth (deg)', min: -180, max: 180, step: 0.5 },
  { key: 'haze', label: 'Haze', min: 0.5, max: 15, step: 0.1 },
  { key: 'clouds', label: 'Low clouds', min: 0, max: 1, step: 0.01 },
  { key: 'veil', label: 'Cloud deck', min: 0, max: 1, step: 0.01 },
  { key: 'exposure', label: 'Exposure', min: 0.1, max: 4, step: 0.01 },
  { key: 'bloom', label: 'Bloom', min: 0, max: 0.3, step: 0.001 },
];

export function defaultSea(): SeaParams {
  return { ...SEA_DEFAULTS };
}

function finite(value: string | null): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Query overrides sit on top of the defaults. A missing or non-numeric value leaves the default.
export function seaFromSearch(search: string): SeaParams {
  const qs = new URLSearchParams(search);
  const sea = defaultSea();
  for (const key of Object.keys(sea) as SeaKey[]) {
    const n = finite(qs.get(key));
    if (n != null) sea[key] = n;
  }
  return sea;
}

export type Launch = {
  sea: SeaParams;
  ui: boolean;
  seed: string | null;
  test: boolean;
};

export function launchFromSearch(search: string): Launch {
  const qs = new URLSearchParams(search);
  return {
    sea: seaFromSearch(search),
    ui: qs.get('ui') !== '0',
    seed: qs.get('seed'),
    test: qs.get('test') === '1',
  };
}
