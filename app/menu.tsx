import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AnimatedGradient from '@/components/AnimatedGradient';

const ITEMS = [
  { label: 'Como funciona', icon: 'info-outline' as const, route: 'onboarding' as const },
  { label: 'Reportar um problema', icon: 'flag' as const, route: 'report' as const },
  { label: 'Privacidade', icon: 'lock-outline' as const, route: 'privacy' as const },
  { label: 'Termos de uso', icon: 'description' as const, route: 'terms' as const },
];

export default function MenuScreen() {
  function handleItem(route: string) {
    if (route === 'onboarding') {
      router.replace('/onboarding' as any);
    } else {
      router.push(`/${route}` as any);
    }
  }

  return (
    <View style={styles.container}>
      <AnimatedGradient />
      <SafeAreaView style={styles.inner}>
        <View style={styles.header}>
          <View>
            <Text style={styles.logo}>Salva<Text style={styles.logoRota}>rota</Text><Text style={styles.reg}>®</Text></Text>
            <Text style={styles.tagline}>A rota mais segura do Rio.</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <MaterialIcons name="close" size={24} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>

        <View style={styles.list}>
          {ITEMS.map((item, i) => (
            <View key={item.route}>
              <TouchableOpacity style={styles.item} onPress={() => handleItem(item.route)} activeOpacity={0.7}>
                <MaterialIcons name={item.icon} size={20} color="rgba(255,255,255,0.5)" />
                <Text style={styles.itemLabel}>{item.label}</Text>
                <MaterialIcons name="chevron-right" size={20} color="rgba(255,255,255,0.25)" />
              </TouchableOpacity>
              {i < ITEMS.length - 1 && <View style={styles.separator} />}
            </View>
          ))}
        </View>

        <Text style={styles.version}>SalvaRota v1.0 · Rio de Janeiro</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2A231C' },
  inner: { flex: 1, paddingHorizontal: 28 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 24,
    paddingBottom: 48,
  },
  logo: { color: '#fff', fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  logoRota: { fontWeight: '300' },
  reg: { fontSize: 14, fontWeight: '400' },
  tagline: { color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 2 },
  closeBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  list: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  itemLabel: { flex: 1, color: '#fff', fontSize: 16 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginLeft: 54 },
  version: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 'auto',
    paddingBottom: 16,
  },
});
