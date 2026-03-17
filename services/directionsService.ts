/**
 * directionsService.ts
 *
 * Fetches walking routes from the Google Directions API.
 * Supports alternative routes (Feature 14) and exposes per-step
 * geometry for segment-level safety coloring (Feature 9).
 */

const GOOGLE_KEY      = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const BASE_DIRECTIONS = 'https://maps.googleapis.com/maps/api/directions/json';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * A single navigation step decoded from Google Directions.
 * Each step has its own polyline — used to split the route into
 * colorable segments when mapped against backend safety data.
 */
export interface RouteStep {
  /** [lng, lat][] — GeoJSON order */
  coordinates:    [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteResult {
  /** Full route polyline — [lng, lat][] */
  coordinates:     [number, number][];
  /** Per-step geometry for segment safety coloring */
  steps:           RouteStep[];
  bounds: {
    ne: [number, number]; // [lng, lat]
    sw: [number, number]; // [lng, lat]
  };
  /** Human-readable duration e.g. "18 min" */
  durationText:    string;
  /** Human-readable distance e.g. "1,4 km" */
  distanceText:    string;
  /** Total route duration in seconds */
  durationSeconds: number;
}

// ── Polyline decoder ──────────────────────────────────────────────────────────

function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let shift = 0, result = 0, b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0; result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lng / 1e5, lat / 1e5]); // GeoJSON is [lng, lat]
  }

  return coords;
}

// ── Parse a single Google route object ───────────────────────────────────────

function parseRoute(route: any): RouteResult {
  const leg = route.legs?.[0];
  const b   = route.bounds;

  // Full overview polyline
  const coordinates = decodePolyline(route.overview_polyline.points);

  // Per-step polylines for segment coloring
  const steps: RouteStep[] = (leg?.steps ?? []).map((step: any): RouteStep => ({
    coordinates:     decodePolyline(step.polyline.points),
    distanceMeters:  step.distance?.value  ?? 0,
    durationSeconds: step.duration?.value  ?? 0,
  }));

  return {
    coordinates,
    steps,
    bounds: {
      ne: [b.northeast.lng, b.northeast.lat],
      sw: [b.southwest.lng, b.southwest.lat],
    },
    durationText:    leg?.duration?.text    ?? '',
    distanceText:    leg?.distance?.text    ?? '',
    durationSeconds: leg?.duration?.value   ?? 0,
  };
}

// ── API call — multiple alternatives (Feature 14) ────────────────────────────

/**
 * Fetch up to 3 walking route alternatives from Google Directions.
 * Returns all routes so the caller can apply safety scoring to select the best.
 *
 * Returns an empty array on error — callers should handle gracefully.
 */
export async function fetchWalkingRoutes(
  origin:      LatLng,
  destination: LatLng,
): Promise<RouteResult[]> {
  if (!GOOGLE_KEY) {
    console.warn('[Directions] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set');
    return [];
  }

  const params = new URLSearchParams({
    origin:       `${origin.lat},${origin.lng}`,
    destination:  `${destination.lat},${destination.lng}`,
    mode:         'walking',
    alternatives: 'true',
    language:     'pt-BR',
    key:          GOOGLE_KEY,
  });

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 10_000);

  try {
    const res  = await fetch(`${BASE_DIRECTIONS}?${params}`, { signal: controller.signal });
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      console.warn('[Directions] API status:', data.status);
      return [];
    }

    return data.routes.map(parseRoute);
  } catch (err) {
    console.warn('[Directions] fetch error:', err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Convenience wrapper — returns the first (primary) route, or null on error.
 * Use fetchWalkingRoutes() when you need alternatives.
 */
export async function fetchWalkingRoute(
  origin:      LatLng,
  destination: LatLng,
): Promise<RouteResult | null> {
  const routes = await fetchWalkingRoutes(origin, destination);
  return routes[0] ?? null;
}
