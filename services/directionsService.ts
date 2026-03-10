const GOOGLE_KEY     = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const BASE_DIRECTIONS = 'https://maps.googleapis.com/maps/api/directions/json';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** [lng, lat][] ordered for GeoJSON / MapLibre */
  coordinates: [number, number][];
  bounds: {
    ne: [number, number]; // [lng, lat]
    sw: [number, number]; // [lng, lat]
  };
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

// ── API call ──────────────────────────────────────────────────────────────────

/**
 * Fetch a walking route between two coordinates using Google Directions API.
 * Returns the decoded polyline and bounding box, or null on error.
 */
export async function fetchWalkingRoute(
  origin:      LatLng,
  destination: LatLng,
): Promise<RouteResult | null> {
  if (!GOOGLE_KEY) {
    console.warn('[Directions] EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is not set');
    return null;
  }

  const params = new URLSearchParams({
    origin:      `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    mode:        'walking',
    language:    'pt-BR',
    key:         GOOGLE_KEY,
  });

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 10_000);

  try {
    const res  = await fetch(`${BASE_DIRECTIONS}?${params}`, { signal: controller.signal });
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes?.length) {
      console.warn('[Directions] API status:', data.status);
      return null;
    }

    const route = data.routes[0];
    const b     = route.bounds;

    return {
      coordinates: decodePolyline(route.overview_polyline.points),
      bounds: {
        ne: [b.northeast.lng, b.northeast.lat],
        sw: [b.southwest.lng, b.southwest.lat],
      },
    };
  } catch (err) {
    console.warn('[Directions] fetch error:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
