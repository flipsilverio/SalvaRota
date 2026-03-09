import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import MapLibreGL from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useState, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

MapLibreGL.setAccessToken(null);

const RIO_DE_JANEIRO = [-43.1729, -22.9068];
const MAPTILER_STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${process.env.EXPO_PUBLIC_MAPTILER_API_KEY}`;

export default function MapScreen() {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [following, setFollowing] = useState(false);

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

      <View style={styles.locateButton}>
        <TouchableOpacity
          style={[styles.locateButtonInner, following && styles.locateButtonActive]}
          onPress={handleLocateMe}
          activeOpacity={0.8}
        >
          <Text style={[styles.locateIcon, following && styles.locateIconActive]}>◎</Text>
        </TouchableOpacity>
      </View>

      <BottomSheet
        ref={bottomSheetRef}
        index={1}
        snapPoints={['15%', '40%', '85%']}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Rio de Janeiro</Text>
          <Text style={styles.sheetSubtitle}>Explore the city</Text>
        </BottomSheetView>
      </BottomSheet>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  locateButton: {
    position: 'absolute',
    right: 12,
    bottom: '16%',
  },
  locateButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  locateButtonActive: {
    backgroundColor: '#fff',
  },
  locateIcon: {
    fontSize: 22,
    color: '#666',
  },
  locateIconActive: {
    color: '#4A90D9',
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 15,
    color: '#666',
  },
});
