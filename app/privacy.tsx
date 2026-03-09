import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AnimatedGradient from '@/components/AnimatedGradient';

const SECTIONS = [
  {
    title: 'O que coletamos',
    body: 'Coletamos sua localização GPS em tempo real exclusivamente enquanto o app está aberto e em uso ativo. Não armazenamos histórico de rotas, não rastreamos seus movimentos em segundo plano e não associamos dados de localização ao seu perfil.',
  },
  {
    title: 'Como usamos',
    body: 'Sua localização é usada apenas para calcular a rota mais segura entre dois pontos. Os dados são processados localmente no seu dispositivo e nas chamadas às APIs de fontes públicas (ISP Rio, OpenStreetMap, Google Places). Nenhuma informação pessoal é compartilhada com terceiros.',
  },
  {
    title: 'Fontes de dados públicos',
    body: 'Utilizamos dados de criminalidade do ISP Rio / SSP-RJ, dados de estabelecimentos do OpenStreetMap e dados de iluminação da Google Places API. Estas fontes são públicas e acessadas de forma agregada, sem cruzamento com dados pessoais.',
  },
  {
    title: 'Retenção de dados',
    body: 'Não retemos dados de localização após o encerramento da sessão. Preferências do app (como a conclusão do onboarding) são armazenadas localmente no seu dispositivo e podem ser apagadas a qualquer momento ao desinstalar o app.',
  },
  {
    title: 'Seus direitos',
    body: 'Você pode revogar o acesso à localização a qualquer momento em Configurações > Privacidade > Localização. O app continuará funcionando com funcionalidade reduzida. Para dúvidas ou solicitações relacionadas a dados pessoais, entre em contato pelo e-mail privacidade@salvarota.app.',
  },
];

export default function PrivacyScreen() {
  return (
    <View style={styles.container}>
      <AnimatedGradient />
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Política de{'\n'}Privacidade</Text>
          <Text style={styles.updated}>Atualizado em março de 2026</Text>

          {SECTIONS.map((s) => (
            <View key={s.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              <Text style={styles.sectionBody}>{s.body}</Text>
            </View>
          ))}

          <Text style={styles.footer}>SalvaRota · Rio de Janeiro, Brasil</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2A231C' },
  safeArea: { flex: 1, paddingHorizontal: 28, paddingTop: 16 },
  backBtn: { marginBottom: 28 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', lineHeight: 34, marginBottom: 8 },
  updated: { color: 'rgba(255,255,255,0.3)', fontSize: 13, marginBottom: 36 },
  section: { marginBottom: 28 },
  sectionTitle: { color: '#E8A838', fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: 8 },
  sectionBody: { color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 24 },
  footer: { color: 'rgba(255,255,255,0.15)', fontSize: 12, textAlign: 'center', paddingVertical: 32 },
});
