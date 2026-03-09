import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AnimatedGradient from '@/components/AnimatedGradient';

const CATEGORIES = ['Rota incorreta', 'Dado desatualizado', 'Bug no app', 'Outro'];

export default function ReportScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  function handleSend() {
    if (!selected) return;
    setSent(true);
  }

  return (
    <View style={styles.container}>
      <AnimatedGradient />
      <SafeAreaView style={styles.inner}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={22} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        <Text style={styles.title}>Reportar um{'\n'}problema</Text>

        {sent ? (
          <View style={styles.successBlock}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Recebemos seu reporte</Text>
            <Text style={styles.successBody}>Obrigado. Usamos cada reporte para melhorar o SalvaRota.</Text>
            <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()}>
              <Text style={styles.doneBtnText}>Voltar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <Text style={styles.sectionLabel}>Categoria</Text>
            <View style={styles.categories}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, selected === c && styles.chipActive]}
                  onPress={() => setSelected(c)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, selected === c && styles.chipTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>Descrição <Text style={styles.optional}>(opcional)</Text></Text>
            <TextInput
              style={styles.input}
              multiline
              numberOfLines={5}
              placeholder="Descreva o problema com mais detalhes..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={message}
              onChangeText={setMessage}
              textAlignVertical="top"
            />

            <TouchableOpacity
              style={[styles.sendBtn, !selected && styles.sendBtnDisabled]}
              onPress={handleSend}
              activeOpacity={0.8}
            >
              <Text style={styles.sendBtnText}>Enviar reporte</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2A231C' },
  inner: { flex: 1, paddingHorizontal: 28, paddingTop: 16 },
  backBtn: { marginBottom: 28 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', lineHeight: 34, marginBottom: 36 },
  sectionLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 12, letterSpacing: 1, marginBottom: 12, marginTop: 8 },
  optional: { color: 'rgba(255,255,255,0.25)', fontWeight: '400' },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 28 },
  chip: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
  },
  chipActive: { borderColor: '#E8A838', backgroundColor: 'rgba(232,168,56,0.12)' },
  chipText: { color: 'rgba(255,255,255,0.55)', fontSize: 14 },
  chipTextActive: { color: '#E8A838' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 15,
    minHeight: 120,
    marginBottom: 28,
  },
  sendBtn: {
    backgroundColor: '#E8A838',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
  sendBtnText: { color: '#1C1915', fontWeight: '700', fontSize: 16 },
  successBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  successIcon: { fontSize: 48, color: '#E8A838' },
  successTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  successBody: { color: 'rgba(255,255,255,0.5)', fontSize: 15, textAlign: 'center', paddingHorizontal: 20 },
  doneBtn: { marginTop: 16, paddingVertical: 14, paddingHorizontal: 40, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12 },
  doneBtnText: { color: '#fff', fontSize: 16 },
});
