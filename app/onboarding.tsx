import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    body: 'Providing you with the safest route when you walk from A to B',
    buttonLabel: 'N E X T',
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
    buttonLabel: 'A T I V A R  L O C A L I Z A Ç Ã O',
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
  { emoji: '🦸', label: 'Histórico de crimes', source: 'ISP Rio / SSP-RJ', tag: 'Atualizado mensalmente', tagColor: '#c8e1e6' },
  { emoji: '🏪', label: 'Comércios abertos', source: 'OpenStreetMap', tag: 'Tempo real', tagColor: '#c1eccf' },
  { emoji: '💡', label: 'Iluminação pública', source: 'Google Places API', tag: 'Cobertura parcial', tagColor: '#b2b683' },
  { emoji: '🕐', label: 'Horário atual', source: 'Relógio do dispositivo', tag: 'Automático', tagColor: '#c8e1e6' },
];

function DataSourceCard({ emoji, label, source, tag, tagColor }: typeof DATA_SOURCES[0]) {
  return (
    <View style={styles.dataCard}>
      <Text style={styles.dataEmoji}>{emoji}</Text>
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
      <Text style={styles.dataEmoji}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.warningText}>
          <Text style={styles.warningBold}>{bold}</Text>
          <Text style={styles.warningBody}>{text}</Text>
        </Text>
      </View>
    </View>
  );
}

function Dots({ total, active }: { total: number; active: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[styles.dot, i === active && styles.dotActive]} />
      ))}
    </View>
  );
}

export default function OnboardingScreen() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  async function handleNext(step: Step) {
    if (step.id === 'location-permission') {
      await Location.requestForegroundPermissionsAsync();
    }

    if (currentIndex < STEPS.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      await AsyncStorage.setItem('onboarding_done', 'true');
      router.replace('/(tabs)');
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={STEPS}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        renderItem={({ item }) => (
          <ImageBackground
            source={{ uri: BG_IMAGE }}
            style={styles.slide}
            blurRadius={4}
          >
            <View style={styles.overlay} />
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
                    emoji="⚠️"
                    bold="Atenção: "
                    text="O SalvaRota oferece orientações baseadas em dados, mas não garante sua segurança em nenhuma circunstância. Use o bom senso sempre."
                  />
                  <WarningCard
                    emoji="🚶"
                    bold="Dica importante: "
                    text="Evite andar com o celular na mão. A maioria dos roubos acontece quando o aparelho está visível. Consulte a rota antes de sair, guarde o celular e siga em frente."
                  />
                </View>
              )}

              <View style={styles.footer}>
                {item.id !== 'splash' && <Dots total={STEPS.length - 1} active={currentIndex - 1} />}
                <TouchableOpacity onPress={() => handleNext(item)} style={styles.button} activeOpacity={0.7}>
                  <Text style={styles.buttonText}>{item.buttonLabel}</Text>
                </TouchableOpacity>
              </View>

            </SafeAreaView>
          </ImageBackground>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#33302C',
  },
  slide: {
    width,
    height,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(42, 35, 28, 0.72)',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 40,
    paddingBottom: 40,
  },
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
  dataEmoji: {
    fontSize: 20,
    width: 32,
    textAlign: 'center',
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
  footer: {
    alignItems: 'center',
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
  },
});
