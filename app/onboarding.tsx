import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import AnimatedGradient from '@/components/AnimatedGradient';

const { width, height } = Dimensions.get('window');

const BG_IMAGE = 'https://www.figma.com/api/mcp/asset/2362da91-7214-4d07-82b4-0c2f0074bd44';

type Step = {
  id: string;
  title: string;
  subtitle?: string;
  body?: string;
  buttonLabel: string;
  content?: 'dataSources' | 'warnings';
};

const STEPS: Step[] = [
  {
    id: 'splash',
    title: 'Salva\nrota',
    body: 'O caminho mais seguro de A a B.',
    buttonLabel: 'C O M E Ç A R',
  },
  {
    id: 'location-why',
    title: 'Vamos precisar de\nsaber onde você está',
    body: 'Para calcular a rota mais segura, precisamos da sua localização em tempo real. Seus dados são usados apenas durante a navegação e nunca são compartilhados.',
    buttonLabel: 'C O N T I N U A R',
  },
  {
    id: 'location-permission',
    title: 'Permitir acesso\nà localização',
    body: 'Toque em "Permitir" na próxima tela. Usamos sua localização apenas enquanto você navega pelo app.',
    buttonLabel: 'ATIVAR\nLOCALIZAÇÃO',
  },
  {
    id: 'data-sources',
    title: 'Como calculamos\nsua segurança',
    subtitle: 'Somos transparentes. Seu score é calculado com dados reais de fontes públicas:',
    buttonLabel: 'E N T E N D I',
    content: 'dataSources',
  },
  {
    id: 'ready',
    title: 'Tudo pronto.',
    subtitle: 'Agora você tem informações para se movimentar melhor pelas ruas do Rio de Janeiro.',
    buttonLabel: 'E N T E N D I',
    content: 'warnings',
  },
];

const DATA_SOURCES = [
  { emoji: 'security',         label: 'Histórico de crimes',   source: 'ISP Rio / SSP-RJ',          tag: 'Atualizado mensalmente', tagColor: '#c8e1e6' },
  { emoji: 'storefront',       label: 'Comércios abertos',     source: 'OpenStreetMap',             tag: 'Tempo\nreal',            tagColor: '#c1eccf' },
  { emoji: 'wb-incandescent',  label: 'Iluminação pública',    source: 'Google Places API',         tag: 'Cobertura\nparcial',    tagColor: '#b2b683' },
  { emoji: 'schedule',         label: 'Horário atual',         source: 'Relógio do dispositivo',    tag: 'Automático',            tagColor: '#c8e1e6' },
];

function Emoji({ name }: { name: string }) {
  return (
    <View style={styles.emojiWrapper}>
      <MaterialIcons name={name as any} size={22} color="#fff" />
    </View>
  );
}

function DataSourceCard({ emoji, label, source, tag, tagColor }: typeof DATA_SOURCES[0]) {
  return (
    <View style={styles.dataCard}>
      <Emoji name={emoji} />
      <View style={styles.dataTextBlock}>
        <Text style={styles.dataLabel}>{label}</Text>
        <Text style={styles.dataSource}>{source}</Text>
      </View>
      <View style={[styles.dataTag, { borderColor: tagColor }]}>
        <Text style={[styles.dataTagText, { color: tagColor }]}>{tag}</Text>
      </View>
    </View>
  );
}

