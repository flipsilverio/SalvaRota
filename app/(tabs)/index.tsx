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
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
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
  crimeEvents?:   CrimeEvent[];
  shootoutScore?:  number;
  shootoutEvents?: ShootoutEvent[];
}

interface BackendSegment {
  crime_incidents:  number;
  lighting_score:   number | null;
  open_businesses:  number | null;
  /** Individual crime records — added by backend when available */
  crimes?:          CrimeEvent[];
  shootout_score?:  number;
  shootout_events?: ShootoutEvent[];
}

/**
 * A single crime occurrence returned by the backend.
 * The backend must include this in each segment's `crimes` array.
 * Expected fields: lat, lng, date (YYYY-MM-DD), time (HH:mm), description.
 */
interface CrimeEvent {
  lat:         number;
  lng:         number;
  date:        string;
  time:        string;
  description: string;
}

interface ShootoutEvent {
  lat:           number;
  lng:           number;
  date:          string;
  time:          string;
  killed:        number;
  injured:       number;
  /** 'HIGH' | 'MEDIUM' | 'LOW' — internal, not shown directly in UI */
  category?:     string;
  /** UI-ready modal title — context-appropriate, non-alarming */
  uiTitle?:      string;
  /** UI-ready modal body — explains relevance to pedestrian safety */
  uiDescription?: string;
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
  'Violência Recente': {
    title: 'Violência Recente (Tiroteios)',
    description:
      'Registros de tiroteios nas proximidades da rota nos últimos 60 dias, com base em dados do Fogo Cruzado. Esta métrica é contextual — tiroteios envolvem principalmente confrontos entre policiais e criminosos ou disputas entre grupos, e NÃO representam risco direto de roubo. A pontuação é suavizada para não penalizar excessivamente rotas em regiões com histórico de conflito armado.',
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

  const crimeEvents: CrimeEvent[] = segs.flatMap(s => s.crimes ?? []);

  const shootoutEvents: ShootoutEvent[] = segs.flatMap(s => s.shootout_events ?? []);
  // Deduplicate by lat+lng+date
  const uniqueShootouts = shootoutEvents.filter((e, i, arr) =>
    arr.findIndex(x => x.lat === e.lat && x.lng === e.lng && x.date === e.date) === i
  );
  // Route-level shootout score = average of segment shootout scores
  const shootoutScores = segs.map(s => s.shootout_score ?? 100);
  const shootoutScore = Math.round(shootoutScores.reduce((a, b) => a + b, 0) / shootoutScores.length);

  return {
    score:          finalScore,
    crimeTotal:     Math.round(crimeTotal),
    lightingAvg,
    businessesAvg,
    routesCompared: data.routes?.length ?? 1,
    segments:       segs,
    crimeEvents,
    shootoutScore,
    shootoutEvents: uniqueShootouts,
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
  const { top }                  = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const bottomSheetRef           = useRef<BottomSheet>(null);
  const cameraRef                = useRef<CameraRef>(null);

  // Shared value written by BottomSheet — Y position from top of screen.
  // Initialise to 72% (= 28% sheet height snap) so the button starts correct.
  const sheetY = useSharedValue(screenHeight * 0.72);

  const [uiMode, setUiMode]                     = useState<UIMode>('idle');
  const [following, setFollowing]               = useState(false);
  const [address, setAddress]                   = useState('Localização atual');
  const [fromPlace, setFromPlace]               = useState<SelectedPlace | null>(null);
  const [destination, setDestination]           = useState<SelectedPlace | null>(null);
  const [routeCoords, setRouteCoords]           = useState<[number, number][]>([]);
  const [routeSegments, setRouteSegments]       = useState<RouteSegment[]>([]);
  const [routeScore, setRouteScore]             = useState<number | undefined>(undefined);
  const [durationText, setDurationText]         = useState<string | null>(null);
  const [distanceText, setDistanceText]         = useState<string | null>(null);
  const [crimeEvents, setCrimeEvents]           = useState<CrimeEvent[]>([]);
  const [metrics, setMetrics]                   = useState<RouteMetrics | null>(null);
  const [isLoadingRoute, setIsLoadingRoute]     = useState(false);
  const [routeError, setRouteError]             = useState(false);
  const [allRoutesUnsafe, setAllRoutesUnsafe]   = useState(false);
  const [metricModal, setMetricModal]           = useState<{ visible: boolean; key: string }>({
    visible: false,
    key: '',
  });
  const [crimeModal, setCrimeModal]             = useState<{ visible: boolean; crime: CrimeEvent | null }>({
    visible: false,
    crime: null,
  });
  const [shootoutEvents, setShootoutEvents]     = useState<ShootoutEvent[]>([]);
  const [shootoutScore, setShootoutScore]       = useState<number | null>(null);
  const [shootoutModal, setShootoutModal]       = useState<{ visible: boolean; event: ShootoutEvent | null }>({ visible: false, event: null });

  // Locate button floats 16 px above the bottom sheet at all times.
  const locateButtonStyle = useAnimatedStyle(() => ({
    bottom: screenHeight - sheetY.value + 16,
  }));

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
    setShootoutEvents([]);
    setShootoutScore(null);
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
    setDistanceText(route.distanceText || null);
    cameraRef.current?.fitBounds(route.bounds.ne, route.bounds.sw, [80, 80, 280, 80], 800);

    // Let the grey route render for one frame before painting safety colours.
    await new Promise<void>(r => setTimeout(r, 50));

    const now = new Date();
    if (effectiveMetrics?.segments?.length) {
      setRouteSegments(buildRouteSegments(route.coordinates, effectiveMetrics.segments, now));
      setRouteScore(effectiveMetrics.score ?? undefined);
      setCrimeEvents(effectiveMetrics.crimeEvents ?? []);
      setShootoutEvents(effectiveMetrics?.shootoutEvents ?? []);
      setShootoutScore(effectiveMetrics?.shootoutScore ?? null);
    } else {
      setRouteScore(Math.round((timeSafetyScore(now) + daylightScore(now)) / 2));
    }
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
    setDistanceText(null);
    setCrimeEvents([]);
    setShootoutEvents([]);
    setShootoutScore(null);
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
        setCrimeEvents(m.crimeEvents ?? []);
        setShootoutEvents(m.shootoutEvents ?? []);
        setShootoutScore(m.shootoutScore ?? null);
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
    setDistanceText(null);
    setCrimeEvents([]);
    setShootoutEvents([]);
    setShootoutScore(null);
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
    setDistanceText(null);
    setCrimeEvents([]);
    setShootoutEvents([]);
    setShootoutScore(null);
    setAllRoutesUnsafe(false);
    setUiMode('idle');
  }

  // ── Metric modal ──────────────────────────────────────────────────────────
  function openMetricModal(key: string) { setMetricModal({ visible: true, key }); }
  function closeMetricModal()           { setMetricModal({ visible: false, key: '' }); }

  // ── Crime modal ───────────────────────────────────────────────────────────
  function openCrimeModal(crime: CrimeEvent) { setCrimeModal({ visible: true, crime }); }
  function closeCrimeModal()                 { setCrimeModal({ visible: false, crime: null }); }

  // ── Score display ─────────────────────────────────────────────────────────
  const effectiveScore = routeScore ?? metrics?.score ?? null;
  const scoreStyle     = effectiveScore != null
    ? getScoreStyle(effectiveScore)
    : { label: '–', color: '#BDBDBD' };
  const scoreDisplay   = effectiveScore ?? '–';

  function routeHeaderLabel(): string {
    if (metrics) return `Melhor de ${metrics.routesCompared} rota${metrics.routesCompared !== 1 ? 's' : ''}`;
    return destination ? 'Destino selecionado' : 'Localização atual';
  }

  const destinationLabel = destination
    ? (destination.name ?? destination.address)
    : address;

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

        {/* Crime dot pins — only shown when a route is active */}
        {uiMode === 'directions' && crimeEvents.map((crime, i) => (
          <MapLibreGL.PointAnnotation
            key={`crime-${i}`}
            id={`crime-${i}`}
            coordinate={[crime.lng, crime.lat]}
            onSelected={() => openCrimeModal(crime)}
          >
            <View style={styles.crimeDot} />
          </MapLibreGL.PointAnnotation>
        ))}

        {/* Shootout dot pins — only shown when a route is active */}
        {uiMode === 'directions' && shootoutEvents.map((evt, i) => (
          <MapLibreGL.PointAnnotation
            key={`shootout-${i}`}
            id={`shootout-${i}`}
            coordinate={[evt.lng, evt.lat]}
            onSelected={() => setShootoutModal({ visible: true, event: evt })}
          >
            <View style={styles.shootoutDot} />
          </MapLibreGL.PointAnnotation>
        ))}
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

      {/* Locate me — always positioned above the bottom sheet */}
      {uiMode !== 'directions' && (
        <Animated.View style={[styles.locateButtonContainer, locateButtonStyle]}>
          <TouchableOpacity
            style={[styles.locateButton, following && styles.locateButtonActive]}
            onPress={handleLocateMe}
            activeOpacity={0.8}
          >
            <MaterialIcons name="my-location" size={22} color={following ? '#4A90D9' : '#666'} />
          </TouchableOpacity>
        </Animated.View>
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
        animatedPosition={sheetY}
      >
        <BottomSheetView style={styles.sheetContent}>

          {uiMode === 'directions' && durationText ? (
            /* Directions mode: time · distance → place → routes + score */
            <View style={styles.scoreRow}>
              <Text style={styles.routeTimeText}>
                {durationText}{distanceText ? ` · ${distanceText}` : ''}
              </Text>
              <Text style={styles.addressText} numberOfLines={1}>{destinationLabel}</Text>
              <View style={styles.routeMetaRow}>
                {metrics && (
                  <Text style={styles.routeMetaText}>
                    Melhor de {metrics.routesCompared} rota{metrics.routesCompared !== 1 ? 's' : ''}
                  </Text>
                )}
                <View style={[styles.scoreDot, { backgroundColor: scoreStyle.color }]} />
                <Text style={[styles.scoreText, { color: scoreStyle.color }]}>
                  {scoreDisplay} {typeof scoreDisplay === 'number' ? scoreStyle.label : ''}
                </Text>
              </View>
            </View>
          ) : (
            /* Idle / place_selected mode: label → score → address */
            <View style={styles.scoreRow}>
              <View style={styles.locationLabelRow}>
                <Text style={styles.locationLabel}>{routeHeaderLabel()}</Text>
                <View style={[styles.scoreDot, { backgroundColor: scoreStyle.color }]} />
                <Text style={[styles.scoreText, { color: scoreStyle.color }]}>
                  {scoreDisplay} {typeof scoreDisplay === 'number' ? scoreStyle.label : ''}
                </Text>
              </View>
              <Text style={styles.addressText} numberOfLines={1}>{destinationLabel}</Text>
            </View>
          )}

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
              <MetricRow
                label="Violência Recente"
                value={shootoutScore !== null ? `${shootoutScore} / 100` : null}
                color={shootoutScore !== null ? scoreToColor(shootoutScore) : '#BDBDBD'}
                onPress={() => openMetricModal('Violência Recente')}
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

      {/* Crime event modal */}
      <Modal
        visible={crimeModal.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeCrimeModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeCrimeModal}>
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ocorrência Criminal</Text>
            {crimeModal.crime?.description ? (
              <Text style={styles.modalDescription}>{crimeModal.crime.description}</Text>
            ) : null}
            <View style={styles.crimeMetaRow}>
              <View style={styles.crimeMetaItem}>
                <MaterialIcons name="calendar-today" size={14} color="rgba(0,0,0,0.45)" />
                <Text style={styles.crimeMetaText}>{crimeModal.crime?.date ?? '—'}</Text>
              </View>
              <View style={styles.crimeMetaItem}>
                <MaterialIcons name="access-time" size={14} color="rgba(0,0,0,0.45)" />
                <Text style={styles.crimeMetaText}>{crimeModal.crime?.time ?? '—'}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.modalOkBtn} onPress={closeCrimeModal} activeOpacity={0.8}>
              <Text style={styles.modalOkText}>Okay</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Shootout event modal */}
      <Modal
        visible={shootoutModal.visible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShootoutModal({ visible: false, event: null })}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShootoutModal({ visible: false, event: null })}>
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {shootoutModal.event?.uiTitle ?? 'Ocorrência registrada nas proximidades'}
            </Text>
            <Text style={styles.modalDescription}>
              {shootoutModal.event?.uiDescription ??
                'Tiroteio registrado pelo Fogo Cruzado nas proximidades desta rota.'}
            </Text>
            <View style={styles.crimeMetaRow}>
              <View style={styles.crimeMetaItem}>
                <MaterialIcons name="calendar-today" size={14} color="rgba(0,0,0,0.45)" />
                <Text style={styles.crimeMetaText}>{shootoutModal.event?.date ?? '—'}</Text>
              </View>
              <View style={styles.crimeMetaItem}>
                <MaterialIcons name="access-time" size={14} color="rgba(0,0,0,0.45)" />
                <Text style={styles.crimeMetaText}>{shootoutModal.event?.time ?? '—'}</Text>
              </View>
            </View>
            {((shootoutModal.event?.killed ?? 0) > 0 || (shootoutModal.event?.injured ?? 0) > 0) && (
              <View style={styles.crimeMetaRow}>
                {(shootoutModal.event?.killed ?? 0) > 0 && (
                  <View style={styles.crimeMetaItem}>
                    <MaterialIcons name="person-off" size={14} color="#E05252" />
                    <Text style={[styles.crimeMetaText, { color: '#E05252' }]}>
                      {shootoutModal.event?.killed} morto{(shootoutModal.event?.killed ?? 0) !== 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
                {(shootoutModal.event?.injured ?? 0) > 0 && (
                  <View style={styles.crimeMetaItem}>
                    <MaterialIcons name="personal-injury" size={14} color="#E8A838" />
                    <Text style={[styles.crimeMetaText, { color: '#E8A838' }]}>
                      {shootoutModal.event?.injured} ferido{(shootoutModal.event?.injured ?? 0) !== 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
              </View>
            )}
            <TouchableOpacity style={styles.modalOkBtn} onPress={() => setShootoutModal({ visible: false, event: null })} activeOpacity={0.8}>
              <Text style={styles.modalOkText}>Entendi</Text>
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

  crimeDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#E05252',
    borderWidth: 2, borderColor: '#fff',
  },

  shootoutDot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#E8A838',   // amber — distinct from crime red
    borderWidth: 2, borderColor: '#fff',
  },

  locateButtonContainer: { position: 'absolute', right: 16 },
  locateButton: {
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

  // Directions-mode header hierarchy
  routeTimeText: { fontSize: 22, fontWeight: '700', color: '#1C1A18', letterSpacing: -0.3 },
  routeMetaRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  routeMetaText: { fontSize: 12, color: 'rgba(0,0,0,0.45)', flex: 1 },

  // Crime modal meta row
  crimeMetaRow:  { flexDirection: 'row', gap: 20 },
  crimeMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crimeMetaText: { fontSize: 13, color: 'rgba(0,0,0,0.65)' },

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
