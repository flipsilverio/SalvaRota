import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AnimatedGradient from '@/components/AnimatedGradient';

const SECTIONS = [
  {
    title: 'Aceitação',
    body: 'Ao usar o SalvaRota, você concorda com estes termos. Se não concordar, não utilize o app. O uso continuado após alterações nos termos implica aceitação das mudanças.',
  },
  {
    title: 'Natureza do serviço',
    body: 'O SalvaRota é uma ferramenta de orientação baseada em dados públicos. As sugestões de rota são indicativas e não substituem o julgamento pessoal. O app não garante segurança em nenhuma circunstância. Use sempre o bom senso.',
  },
  {
    title: 'Limitação de responsabilidade',
    body: 'O SalvaRota não se responsabiliza por danos diretos, indiretos ou incidentais decorrentes do uso ou incapacidade de uso do app, incluindo situações em que uma rota sugerida tenha resultado em inconveniente ou dano ao usuário.',
  },
  {
    title: 'Precisão dos dados',
    body: 'Os dados de criminalidade, iluminação e estabelecimentos são obtidos de fontes públicas e podem estar desatualizados ou incompletos. O SalvaRota não garante a precisão ou completude dessas informações.',
  },
  {
    title: 'Uso permitido',
    body: 'O app é destinado exclusivamente ao uso pessoal e não comercial. É proibido usar, copiar, modificar ou distribuir o app ou seu conteúdo para fins comerciais sem autorização prévia por escrito.',
  },
  {
    title: 'Alterações',
    body: 'Reservamo-nos o direito de modificar estes termos a qualquer momento. Notificações de mudanças significativas serão exibidas no app. A data da última atualização estará sempre indicada abaixo.',
  },
];

export default function TermsScreen() {
  return (
    <View style={styles.container}>
      <AnimatedGradient />
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Termos{'\n'}de uso</Text>
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