function WarningCard({ emoji, bold, text }: { emoji: string; bold: string; text: string }) {
  return (
    <View style={styles.dataCard}>
      <Emoji name={emoji} />
      <View style={{ flex: 1 }}>
        <Text style={styles.warningText}>
          <Text style={styles.warningBold}>{bold}</Text>
          <Text style={styles.warningBody}>{text}</Text>
        </Text>
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [currentIndex, setCurrentIndex] = useState(0);

  const photoOpacity = scrollX.interpolate({
    inputRange: [0, width * 0.8],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  function goTo(index: number) {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
  }

  function handleDotPress() {
    if (currentIndex < STEPS.length - 1) goTo(currentIndex + 1);
  }

  async function handleNext(step: Step) {
    if (step.id === 'location-permission') {
      await Location.requestForegroundPermissionsAsync();
    }
    if (currentIndex < STEPS.length - 1) {
      goTo(currentIndex + 1);
    } else {
      await AsyncStorage.setItem('onboarding_done', 'true');
      router.replace('/(tabs)');
    }
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setCurrentIndex(index);
  }

  return (
    <View style={styles.container}>
      {/* Fixed backgrounds */}
      <AnimatedGradient />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: photoOpacity }]}>
        <ImageBackground source={{ uri: BG_IMAGE }} style={StyleSheet.absoluteFill} blurRadius={4}>
          <View style={styles.overlay} />
        </ImageBackground>
      </Animated.View>

      {/* Sliding content only */}
      <Animated.ScrollView
        ref={scrollRef as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true, listener: handleScroll }
        )}
        style={{ flex: 1 }}
      >
        {STEPS.map((item) => (
          <View key={item.id} style={styles.page}>
            <SafeAreaView style={styles.safeArea}>

              {item.id === 'splash' ? (
                <View style={styles.splashTitleBlock}>
                  <Text style={styles.splashTitle}>{item.title}</Text>
                  <Text style={styles.splashRegistered}>®</Text>
                </View>
              ) : (
                <Text style={styles.title}>{item.title}</Text>
              )}

              {item.subtitle ? (
                <Text style={styles.body}>{item.subtitle}</Text>
              ) : item.body ? (
                <Text style={[styles.body, item.id === 'splash' && styles.bodyRight]}>{item.body}</Text>
              ) : null}

              {item.content === 'dataSources' && (
                <View style={styles.cardsBlock}>
                  {DATA_SOURCES.map((ds) => (
                    <DataSourceCard key={ds.label} {...ds} />
                  ))}
                </View>
              )}

              {item.content === 'warnings' && (
                <View style={styles.cardsBlock}>
                  <WarningCard
                    emoji="warning-amber"
                    bold="Atenção: "
                    text="O SalvaRota oferece orientações baseadas em dados, mas não garante sua segurança em nenhuma circunstância. Use o bom senso sempre."
                  />
                  <WarningCard
                    emoji="directions-walk"
                    bold="Dica importante: "
                    text="Evite andar com o celular na mão. A maioria dos roubos acontece quando o aparelho está visível. Consulte a rota antes de sair, guarde o celular e siga em frente."
                  />
                </View>
              )}

              <View style={styles.footer}>
                {item.id !== 'splash' && (
                  <View style={styles.dots}>
                    {STEPS.slice(1).map((_, i) => (
                      <TouchableOpacity key={i} onPress={handleDotPress} hitSlop={10}>
                        <View style={[styles.dot, i === currentIndex - 1 && styles.dotActive]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <TouchableOpacity
                  onPress={() => handleNext(item)}
                  style={styles.button}
                  activeOpacity={0.7}
                >
                  <Text style={styles.buttonText}>{item.buttonLabel}</Text>
                </TouchableOpacity>
              </View>

            </SafeAreaView>
          </View>
        ))}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2A231C',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(42, 35, 28, 0.72)',
  },
  page: {
    width,
    height,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 40,
    paddingBottom: 40,
  },

  // Splash
  splashTitleBlock: {
    position: 'absolute',
    right: 40,
    top: '42%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  splashTitle: {
    color: '#fff',
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.32,
    textAlign: 'right',
  },
  splashRegistered: {
    color: '#fff',
    fontSize: 14,
    marginTop: 2,
  },

  // Inner screens
  title: {
    color: '#fff',
    fontSize: 20,
    letterSpacing: 4.6,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 28,
  },
  body: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 32,
    opacity: 0.9,
  },
  bodyRight: {
    textAlign: 'right',
    position: 'absolute',
    bottom: 200,
    right: 40,
    width: 257,
  },

  // Data source cards
  cardsBlock: {
    gap: 12,
    marginBottom: 32,
  },
  dataCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(217,217,217,0.15)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    gap: 12,
  },
  emojiWrapper: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dataTextBlock: {
    flex: 1,
    gap: 3,
  },
  dataLabel: {
    color: '#fff',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  dataSource: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  dataTag: {
    borderWidth: 1,
    borderRadius: 6,
    width: 90,
    paddingVertical: 6,
    alignItems: 'center',
  },
  dataTagText: {
    fontSize: 10,
    textAlign: 'center',
  },
  warningText: {
    fontSize: 12,
    lineHeight: 18,
  },
  warningBold: {
    color: '#fff',
    fontWeight: '600',
  },
  warningBody: {
    color: '#b9b8b8',
    fontWeight: '400',
  },

  // Footer
  footer: {
    alignItems: 'center',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 32,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 20,
  },
  button: {
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    letterSpacing: 4,
    textAlign: 'center',
  },
});
