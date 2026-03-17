/**
 * Paywall.tsx
 *
 * Time-pass paywall modal (Feature 1).
 * Shown after the user exhausts 3 free routes.
 *
 * Displays the three pricing tiers and triggers purchasePass().
 * The actual IAP transaction is handled in purchaseService.ts.
 */

import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  PRICING_TIERS,
  PricingTier,
  purchasePass,
} from '../services/purchaseService';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible:           boolean;
  onPurchaseSuccess: (expirationDate: Date) => void;
  onDismiss:         () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Paywall({ visible, onPurchaseSuccess, onDismiss }: Props) {
  const [selectedTier, setSelectedTier]   = useState<PricingTier>(PRICING_TIERS[1]); // default: 7 days
  const [isPurchasing, setIsPurchasing]   = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  async function handlePurchase() {
    setPurchaseError(null);
    setIsPurchasing(true);

    const result = await purchasePass(selectedTier.productId);
    setIsPurchasing(false);

    if (result.success && result.expirationDate) {
      onPurchaseSuccess(result.expirationDate);
    } else {
      setPurchaseError(result.error ?? 'Não foi possível completar a compra.');
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>

          {/* Close */}
          <TouchableOpacity style={styles.closeButton} onPress={onDismiss} hitSlop={8}>
            <MaterialIcons name="close" size={22} color="#888" />
          </TouchableOpacity>

          {/* Header */}
          <View style={styles.header}>
            <MaterialIcons name="shield" size={36} color="#E8A838" />
            <Text style={styles.title}>Acesso SalvaRota</Text>
            <Text style={styles.subtitle}>
              Você usou suas 3 rotas gratuitas.{'\n'}
              Escolha um plano para continuar.
            </Text>
          </View>

          {/* Pricing tiers */}
          <View style={styles.tiersContainer}>
            {PRICING_TIERS.map(tier => {
              const isSelected = selectedTier.productId === tier.productId;
              return (
                <TouchableOpacity
                  key={tier.productId}
                  style={[styles.tierCard, isSelected && styles.tierCardSelected]}
                  onPress={() => setSelectedTier(tier)}
                  activeOpacity={0.8}
                >
                  {tier.badge && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{tier.badge}</Text>
                    </View>
                  )}
                  <Text style={[styles.tierLabel, isSelected && styles.tierLabelSelected]}>
                    {tier.label}
                  </Text>
                  <Text style={[styles.tierPrice, isSelected && styles.tierPriceSelected]}>
                    {tier.price}
                  </Text>
                  {isSelected && (
                    <MaterialIcons name="check-circle" size={18} color="#E8A838" style={styles.checkIcon} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Error */}
          {purchaseError && (
            <Text style={styles.errorText}>{purchaseError}</Text>
          )}

          {/* CTA */}
          <TouchableOpacity
            style={[styles.ctaButton, isPurchasing && styles.ctaButtonDisabled]}
            onPress={handlePurchase}
            activeOpacity={0.8}
            disabled={isPurchasing}
          >
            {isPurchasing ? (
              <ActivityIndicator size="small" color="#1C1A18" />
            ) : (
              <>
                <MaterialIcons name="lock-open" size={18} color="#1C1A18" />
                <Text style={styles.ctaButtonText}>
                  Comprar — {selectedTier.price}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Legal disclaimer */}
          <Text style={styles.legalText}>
            Pagamento processado pela App Store. Sem renovação automática.
          </Text>

        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const PANEL_BG    = '#FAEFE9';
const SCORE_AMBER = '#E8A838';

const styles = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent:  'flex-end',
  },

  sheet: {
    backgroundColor:    PANEL_BG,
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    paddingHorizontal:  24,
    paddingTop:         20,
    paddingBottom:      40,
  },

  closeButton: {
    alignSelf:  'flex-end',
    padding:    4,
    marginBottom: 8,
  },

  header: {
    alignItems:   'center',
    marginBottom: 28,
    gap:          8,
  },
  title: {
    fontSize:   22,
    fontWeight: '700',
    color:      '#1C1A18',
    marginTop:  4,
  },
  subtitle: {
    fontSize:   14,
    color:      'rgba(0,0,0,0.55)',
    textAlign:  'center',
    lineHeight: 20,
  },

  tiersContainer: {
    flexDirection:  'row',
    gap:            10,
    marginBottom:   24,
  },

  tierCard: {
    flex:            1,
    borderRadius:    14,
    borderWidth:     2,
    borderColor:     'rgba(0,0,0,0.1)',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems:      'center',
    gap:             4,
  },
  tierCardSelected: {
    borderColor:     SCORE_AMBER,
    backgroundColor: '#FFF8EE',
  },

  badge: {
    backgroundColor: SCORE_AMBER,
    borderRadius:    8,
    paddingHorizontal: 6,
    paddingVertical:   2,
    marginBottom:    4,
  },
  badgeText: {
    fontSize:   10,
    fontWeight: '700',
    color:      '#1C1A18',
  },

  tierLabel: {
    fontSize:   13,
    fontWeight: '600',
    color:      'rgba(0,0,0,0.55)',
  },
  tierLabelSelected: {
    color: '#1C1A18',
  },

  tierPrice: {
    fontSize:   15,
    fontWeight: '700',
    color:      'rgba(0,0,0,0.4)',
  },
  tierPriceSelected: {
    color: '#1C1A18',
  },

  checkIcon: {
    marginTop: 4,
  },

  errorText: {
    fontSize:     13,
    color:        '#E05252',
    textAlign:    'center',
    marginBottom: 12,
  },

  ctaButton: {
    paddingVertical:   14,
    paddingHorizontal: 20,
    borderRadius:      999,
    backgroundColor:   SCORE_AMBER,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               8,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 2 },
    shadowOpacity:     0.15,
    shadowRadius:      6,
    elevation:         4,
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaButtonText: {
    fontSize:   16,
    fontWeight: '700',
    color:      '#1C1A18',
  },

  legalText: {
    fontSize:   11,
    color:      'rgba(0,0,0,0.35)',
    textAlign:  'center',
    marginTop:  16,
    lineHeight: 16,
  },
});
