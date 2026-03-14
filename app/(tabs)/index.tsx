import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import MapLibreGL, { CameraRef } from '@maplibre/maplibre-react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AddressSearch, { SelectedPlace } from '../../components/AddressSearch';
import DirectionsPanel from '../../components/DirectionsPanel';
import RouteLayer from '../../components/RouteLayer';
import { fetchWalkingRoute } from '../../services/directionsService';

MapLibreGL.setAccessToken(null);

const IPANEMA_BEACH      = [-43.1873, -22.9868];
const MAPTILER_STYLE_URL = `https://api.maptiler.com/maps/019cd357-6ec6-7605-9d2c-637be3bc2c81/style.json?key=${process.env.EXPO_PUBLIC_MAPTILER_API_KEY}`;
const API_URL            = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const PANEL_BG    = '#FAEFE9';
const SCORE_AMBER = '#E8A838';

// ── Types ─────────────────────────────────────────────────────────────────────

type UIMode = 'idle' | 'place_selected' | 'directions';

interface RouteMetrics {
  score:          number | null;
  crimeTotal:     number;
  lightingAvg:    number | null;
  businessesAvg:  number | null;
  routesCompared: number;
}

// ── Metric info modal content ──────────────────────────────────────────────────

const METRIC_INFO: Record<string, { title: string; description: string }> = {
  'Iluminação': {
    title: 'Iluminação Pública',
    description:
      'Indica a qualidade da iluminação pública ao longo da rota. Vias bem iluminadas aumentam a visibilidade e reduzem a sensação de insegurança — e o risco real. Pontuação média de 0 a 100 baseada em dados de infraestrutura municipal.',
  },
  'Negócios abertos': {
    title: 'Negócios Abertos',
    description:
      'Comércios em funcionamento criam "olhos na rua": mais movimento, mais testemunhas e menos oportunidade para crimes. Exibimos a média de estabelecimentos abertos por trecho da rota, com base em horários de funcionamento.',
  },
  'Crime': {
    title: 'Registros de Crime',
    description:
      'Total de ocorrências de roubo a transeuntes e assalto registradas nos últimos 90 dias ao longo da rota. Dados do ISP-RJ (Instituto de Segurança Pública do Rio de Janeiro).',
  },
  'Hora': {
    title: 'Horário Atual',
    description:
      'O momento do dia influencia diretamente o risco. Dados do ISP-RJ indicam que ~38% dos roubos ocorrem entre 14h–19h e que o período noturno (19h–03h) concentra os maiores índices. O SalvaRota usa seu horário atual como fator de risco.',
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getScoreStyle(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'Seguro',   color: '#5BAD6F' };
  if (score >= 40) return { label: 'Moderado', color: SCORE_AMBER };
  return              { label: 'Perigoso', color: '#E05252' };
}

/**
 * Time-of-day safety indicator based on the device clock.
 *
 * 05:00–09:00 → green  — low pedestrian targets; commuter rush still safe
 * 09:00–14:00 → amber  — moderate daytime activity
 * 14:00–19:00 → red    — Rio afternoon robbery peak (~38 % of incidents)
 * 19:00–03:00 → red    — primary nocturnal peak + bar-closing cluster
 * 03:00–05:00 → amber  — deep night; very few targets, crime recedes
 */
function getTimeInfo(): { value: string; color: string } {
  const now  = new Date();
  const h    = now.getHours();
  const time = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (h >= 5  && h < 9)  return { value: time, color: '#5BAD6F' };
  if (h >= 9  && h < 14) return { value: time, color: SCORE_AMBER };
  if (h >= 14 && h < 19) return { value: time, color: '#E05252' };
  if (h >= 19)           return { value: time, color: '#E05252' };
  if (h < 3)             return { value: time, color: '#E05252' };
  return                         { value: time, color: SCORE_AMBER };
}

function extractMetrics(data: any, recommendedId: number): RouteMetrics | null {
  const route = data.routes?.find((r: any) => r.route_id === recommendedId);
  if (!route || !route.segments?.length) return null;

  const segs = route.segments as any[];

  const crimeTotal = segs.reduce((acc: number, s: any) => acc + (s.crime_incidents ?? 0), 0);

  const litSegs = segs.filter((s: any) => s.lighting_score !== null && s.lighting_score !== undefined);
  const lightingAvg = litSegs.length > 0
    ? Math.round(litSegs.reduce((acc: number, s: any) => acc + s.lighting_score, 0) / litSegs.length)
    : null;

  const bizSegs = segs.filter((s: any) => s.open_businesses !== null && s.open_businesses !== undefined);
  const businessesAvg = bizSegs.length > 0
    ? Math.round(bizSegs.reduce((acc: number, s: any) => acc + s.open_businesses, 0) / bizSegs.length)
    : null;

  return {
    score:          route.score !== null && route.score !== undefined ? Math.round(route.score) : null,
    crimeTotal:     Math.round(crimeTotal),
    lightingAvg,
    businessesAvg,
    routesCompared: data.routes?.length ?? 1,
  };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const { top }        = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const cameraRef      = useRef<CameraRef>(null);

  const [uiMode, setUiMode]                 = useState<UIMode>('idle');
  const [following, setFollowing]           = useState(false);
  const [address, setAddress]               = useState('Localização atual');
  const [fromPlace, setFromPlace]           = useState<SelectedPlace | null>(null);
  const [destination, setDestination]       = useState<SelectedPlace | null>(null);
  const [routeCoords, setRouteCoords]       = useState<[number, number][]>([]);
  const [metrics, setMetrics]               = useState<RouteMetrics | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  const [routeError, setRouteError]         = useState(false);
  const [metricModal, setMetricModal]       = useState<{ visible: boolean; key: string }>({
    visible: false,
    key: '',
  });

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

  // ── Destination picked from search ────────────────────────────────────────
  async function handlePlaceSelected(place: SelectedPlace) {
    // Guard: validate coordinates before touching camera or map
    if (!isFinite(place.lat) || !isFinite(place.lng)) {
      console.warn('[Route] Invalid coordinates for place:', place);
      return;
    }

    setDestination(place);
    setFollowing(false);
    setRouteError(false);
    setMetrics(null);
    setRouteCoords([]);
    setUiMode('place_selected');

    cameraRef.current?.setCamera({
      centerCoordinate: [place.lng, place.lat],
      zoomLevel: 15,
      animationDuration: 900,
    });

    bottomSheetRef.current?.snapToIndex(1);

    // Resolve user's current position
    let originLat: number, originLng: number;
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      originLat = loc.coords.latitude;
      originLng = loc.coords.longitude;
      setFromPlace({ lat: originLat, lng: originLng, address });
    } catch {
      console.warn('[Route] Could not get device location');
      setRouteError(true);
      return;
    }

    setIsLoadingRoute(true);
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 25_000);
    try {
      const url = `${API_URL}/safe-route?origin_lat=${originLat}&origin_lng=${originLng}&dest_lat=${place.lat}&dest_lng=${place.lng}`;
      console.log('[Route] fetching', url);
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        console.warn('[Route] HTTP error', res.status);
        setRouteError(true);
        return;
      }
      const data = await res.json();
      const m = extractMetrics(data, data.recommended_route);
      setMetrics(m);
    } catch (err: any) {
      console.warn('[Route] fetch error:', err?.message ?? err);
      setRouteError(true);
    } finally {
      clearTimeout(timeoutId);
      setIsLoadingRoute(false);
    }
  }

  // ── "Como chegar" — fetch geometry and switch to directions mode ──────────
  async function handleGetDirections() {
    if (!destination || !fromPlace) return;
    setRouteError(false);
    setRouteCoords([]);
    setUiMode('directions');
    bottomSheetRef.current?.snapToIndex(1);

    const result = await fetchWalkingRoute(fromPlace, destination);
    if (!result) {
      setRouteError(true);
      return;
    }

    setRouteCoords(result.coordinates);
    cameraRef.current?.fitBounds(result.bounds.ne, result.bounds.sw, [80, 80, 280, 80], 800);
  }

  // ── DirectionsPanel callbacks ─────────────────────────────────────────────
  async function handleFromChange(place: SelectedPlace) {
    setFromPlace(place);
    await refetchRoute(place, destination);
  }

  async function handleToChange(place: SelectedPlace) {
    setDestination(place);
    await refetchRoute(fromPlace, place);
  }

  function handleSwap() {
    // Guard: both must be set before swapping
    if (!fromPlace || !destination) return;
    const prev = fromPlace;
    setFromPlace(destination);
    setDestination(prev);
    refetchRoute(destination, prev);
  }

  async function refetchRoute(from: SelectedPlace | null, to: SelectedPlace | null) {
    if (!from || !to) return;
    setRouteCoords([]);
    const result = await fetchWalkingRoute(from, to);
    if (result) {
      setRouteCoords(result.coordinates);
      cameraRef.current?.fitBounds(result.bounds.ne, result.bounds.sw, [80, 80, 280, 80], 800);
    }
  }

  // ── Back / clear ──────────────────────────────────────────────────────────
  function handleDirectionsClose() {
    setUiMode('place_selected');
    setRouteCoords([]);
  }

  function handleSearchClear() {
    setDestination(null);
    setFromPlace(null);
    setMetrics(null);
    setRouteError(false);
    setRouteCoords([]);
    setUiMode('idle');
  }

  // ── Metric modal ──────────────────────────────────────────────────────────
  function openMetricModal(key: string) {
    setMetricModal({ visible: true, key });
  }

  function closeMetricModal() {
    setMetricModal({ visible: false, key: '' });
  }

  // ── Score display ─────────────────────────────────────────────────────────
  const scoreStyle   = (metrics?.score != null) ? getScoreStyle(metrics.score) : { label: '–', color: '#BDBDBD' };
  const scoreDisplay = metrics?.score ?? '–';

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

        {/* Route polyline */}
        {routeCoords.length >= 2 && <RouteLayer coordinates={routeCoords} />}

        {/* Destination pin */}
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

      {/* Top bar — AddressSearch in idle/place_selected, DirectionsPanel in directions */}
      {uiMode === 'directions' ? (
        <DirectionsPanel
          style={{ top: top + 12 }}
          fromAddress={fromPlace?.address ?? address}
          toAddress={destination?.address ?? ''}
          onFromChange={handleFromChange}
          onToChange={handleToChange}
          onSwap={handleSwap}
          onClose={handleDirectionsClose}
        />
      ) : (
        <AddressSearch
          style={{ top: top + 12 }}
          onPlaceSelected={handlePlaceSelected}
          onMenuPress={() => router.push('/menu' as any)}
          onClear={handleSearchClear}
        />
      )}

      {/* Locate me */}
      {uiMode !== 'directions' && (
        <TouchableOpacity
          style={[styles.locateButton, following && styles.locateButtonActive]}
          onPress={handleLocateMe}
          activeOpacity={0.8}
        >
          <MaterialIcons name="my-location" size={22} color={following ? '#4A90D9' : '#666'} />
        </TouchableOpacity>
      )}

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
                {metrics
                  ? `Melhor de ${metrics.routesCompared} rota${metrics.routesCompared !== 1 ? 's' : ''}`
                  : destination ? 'Destino selecionado' : 'Localização atual'}
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

              {/* Idle-mode hint */}
              {!destination && (
                <Text style={styles.idleHint}>
                  Busque um destino para ver as métricas de segurança da rota
                </Text>
              )}

              <MetricRow
                label="Iluminação"
                value={metrics?.lightingAvg != null ? `${metrics.lightingAvg} / 100` : null}
                color={metrics?.lightingAvg != null ? getScoreStyle(metrics.lightingAvg).color : '#BDBDBD'}
                onPress={() => openMetricModal('Iluminação')}
              />

              <MetricRow
                label="Negócios abertos"
                value={metrics?.businessesAvg != null ? `${metrics.businessesAvg} por trecho` : null}
                color={SCORE_AMBER}
                onPress={() => openMetricModal('Negócios abertos')}
              />

              <MetricRow
                label="Crime"
                value={metrics != null ? `${metrics.crimeTotal} nos últimos 90d` : null}
                color={metrics?.crimeTotal === 0 ? '#5BAD6F' : '#E05252'}
                onPress={() => openMetricModal('Crime')}
              />

              {/* Hora — always shown, uses device clock */}
              {(() => { const t = getTimeInfo(); return (
                <MetricRow
                  label="Hora"
                  value={t.value}
                  color={t.color}
                  onPress={() => openMetricModal('Hora')}
                />
              ); })()}

            </View>
          )}

          {/* CTA */}
          {destination && uiMode !== 'directions' && (
            <TouchableOpacity
              style={styles.ctaButton}
              activeOpacity={0.8}
              onPress={handleGetDirections}
            >
              <MaterialIcons name="directions-walk" size={18} color="#1C1A18" />
              <Text style={styles.ctaButtonText}>Como chegar</Text>
            </TouchableOpacity>
          )}

        </BottomSheetView>
      </BottomSheet>

      {/* Metric info modal */}
      <Modal
        visible={metricModal.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeMetricModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeMetricModal}>
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {METRIC_INFO[metricModal.key]?.title ?? metricModal.key}
            </Text>
            <Text style={styles.modalDescription}>
              {METRIC_INFO[metricModal.key]?.description}
            </Text>
            <TouchableOpacity
              style={styles.modalOkBtn}
              onPress={closeMetricModal}
              activeOpacity={0.8}
            >
              <Text style={styles.modalOkText}>Okay</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </GestureHandlerRootView>
  );
}

// ── MetricRow ─────────────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  color,
  onPress,
}: {
  label:   string;
  value:   string | null;
  color:   string;
  onPress: () => void;
}) {
  const noData = value === null;
  return (
    <TouchableOpacity style={styles.metricRow} onPress={onPress} activeOpacity={0.6}>
      <View style={[styles.metricDot, { backgroundColor: noData ? '#BDBDBD' : color }]} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: noData ? '#BDBDBD' : color }]}>
        {noData ? '—' : value}
      </Text>
      <MaterialIcons name="info-outline" size={14} color="rgba(0,0,0,0.28)" style={styles.metricInfoIcon} />
    </TouchableOpacity>
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

  idleHint: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.38)',
    marginBottom: 4,
    lineHeight: 17,
  },

  metricsGrid: { gap: 12 },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
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
  metricInfoIcon: {
    marginLeft: 4,
  },

  ctaButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: SCORE_AMBER,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  ctaButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1A18',
  },

  // ── Modal ──────────────────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1A18',
  },
  modalDescription: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.65)',
    lineHeight: 21,
  },
  modalOkBtn: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: SCORE_AMBER,
    alignItems: 'center',
  },
  modalOkText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1A18',
  },
});
