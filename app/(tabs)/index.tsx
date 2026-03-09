import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

MapLibreGL.setAccessToken(null);

const RIO_DE_JANEIRO = [-43.1729, -22.9068];
const MAPTILER_STYLE_URL = `https://api.maptiler.com/maps/019cd357-6ec6-7605-9d2c-637be3bc2c81/style.json?key=${process.env.EXPO_PUBLIC_MAPTILER_API_KEY}`;

const PANEL_BG = '#FAEFE9';
const SCORE_COLOR = '#E8A838';

export default function MapScreen() {
  const { top } = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [following, setFollowing] = useState(false);
  const [address, setAddress] = useState('Localização atual');

  useEffect(() => {
    let subscriber: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      subscriber = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
        async (loc) => {
          const results = await Location.reverseGeocodeAsync(loc.coords);
          if (results.length > 0) {
            const r = results[0];
            const parts = [r.street, r.streetNumber].filter(Boolean);
            setAddress(parts.length > 0 ? parts.join(', ') : r.district ?? r.city ?? 'Localização atual');
          }
        }
      );
    })();

    return () => { subscriber?.remove(); };
  }, []);

  async function handleLocateMe() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;
    setFollowing(true);
  }

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
          defaultSettings={{ centerCoordinate: RIO_DE_JANEIRO, zoomLevel: 12 }}
          followUserLocation={following}
          followZoomLevel={16}
        />
        <MapLibreGL.UserLocation visible renderMode={MapLibreGL.UserLocationRenderMode.Native} />
      </MapLibreGL.MapView>

      {/* Search bar */}
      <View style={[styles.searchBar, { top: top + 12 }]}>
        <View style={styles.searchIconWrap}>
          <MaterialIcons name="location-on" size={20} color="#555" />
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Para onde?"
          placeholderTextColor="#999"
        />
        <TouchableOpacity onPress={() => router.push('/menu' as any)} hitSlop={8}>
          <MaterialIcons name="menu" size={22} color="#555" />
        </TouchableOpacity>
      </View>

      {/* Locate me button */}
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

          {/* Location + score row */}
          <View style={styles.scoreRow}>
            <View style={styles.locationLabelRow}>
              <Text style={styles.locationLabel}>Localização atual</Text>
              <View style={[styles.scoreDot, { backgroundColor: SCORE_COLOR }]} />
              <Text style={[styles.scoreText, { color: SCORE_COLOR }]}>72 Moderado</Text>
            </View>
            <Text style={styles.addressText}>{address}</Text>
          </View>

          <View style={styles.divider} />

          {/* Metrics */}
          <View style={styles.metricsGrid}>
            <MetricRow label="Crime" value="0.2" color="#E05252" />
            <MetricRow label="Iluminação" value="0.5" color={SCORE_COLOR} />
            <MetricRow label="Negócios" value="0.4" color="#5BAD6F" />
            <MetricRow label="Hora" value="0.8" color="#4A90D9" />
          </View>

        </BottomSheetView>
      </BottomSheet>
    </GestureHandlerRootView>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}: {value}</Text>
      <View style={[styles.metricDot, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  // Search bar — white card, rounded, with pin icon
  searchBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  searchIconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#111',
  },

  // Locate button — white circle, bottom right above sheet
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

  // Bottom sheet — dark background
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

  metricsGrid: {
    gap: 10,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricLabel: {
    fontSize: 13,
    color: 'rgba(0,0,0,0.6)',
  },
  metricDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
