import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import MapLibreGL, { CameraRef } from '@maplibre/maplibre-react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AddressSearch, { SelectedPlace } from '../../components/AddressSearch';

MapLibreGL.setAccessToken(null);

const IPANEMA_BEACH      = [-43.1873, -22.9868];
const MAPTILER_STYLE_URL = `https://api.maptiler.com/maps/019cd357-6ec6-7605-9d2c-637be3bc2c81/style.json?key=${process.env.EXPO_PUBLIC_MAPTILER_API_KEY}`;
const API_URL            = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const PANEL_BG    = '#FAEFE9';
const SCORE_AMBER = '#E8A838';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RouteMetrics {
  score:         number;
  crimeTotal:    number;   // sum of crime_incidents across all segments
  lightingAvg:   number;   // average lighting_score (0–100)
  businessesAvg: number;   // average open_businesses per segment
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getScoreStyle(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'Seguro',   color: '#5BAD6F' };
  if (score >= 40) return { label: 'Moderado', color: SCORE_AMBER };
  return              { label: 'Perigoso', color: '#E05252' };
}

function extractMetrics(data: any, recommendedId: number): RouteMetrics | null {
  const route = data.routes?.find((r: any) => r.route_id === recommendedId);
  if (!route || !route.segments?.length) return null;

  const segs  = route.segments as any[];
  const count = segs.length;
  const sum   = (key: string) => segs.reduce((acc: number, s: any) => acc + (s[key] ?? 0), 0);

  return {
    score:         Math.round(route.score),
    crimeTotal:    Math.round(sum('crime_incidents')),
    lightingAvg:   Math.round(sum('lighting_score')    / count),
    businessesAvg: Math.round(sum('open_businesses')   / count),
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const { top }        = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const cameraRef      = useRef<CameraRef>(null);

  const [following, setFollowing]           = useState(false);
  const [address, setAddress]               = useState('Localização atual');
  const [destination, setDestination]       = useState<SelectedPlace | null>(null);
  const [metrics, setMetrics]               = useState<RouteMetrics | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeError, setRouteError]         = useState(false);

  // ── Live location + reverse geocoding ────────────────────────────────────
  useEffect(() => {
    let subscriber: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      async function applyReverseGeocode(coords: Location.LocationObjectCoords) {
        const results = await Location.reverseGeocodeAsync(coords);
        if (results.length > 0) {
          const r     = results[0];
          const parts = [r.street, r.streetNumber].filter(Boolean);
          setAddress(parts.length > 0
            ? parts.join(', ')
            : r.district ?? r.city ?? 'Localização atual'
          );
        }
      }

      // Immediately resolve the current position so the address is correct on mount
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await applyReverseGeocode(current.coords);

      subscriber = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
        (loc) => applyReverseGeocode(loc.coords),
      );
    })();
    return () => { subscriber?.remove(); };
  }, []);

  // ── Locate me ─────────────────────────────────────────────────────────────
  async function handleLocateMe() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    setFollowing(true);
  }

  // ── Destination picked → fetch safe route ─────────────────────────────────
  async function handlePlaceSelected(place: SelectedPlace) {
    setDestination(place);
    setFollowing(false);
    setRouteError(false);
    setMetrics(null);

    // Fly camera to destination
    cameraRef.current?.setCamera({
      centerCoordinate: [place.lng, place.lat],
      zoomLevel: 15,
      animationDuration: 900,
    });

    // Open the bottom sheet
    bottomSheetRef.current?.snapToIndex(1);

    // Resolve user's current position
    let originLat: number, originLng: number;
    try {
      await Location.requestForegroundPermissionsAsync();
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      originLat = loc.coords.latitude;
      originLng = loc.coords.longitude;
    } catch {
      setRouteError(true);
      return;
    }

    // Call the SalvaRota backend
    setIsLoadingRoute(true);
    try {
      const url = [
        `${API_URL}/safe-route`,
        `?origin_lat=${originLat}&origin_lng=${originLng}`,
        `&dest_lat=${place.lat}&dest_lng=${place.lng}`,
      ].join('');

      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) { setRouteError(true); return; }

      const data      = await res.json();
      const extracted = extractMetrics(data, data.recommended_route);
      setMetrics(extracted);
    } catch (err) {
      console.warn('[Route] fetch error:', err);
      setRouteError(true);
    } finally {
      setIsLoadingRoute(false);
    }
  }

  // ── Search cleared ────────────────────────────────────────────────────────
  function handleSearchClear() {
    setDestination(null);
    setMetrics(null);
    setRouteError(false);
  }

  // ── Score display ─────────────────────────────────────────────────────────
  const scoreStyle   = metrics ? getScoreStyle(metrics.score) : { label: 'Moderado', color: SCORE_AMBER };
  const scoreDisplay = metrics ? metrics.score : 72;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <GestureHandlerRootView style={styles.container}>

      <MapLibreGL.MapView
        style={styles.map}
        mapStyle={MAPTILER_STYLE_URL}
        onRegionWillChange={(feature) => {
          if (feature.properties?.isUserInteraction) setFollowing(false);
        }}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: IPANEMA_BEACH, zoomLevel: 14 }}
          followUserLocation={following}
          followZoomLevel={16}
        />
        <MapLibreGL.UserLocation visible renderMode={MapLibreGL.UserLocationRenderMode.Native} />

        {/* Destination pin on map */}
        {destination && (
          <MapLibreGL.PointAnnotation
            id="destination"
            coordinate={[destination.lng, destination.lat]}
          >
            <View style={styles.destinationPin}>
              <MaterialIcons name="location-on" size={32} color="#E05252" />
            </View>
          </MapLibreGL.PointAnnotation>
        )}
      </MapLibreGL.MapView>

      {/* Autocomplete search bar */}
      <AddressSearch
        style={{ top: top + 12 }}
        onPlaceSelected={handlePlaceSelected}
        onMenuPress={() => router.push('/menu' as any)}
        onClear={handleSearchClear}
      />

      {/* Locate me */}
      <TouchableOpacity
        style={[styles.locateButton, following && styles.locateButtonActive]}
        onPress={handleLocateMe}
        activeOpacity={0.8}
      >
        <MaterialIcons name="my-location" size={22} color={following ? '#4A90D9' : '#666'} />
      </TouchableOpacity>

      {/* Bottom sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={1}
        snapPoints={['28%', '50%']}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <BottomSheetView style={styles.sheetContent}>

          {/* Header — location label + score badge */}
          <View style={styles.scoreRow}>
            <View style={styles.locationLabelRow}>
              <Text style={styles.locationLabel}>
                {destination ? 'Destino selecionado' : 'Localização atual'}
              </Text>
              <View style={[styles.scoreDot, { backgroundColor: scoreStyle.color }]} />
              <Text style={[styles.scoreText, { color: scoreStyle.color }]}>
                {scoreDisplay} {scoreStyle.label}
              </Text>
            </View>
            <Text style={styles.addressText} numberOfLines={1}>
              {destination ? destination.address : address}
            </Text>
          </View>

          <View style={styles.divider} />

          {/* Loading */}
          {isLoadingRoute ? (
            <View style={styles.stateRow}>
              <ActivityIndicator size="small" color={SCORE_AMBER} />
              <Text style={styles.stateText}>Calculando rota segura…</Text>
            </View>

          /* Error */
          ) : routeError ? (
            <View style={styles.stateRow}>
              <MaterialIcons name="error-outline" size={18} color="#E05252" />
              <Text style={[styles.stateText, { color: '#E05252' }]}>
                Não foi possível calcular a rota
              </Text>
            </View>

          /* Metrics */
          ) : (
            <View style={styles.metricsGrid}>

              {/* Crime — real data from API, dash if no route yet */}
              <MetricRow
                label="Crime"
                value={
                  metrics
                    ? `${metrics.crimeTotal} incidente${metrics.crimeTotal !== 1 ? 's' : ''}`
                    : '—'
                }
                color={
                  metrics == null       ? '#AAA'
                  : metrics.crimeTotal === 0 ? '#5BAD6F'
                  : metrics.crimeTotal <= 5  ? SCORE_AMBER
                  : '#E05252'
                }
              />

              {/* Iluminação — real data from API */}
              <MetricRow
                label="Iluminação"
                value={metrics ? `${metrics.lightingAvg} / 100` : '—'}
                color={
                  metrics == null              ? '#AAA'
                  : metrics.lightingAvg >= 70  ? '#5BAD6F'
                  : metrics.lightingAvg >= 40  ? SCORE_AMBER
                  : '#E05252'
                }
              />

              {/* Negócios — real data from API */}
              <MetricRow
                label="Negócios"
                value={
                  metrics
                    ? `${metrics.businessesAvg} aberto${metrics.businessesAvg !== 1 ? 's' : ''}`
                    : '—'
                }
                color={
                  metrics == null                ? '#AAA'
                  : metrics.businessesAvg >= 6   ? '#5BAD6F'
                  : metrics.businessesAvg >= 1   ? SCORE_AMBER
                  : '#E05252'
                }
              />

              {/* Hora — no time-based data from API, keep as placeholder */}
              <MetricRow label="Hora" value="0.8" color="#4A90D9" />

            </View>
          )}

        </BottomSheetView>
      </BottomSheet>

    </GestureHandlerRootView>
  );
}

// ── MetricRow ─────────────────────────────────────────────────────────────────

function MetricRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metricRow}>
      <View style={[styles.metricDot, { backgroundColor: color }]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  map:       { flex: 1 },

  destinationPin: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  locateButton: {
    position: 'absolute',
    right: 16,
    bottom: '30%',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 5,
  },
  locateButtonActive: {
    backgroundColor: '#fff',
  },

  sheetBackground: {
    backgroundColor: PANEL_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleIndicator: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    width: 36,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },

  scoreRow: {
    paddingVertical: 12,
    gap: 4,
  },
  locationLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  locationLabel: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.45)',
  },
  scoreDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  scoreText: {
    fontSize: 13,
    fontWeight: '600',
  },
  addressText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1A18',
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginBottom: 14,
  },

  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  stateText: {
    fontSize: 13,
    color: '#AAA',
  },

  metricsGrid: { gap: 12 },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  metricLabel: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.55)',
    flex: 1,
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '600',
  },
});
