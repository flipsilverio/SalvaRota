import MapLibreGL from '@maplibre/maplibre-react-native';

interface Props {
  /** [lng, lat][] — GeoJSON coordinate order */
  coordinates: [number, number][];
}

const LINE_STYLE = {
  lineColor:  '#4A90D9',
  lineWidth:  5,
  lineJoin:   'round'  as const,
  lineCap:    'round'  as const,
  lineOpacity: 0.9,
};

const BORDER_STYLE = {
  lineColor:  '#fff',
  lineWidth:  8,
  lineJoin:   'round' as const,
  lineCap:    'round' as const,
  lineOpacity: 0.4,
};

export default function RouteLayer({ coordinates }: Props) {
  // Always keep ShapeSource/LineLayer mounted — unmounting native MapLibre
  // layers while the map still holds references causes a crash on New Architecture.
  // Use an empty FeatureCollection when there is no route yet.
  const shape = {
    type:     'FeatureCollection' as const,
    features: coordinates.length >= 2 ? [{
      type:       'Feature' as const,
      geometry:   { type: 'LineString' as const, coordinates },
      properties: {},
    }] : [],
  };

  return (
    <>
      {/* White border underneath for contrast against dark map tiles */}
      <MapLibreGL.ShapeSource id="route-border-source" shape={shape}>
        <MapLibreGL.LineLayer
          id="route-border"
          style={BORDER_STYLE}
          belowLayerID="route-line"
        />
      </MapLibreGL.ShapeSource>

      {/* Main route line */}
      <MapLibreGL.ShapeSource id="route-source" shape={shape}>
        <MapLibreGL.LineLayer id="route-line" style={LINE_STYLE} />
      </MapLibreGL.ShapeSource>
    </>
  );
}
