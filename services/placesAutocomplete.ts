/**
 * placesAutocomplete.ts
 *
 * Google Places autocomplete + place details.
 *
 * Supports both addresses and business/POI names (Feature 6):
 *   - Restaurants, bars, hotels, landmarks, etc.
 *   - Display format: "Café XYZ — Copacabana"
 */

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

const BASE_AUTOCOMPLETE = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const BASE_DETAILS      = 'https://maps.googleapis.com/maps/api/place/details/json';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlaceSuggestion {
  place_id:       string;
  description:    string;
  /** Business name or street name — shown as the primary line */
  main_text:      string;
  /** Neighbourhood / city — shown as the secondary line */
  secondary_text: string;
  /** true when this is a POI/business rather than a pure address */
  isEstablishment: boolean;
}

export interface PlaceDetails {
  lat:               number;
  lng:               number;
  formatted_address: string;
  /** Business or POI name, if available */
  name?:             string;
}

// ── Autocomplete ──────────────────────────────────────────────────────────────

/**
 * Fetch up to 5 place suggestions for a partial input string.
 *
 * Searches both addresses and establishments (restaurants, bars, hotels,
 * landmarks, etc.) within Brazil. Returns an empty array on error.
 *
 * @param input        Raw user input (minimum 2 characters)
 * @param sessionToken Billing session token (persist across one search session)
 */
export async function fetchAutocompleteSuggestions(
  input: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  if (!GOOGLE_KEY || input.trim().length < 2) return [];

  // Omitting `types` returns both addresses and establishments.
  // The API returns a well-ranked mix: POIs first when the query looks like a
  // business name, addresses first when it looks like a street.
  const params = new URLSearchParams({
    input:        input.trim(),
    key:          GOOGLE_KEY,
    language:     'pt-BR',
    components:   'country:br',
    sessiontoken: sessionToken,
  });

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 6000);

  try {
    const res  = await fetch(`${BASE_AUTOCOMPLETE}?${params}`, { signal: controller.signal });
    const data = await res.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn('[Autocomplete] API status:', data.status);
      return [];
    }

    return (data.predictions ?? []).slice(0, 5).map((p: any): PlaceSuggestion => {
      const types: string[] = p.types ?? [];
      const isEstablishment = types.includes('establishment') || types.includes('point_of_interest');

      return {
        place_id:        p.place_id,
        description:     p.description,
        main_text:       p.structured_formatting?.main_text      ?? p.description,
        secondary_text:  p.structured_formatting?.secondary_text ?? '',
        isEstablishment,
      };
    });
  } catch (err) {
    console.warn('[Autocomplete] fetch error:', err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── Place Details ─────────────────────────────────────────────────────────────

/**
 * Resolve a place_id to its coordinates, address, and optional name.
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
    fields:       'geometry,formatted_address,name',
    key:          GOOGLE_KEY,
    sessiontoken: sessionToken,
  });

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), 6000);

  try {
    const res  = await fetch(`${BASE_DETAILS}?${params}`, { signal: controller.signal });
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
      name:              data.result.name ?? undefined,
    };
  } catch (err) {
    console.warn('[Place Details] fetch error:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
