/**
 * RouteLayer.tsx
 *
 * Renders the walking route on the MapLibre map.
 * Supports per-segment safety coloring (Feature 9):
 *
 *   90–100 → green  (#5BAD6F)
 *   75–89  → yellow (#E8A838)
 *   60–74  → orange (#F5A623)
 *   0–59   → red    (#E05252)
 *
 * When no segment scores are provided, falls back to the overall route
 * color (or neutral blue if no score at all).
 *
 * Implementation note:
 *   ShapeSource/LineLayer pairs are always mounted even when there is no
 *   route. Unmounting native MapLibre layers while the map still holds
 *   references causes a crash on New Architecture. Empty FeatureCollections
 *   render nothing.
 */

import MapLibreGL from '@maplibre/maplibre-react-native';
import { scoreToColor } from '../services/safetyScoring';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RouteSegment {
  /** [lng, lat][] coordinates for this segment */
  coordinates: [number, number][];
  /** Safety score 0–100, used to pick line color */
  score:       number;
}

interface Props {
  /**
   * Full route polyline — used when no segments are provided,
   * or as fallback. [lng, lat][]
   */
  coordinates: [number, number][];
  /**
   * Optional per-segment data for color-coded rendering.
   * When provided, takes precedence over `coordinates`.
   */
  segments?:   RouteSegment[];
  /**
   * Overall route safety score (0–100).
   * Used to color the route when no per-segment data is available.
   * Defaults to neutral blue when omitted.
   */
  score?:      number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BLUE = '#4A90D9'; // default when no score

function buildSegmentedShape(segments: RouteSegment[]): GeoJSON.FeatureCollection {
  if (!segments.length) return emptyCollection();

  return {
    type: 'FeatureCollection',
    features: segments
      .filter(s => s.coordinates.length >= 2)
      .map((s, i): GeoJSON.Feature => ({
        type: 'Feature',
        id:   String(i),
        geometry: {
          type:        'LineString',
          coordinates: s.coordinates,
        },
        properties: {
          score: s.score,
          color: scoreToColor(s.score),
        },
      })),
  };
}

function buildSimpleShape(
  coords: [number, number][],
  color:  string,
): GeoJSON.FeatureCollection {
  if (coords.length < 2) return emptyCollection();

  return {
    type: 'FeatureCollection',
    features: [{
      type:     'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { color },
    }],
  };
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

// ── MapLibre expression for data-driven line color ───────────────────────────
// Reads the 'color' property from each GeoJSON feature.
const COLOR_EXPRESSION = ['get', 'color'] as any;

// ── Component ─────────────────────────────────────────────────────────────────

export default function RouteLayer({ coordinates, segments, score }: Props) {
  const hasSegments = segments && segments.length > 0;
  const routeColor  = score !== undefined ? scoreToColor(score) : BLUE;

  const shape = hasSegments
    ? buildSegmentedShape(segments)
    : buildSimpleShape(coordinates, routeColor);

  const borderShape = hasSegments
    ? buildSegmentedShape(segments)
    : buildSimpleShape(coordinates, routeColor);

  return (
    <>
      {/* White border layer — always below the colored line for contrast */}
      <MapLibreGL.ShapeSource id="route-border-source" shape={borderShape}>
        <MapLibreGL.LineLayer
          id="route-border"
          style={{
            lineColor:   '#fff',
            lineWidth:   8,
            lineJoin:    'round',
            lineCap:     'round',
            lineOpacity: 0.4,
          }}
          belowLayerID="route-line"
        />
      </MapLibreGL.ShapeSource>

      {/* Main route line — colored per segment when data is available */}
      <MapLibreGL.ShapeSource id="route-source" shape={shape}>
        <MapLibreGL.LineLayer
          id="route-line"
          style={{
            lineColor:   hasSegments ? COLOR_EXPRESSION : routeColor,
            lineWidth:   5,
            lineJoin:    'round',
            lineCap:     'round',
            lineOpacity: 0.9,
          }}
        />
      </MapLibreGL.ShapeSource>
    </>
  );
}
