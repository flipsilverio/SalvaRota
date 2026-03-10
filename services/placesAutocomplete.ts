const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

const BASE_AUTOCOMPLETE = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const BASE_DETAILS      = 'https://maps.googleapis.com/maps/api/place/details/json';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlaceSuggestion {
  place_id:       string;
  description:    string;
  main_text:      string;   // e.g. "Av. Atlântica"
  secondary_text: string;   // e.g. "Rio de Janeiro, RJ, Brasil"
}

export interface PlaceDetails {
  lat:               number;
  lng:               number;
  formatted_address: string;
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

/**
 * Fetch up to 5 place suggestions for a partial address string.
 * Returns an empty array on error so the caller never crashes.
 *
 * @param input        Raw user input
 * @param sessionToken Billing session token (should persist across one search session)
 */
export async function fetchAutocompleteSuggestions(
  input: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  if (!GOOGLE_KEY || input.trim().length < 2) return [];

  const params = new URLSearchParams({
    input:        input.trim(),
    key:          GOOGLE_KEY,
    language:     'pt-BR',
    components:   'country:br',
    sessiontoken: sessionToken,
    types:        'geocode|establishment',
  });

  try {
    const res  = await fetch(`${BASE_AUTOCOMPLETE}?${params}`, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn('[Autocomplete] API status:', data.status);
      return [];
    }

    return (data.predictions ?? []).slice(0, 5).map((p: any): PlaceSuggestion => ({
      place_id:       p.place_id,
      description:    p.description,
      main_text:      p.structured_formatting?.main_text      ?? p.description,
      secondary_text: p.structured_formatting?.secondary_text ?? '',
    }));
  } catch (err) {
    console.warn('[Autocomplete] fetch error:', err);
    return [];
  }
}

// ── Place Details ─────────────────────────────────────────────────────────────

/**
 * Resolve a place_id to its coordinates and formatted address.
 * Ends the billing session — pass the same sessionToken used during autocomplete.
 *
 * @param placeId      Place ID from a suggestion
 * @param sessionToken Same token used during the autocomplete session
 */
export async function fetchPlaceDetails(
  placeId:      string,
  sessionToken: string,
): Promise<PlaceDetails | null> {
  if (!GOOGLE_KEY) return null;

  const params = new URLSearchParams({
    place_id:     placeId,
    fields:       'geometry,formatted_address',
    key:          GOOGLE_KEY,
    sessiontoken: sessionToken,
  });

  try {
    const res  = await fetch(`${BASE_DETAILS}?${params}`, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();

    if (data.status !== 'OK') {
      console.warn('[Place Details] API status:', data.status);
      return null;
    }

    const loc = data.result?.geometry?.location;
    if (!loc) return null;

    return {
      lat:               loc.lat,
      lng:               loc.lng,
      formatted_address: data.result.formatted_address,
    };
  } catch (err) {
    console.warn('[Place Details] fetch error:', err);
    return null;
  }
}
