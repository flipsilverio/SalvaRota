import BottomSheet, { BottomSheetView } from '@gorhom/bottom-sheet';
import MapLibreGL from '@maplibre/maplibre-react-native';
import { useRef } from 'react';
import { StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

MapLibreGL.setAccessToken(null);

const RIO_DE_JANEIRO = [-43.1729, -22.9068];
const MAPTILER_STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${process.env.EXPO_PUBLIC_MAPTILER_API_KEY}`;

export default function MapScreen() {
  const bottomSheetRef = useRef<BottomSheet>(null);

  return (
    <GestureHandlerRootView style={styles.container}>
      <MapLibreGL.MapView style={styles.map} styleURL={MAPTILER_STYLE_URL}>
        <MapLibreGL.Camera
          zoomLevel={12}
          centerCoordinate={RIO_DE_JANEIRO}
          animationMode="none"
        />
      </MapLibreGL.MapView>

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
