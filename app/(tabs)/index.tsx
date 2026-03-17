/**
 * Map screen — main feature screen for SalvaRota.
 *
 * UIMode state machine:
 *   idle → place_selected → directions
 */

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
import Paywall from '../../components/Paywall';
import RouteLayer, { RouteSegment } from '../../components/RouteLayer';
import { useRouteAccess } from '../../hooks/useRouteAccess';
import { fetchWalkingRoutes, RouteResult } from '../../services/directionsService';
import {
  computeRouteScore,
  computeSegmentScore,
  daylightScore,
  scoreLabel,
  scoreToColor,
  splitCoordinates,
  timeSafetyScore,
} from '../../services/safetyScoring';

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
  segments?:      BackendSegment[];
}

interface BackendSegment {
  crime_incidents:  number;
  lighting_score:   number | null;
  open_businesses:  number | null;
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
  return { label: scoreLabel(score), color: scoreToColor(score) };
}

/**
 * Time-of-day safety indicator — combines time score with daylight check.
 */
function getTimeInfo(): { value: string; color: string } {
  const now  = new Date();
  const h    = now.getHours();
  const time = `${String(h).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const combined = Math.round((timeSafetyScore(now) + daylightScore(now)) / 2);
  return { value: time, color: scoreToColor(combined) };
}

function extractMetrics(data: any, recommendedId: number): RouteMetrics | null {
  const route = data.routes?.find((r: any) => r.route_id === recommendedId);
  if (!route || !route.segments?.length) return null;

  const segs: BackendSegment[] = route.segments;

  const crimeTotal = segs.reduce((acc, s) => acc + (s.crime_incidents ?? 0), 0);

  const litSegs = segs.filter(s => s.lighting_score !== null && s.lighting_score !== undefined);
  const lightingAvg = litSegs.length > 0
    ? Math.round(litSegs.reduce((acc, s) => acc + (s.lighting_score ?? 0), 0) / litSegs.length)
    : null;

  const bizSegs = segs.filter(s => s.open_businesses !== null && s.open_businesses !== undefined);
  const businessesAvg = bizSegs.length > 0
    ? Math.round(bizSegs.reduce((acc, s) => acc + (s.open_businesses ?? 0), 0) / bizSegs.length)
    : null;

  const now = new Date();
  const segmentScores = segs.map(s =>
    computeSegmentScore({
      lightingScore:  s.lighting_score  ?? null,
      openBusinesses: s.open_businesses ?? null,
      crimeIncidents: s.crime_incidents ?? 0,
      date:           now,
    })
  );
  const clientScore = computeRouteScore(segmentScores);
  const finalScore  = route.score != null ? Math.round(route.score) : clientScore;

  return {
    score:          finalScore,
    crimeTotal:     Math.round(crimeTotal),
    lightingAvg,
    businessesAvg,
    routesCompared: data.routes?.length ?? 1,
    segments:       segs,
  };
}

function buildRouteSegments(
  coords:   [number, number][],
  segments: BackendSegment[],
  date:     Date = new Date(),
): RouteSegment[] {
  if (!segments.length || coords.length < 2) return [];
  const parts = splitCoordinates(coords, segments.length);
  return parts.map((part, i) => ({
    coordinates: part,
    score: computeSegmentScore({
      lightingScore:  segments[i].lighting_score  ?? null,
      openBusinesses: segments[i].open_businesses ?? null,
      crimeIncidents: segments[i].crime_incidents ?? 0,
      date,
    }),
  }));
}

async function fetchSafeRouteMetrics(
  from: SelectedPlace,
  to:   SelectedPlace,
): Promise<RouteMetrics | null> {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 25_000);
  try {
    const url = `${API_URL}/safe-route?origin_lat=${from.lat}&origin_lng=${from.lng}&dest_lat=${to.lat}&dest_lng=${to.lng}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return extractMetrics(data, data.recommended_route);
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      const now = new Date();
      const clientScore = Math.round((timeSafetyScore(now) + daylightScore(now)) / 2);
      return { score: clientScore, crimeTotal: 0, lightingAvg: null, businessesAvg: null, routesCompared: 1 };
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function pickBestRoute(
  routes:          RouteResult[],
  backendMetrics?: RouteMetrics | null,
): { route: RouteResult; allUnsafe: boolean } {
  if (!routes.length) throw new Error('No routes available');
  const score = backendMetrics?.score ?? Math.round((timeSafetyScore() + daylightScore()) / 2);
  return { route: routes[0], allUnsafe: score < 50 };
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const { top }        = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const cameraRef      = useRef<CameraRef>(null);

  const [uiMode, setUiMode]                     = useState<UIMode>('idle');
  const [following, setFollowing]               = useState(false);
  const [address, setAddress]                   = useState('Localização atual');
  const [fromPlace, setFromPlace]               = useState<SelectedPlace | null>(null);
  const [destination, setDestination]           = useState<SelectedPlace | null>(null);
  const [routeCoords, setRouteCoords]           = useState<[number, number][]>([]);
  const [routeSegments, setRouteSegments]       = useState<RouteSegment[]>([]);
  const [routeScore, setRouteScore]             = useState<number | undefined>(undefined);
  const [durationText, setDurationText]         = useState<string | null>(null);
  const [metrics, setMetrics]                   = useState<RouteMetrics | null>(null);
  const [isLoadingRoute, setIsLoadingRoute]     = useState(false);
  const [routeError, setRouteError]             = useState(false);
  const [allRoutesUnsafe, setAllRoutesUnsafe]   = useState(false);
  const [metricModal, setMetricModal]           = useState<{ visible: boolean; key: string }>({
    visible: false,
    key: '',
  });

  // ── Paywall / route access ────────────────────────────────────────────────
  const {
    freeRoutesRemaining,
    passIsActive,
    showPaywall,
    requestRouteAccess,
    onPurchaseComplete,
    dismissPaywall,
  } = useRouteAccess();

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
    if (!isFinite(place.lat) || !isFinite(place.lng)) {
      console.warn('[Route] Invalid coordinates for place:', place);
      return;
    }

    setDestination(place);
    setFollowing(false);
    setRouteError(false);
    setMetrics(null);
    setRouteCoords([]);
    setRouteSegments([]);
    setRouteScore(undefined);
    setDurationText(null);
    setAllRoutesUnsafe(false);
    setUiMode('place_selected');

    cameraRef.current?.setCamera({
      centerCoordinate: [place.lng, place.lat],
      zoomLevel: 15,
      animationDuration: 900,
    });

    bottomSheetRef.current?.snapToIndex(1);

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
      if (!res.ok) { setRouteError(true); return; }
      const data = await res.json();
      const m = extractMetrics(data, data.recommended_route);
      setMetrics(m);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        const now = new Date();
        const clientScore = Math.round((timeSafetyScore(now) + daylightScore(now)) / 2);
        setMetrics({ score: clientScore, crimeTotal: 0, lightingAvg: null, businessesAvg: null, routesCompared: 1 });
      }
    } finally {
      clearTimeout(timeoutId);
      setIsLoadingRoute(false);
    }
  }

  // ── "Como chegar" ─────────────────────────────────────────────────────────
  async function handleGetDirections() {
    if (!destination || !fromPlace) return;

    const allowed = await requestRouteAccess();
    if (!allowed) return;

    setRouteError(false);
    setRouteCoords([]);
    setRouteSegments([]);
    setDurationText(null);
    setAllRoutesUnsafe(false);
    setUiMode('directions');
    bottomSheetRef.current?.snapToIndex(1);

    await fetchAndDisplayRoute(fromPlace, destination);
  }

  async function fetchAndDisplayRoute(
    from:             SelectedPlace,
    to:               SelectedPlace,
    overrideMetrics?: RouteMetrics | null,
  ) {
    const effectiveMetrics = overrideMetrics !== undefined ? overrideMetrics : metrics;

    // Clear stale segment colours immediately → grey route while loading
    setRouteSegments([]);
    setRouteScore(undefined);

    setIsLoadingRoute(true);
    const routes = await fetchWalkingRoutes(from, to);
    setIsLoadingRoute(false);

    if (!routes.length) { setRouteError(true); return; }

    const { route, allUnsafe } = pickBestRoute(routes, effectiveMetrics);
    setAllRoutesUnsafe(allUnsafe);
    setRouteCoords(route.coordinates);
    setDurationText(route.durationText || null);

    const now = new Date();
    if (effectiveMetrics?.segments?.length) {
      setRouteSegments(buildRouteSegments(route.coordinates, effectiveMetrics.segments, now));
      setRouteScore(effectiveMetrics.score ?? undefined);
    } else {
      setRouteScore(Math.round((timeSafetyScore(now) + daylightScore(now)) / 2));
    }

    cameraRef.current?.fitBounds(route.bounds.ne, route.bounds.sw, [80, 80, 280, 80], 800);
  }

  // ── DirectionsPanel callbacks ─────────────────────────────────────────────
  async function handleFromChange(place: SelectedPlace) {
    setFromPlace(place);
    if (destination) await fetchAndDisplayRoute(place, destination);
  }

  async function handleToChange(place: SelectedPlace) {
    setDestination(place);
    if (fromPlace) await fetchAndDisplayRoute(fromPlace, place);
  }

  async function handleSwap() {
    if (!fromPlace || !destination) return;

    const newFrom = destination;
    const newTo   = fromPlace;

    // 1. Flip labels immediately so the UI feels responsive.
    setFromPlace(newFrom);
    setDestination(newTo);

    // 2. Clear ALL stale safety data so the route goes grey right away
    //    instead of showing inverted colours from the previous direction.
    setMetrics(null);
    setRouteCoords([]);
    setRouteSegments([]);
    setRouteScore(undefined);
    setRouteError(false);

    // 3. Fire the backend safety re-fetch in parallel with Google directions.
    const safetyPromise = fetchSafeRouteMetrics(newFrom, newTo);

    // 4. Fetch the Google walking route (fast). Grey route appears here
    //    while we still await the safety scores.
    setIsLoadingRoute(true);
    const routes = await fetchWalkingRoutes(newFrom, newTo);
    setIsLoadingRoute(false);

    if (!routes.length) { setRouteError(true); return; }

    const { route, allUnsafe } = pickBestRoute(routes, null);
    setAllRoutesUnsafe(allUnsafe);
    setRouteCoords(route.coordinates);
    setDurationText(route.durationText || null);
    cameraRef.current?.fitBounds(route.bounds.ne, route.bounds.sw, [80, 80, 280, 80], 800);

    // 5. Once safety data arrives, paint the segment colours.
    const m = await safetyPromise;
    if (m) {
      setMetrics(m);
      if (m.segments?.length) {
        setRouteSegments(buildRouteSegments(route.coordinates, m.segments, new Date()));
        setRouteScore(m.score ?? undefined);
        return;
      }
      if (m.score != null) { setRouteScore(m.score); return; }
    }
    // Fallback: time-based score only
    const now = new Date();
    setRouteScore(Math.round((timeSafetyScore(now) + daylightScore(now)) / 2));
  }

  // ── Back / clear ──────────────────────────────────────────────────────────
  function handleDirectionsClose() {
    setUiMode('place_selected');
    setRouteCoords([]);
    setRouteSegments([]);
    setDurationText(null);
  }

  function handleSearchClear() {
    setDestination(null);
    setFromPlace(null);
    setMetrics(null);
    setRouteError(false);
    setRouteCoords([]);
    setRouteSegments([]);
    setRouteScore(undefined);
    setDurationText(null);
    setAllRoutesUnsafe(false);
    setUiMode('idle');
  }

  // ── Metric modal ──────────────────────────────────────────────────────────
  function openMetricModal(key: string) { setMetricModal({ visible: true, key }); }
  function closeMetricModal()           { setMetricModal({ visible: false, key: '' }); }

  // ── Score display ─────────────────────────────────────────────────────────
  const effectiveScore = routeScore ?? metrics?.score ?? null;
  const scoreStyle     = effectiveScore != null
    ? getScoreStyle(effectiveScore)
    : { label: '–', color: '#BDBDBD' };
  const scoreDisplay   = effectiveScore ?? '–';

  function routeHeaderLabel(): string {
    if (durationText) {
      const safety = effectiveScore != null ? `${scoreStyle.label} — ` : '';
      return `${safety}${durationText}`;
    }
    if (metrics) return `Melhor de ${metrics.routesCompared} rota${metrics.routesCompared !== 1 ? 's' : ''}`;
    return destination ? 'Destino selecionado' : 'Localização atual';
  }

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

        {/* Route polyline — always mounted to avoid native layer teardown crash */}
        <RouteLayer
          coordinates={routeCoords}
          segments={routeSegments.length > 0 ? routeSegments : undefined}
          score={routeScore}
        />

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

      {/* Top bar */}
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

      {/* Free routes counter badge */}
      {freeRoutesRemaining !== null && !passIsActive && freeRoutesRemaining < 3 && (
        <View style={[styles.freeCountBadge, { top: top + 76 }]}>
          <MaterialIcons name="route" size={12} color="#888" />
          <Text style={styles.freeCountText}>
            {freeRoutesRemaining > 0
              ? `${freeRoutesRemaining} rota${freeRoutesRemaining !== 1 ? 's' : ''} grátis`
              : 'Rotas grátis esgotadas'}
          </Text>
        </View>
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

          <View style={styles.scoreRow}>
            <View style={styles.locationLabelRow}>
              <Text style={styles.locationLabel}>{routeHeaderLabel()}</Text>
              <View style={[styles.scoreDot, { backgroundColor: scoreStyle.color }]} />
              <Text style={[styles.scoreText, { color: scoreStyle.color }]}>
                {scoreDisplay} {typeof scoreDisplay === 'number' ? scoreStyle.label : ''}
              </Text>
            </View>
            <Text style={styles.addressText} numberOfLines={1}>
              {destination
                ? (destination.name ? `${destination.name} — ${destination.address}` : destination.address)
                : address}
            </Text>
          </View>

          {allRoutesUnsafe && (
            <View style={styles.warningRow}>
              <MaterialIcons name="warning" size={14} color="#E05252" />
              <Text style={styles.warningText}>Mostrando a rota mais segura disponível.</Text>
            </View>
          )}

          <View style={styles.divider} />

          {isLoadingRoute ? (
            <View style={styles.stateRow}>
              <ActivityIndicator size="small" color={SCORE_AMBER} />
              <Text style={styles.stateText}>Calculando rota segura…</Text>
            </View>
          ) : routeError ? (
            <View style={styles.stateRow}>
              <MaterialIcons name="error-outline" size={18} color="#E05252" />
              <Text style={[styles.stateText, { color: '#E05252' }]}>
                Não foi possível calcular a rota
              </Text>
            </View>
          ) : (
            <View style={styles.metricsGrid}>
              {!destination && (
                <Text style={styles.idleHint}>
                  Busque um destino para ver as métricas de segurança da rota
                </Text>
              )}

              <MetricRow
                label="Iluminação"
                value={metrics?.lightingAvg != null ? `${metrics.lightingAvg} / 100` : null}
                color={metrics?.lightingAvg != null ? scoreToColor(metrics.lightingAvg) : '#BDBDBD'}
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
            <TouchableOpacity style={styles.modalOkBtn} onPress={closeMetricModal} activeOpacity={0.8}>
              <Text style={styles.modalOkText}>Okay</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Paywall modal */}
      <Paywall
        visible={showPaywall}
        onPurchaseSuccess={onPurchaseComplete}
        onDismiss={dismissPaywall}
      />

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

  destinationPin: { alignItems: 'center', justifyContent: 'center' },

  locateButton: {
    position: 'absolute', right: 16, bottom: '30%',
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 5,
  },
  locateButtonActive: { backgroundColor: '#fff' },

  freeCountBadge: {
    position: 'absolute', right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  freeCountText: { fontSize: 11, color: '#888' },

  sheetBackground: {
    backgroundColor: PANEL_BG,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  handleIndicator: { backgroundColor: 'rgba(0,0,0,0.15)', width: 36 },
  sheetContent: { flex: 1, paddingHorizontal: 24, paddingTop: 8 },

  scoreRow: { paddingVertical: 12, gap: 4 },
  locationLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locationLabel: { fontSize: 13, color: 'rgba(0,0,0,0.45)' },
  scoreDot: { width: 10, height: 10, borderRadius: 5 },
  scoreText: { fontSize: 13, fontWeight: '600' },
  addressText: { fontSize: 17, fontWeight: '600', color: '#1C1A18' },

  warningRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4, paddingHorizontal: 8,
    backgroundColor: 'rgba(224,82,82,0.08)', borderRadius: 8, marginBottom: 4,
  },
  warningText: { fontSize: 12, color: '#E05252', flex: 1 },

  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginBottom: 14 },

  stateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  stateText: { fontSize: 13, color: '#AAA' },

  idleHint: { fontSize: 12, color: 'rgba(0,0,0,0.38)', marginBottom: 4, lineHeight: 17 },

  metricsGrid: { gap: 12 },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  metricDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  metricLabel: { fontSize: 13, color: 'rgba(0,0,0,0.55)', flex: 1 },
  metricValue: { fontSize: 13, fontWeight: '600' },
  metricInfoIcon: { marginLeft: 4 },

  ctaButton: {
    marginTop: 20, paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 999, backgroundColor: SCORE_AMBER,
    alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  ctaButtonText: { fontSize: 14, fontWeight: '600', color: '#1C1A18' },

  // ── Metric info modal ──────────────────────────────────────────────────────
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28,
  },
  modalCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 20, elevation: 12,
  },
  modalTitle:       { fontSize: 17, fontWeight: '700', color: '#1C1A18' },
  modalDescription: { fontSize: 14, color: 'rgba(0,0,0,0.65)', lineHeight: 21 },
  modalOkBtn: {
    marginTop: 4, paddingVertical: 12, borderRadius: 999,
    backgroundColor: SCORE_AMBER, alignItems: 'center',
  },
  modalOkText: { fontSize: 15, fontWeight: '700', color: '#1C1A18' },
});
