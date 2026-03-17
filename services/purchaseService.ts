/**
 * purchaseService.ts
 *
 * In-App Purchase scaffold for SalvaRota time-pass monetization (Features 1–4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SETUP REQUIRED — before this service is functional:
 *
 * 1. Install a native IAP library:
 *      npx expo install react-native-iap
 *      cd ios && pod install
 *
 * 2. Create products in App Store Connect:
 *      com.salvarota.pass.3days   → Consumable or Non-Renewing Subscription
 *      com.salvarota.pass.7days
 *      com.salvarota.pass.30days
 *
 * 3. Install expo-secure-store for Keychain storage (Feature 2):
 *      npx expo install expo-secure-store
 *      cd ios && pod install
 *    Then replace AsyncStorage calls below with SecureStore equivalents.
 *
 * 4. Set up a backend endpoint for server-side receipt validation (Feature 4):
 *      POST /validate-receipt
 *      Body: { receipt: string, deviceId: string }
 *      Response: { isActive: boolean, expirationDate: string }
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Until the above is done, purchasePass() is a stub that simulates a successful
 * purchase (useful for UI development and testing the paywall flow).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Product IDs ───────────────────────────────────────────────────────────────

export const PRODUCT_IDS = {
  PASS_3_DAYS:  'com.salvarota.pass.3days',
  PASS_7_DAYS:  'com.salvarota.pass.7days',
  PASS_30_DAYS: 'com.salvarota.pass.30days',
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

// ── Pricing tiers ─────────────────────────────────────────────────────────────

export interface PricingTier {
  productId:   ProductId;
  label:       string;
  price:       string;
  durationDays: number;
  badge?:      string;
}

export const PRICING_TIERS: PricingTier[] = [
  { productId: PRODUCT_IDS.PASS_3_DAYS,  label: '3 dias',  price: 'R$ 19,99', durationDays: 3 },
  { productId: PRODUCT_IDS.PASS_7_DAYS,  label: '7 dias',  price: 'R$ 29,99', durationDays: 7,  badge: 'Popular' },
  { productId: PRODUCT_IDS.PASS_30_DAYS, label: '30 dias', price: 'R$ 59,99', durationDays: 30 },
];

// ── Storage keys ──────────────────────────────────────────────────────────────
// TODO: Replace AsyncStorage with expo-secure-store (Keychain) for production.
// SecureStore keys persist after uninstall on iOS, making them much harder to abuse.

const PASS_EXPIRY_KEY  = '@salvarota/passExpirationDate';
const PASS_STATUS_KEY  = '@salvarota/purchaseStatus'; // 'active' | 'inactive'

// ── Pass state ────────────────────────────────────────────────────────────────

export interface PassState {
  isActive:       boolean;
  expirationDate: Date | null;
}

/**
 * Load the current pass state from storage.
 * Validates that the stored expiration date is in the future.
 */
export async function loadPassState(): Promise<PassState> {
  try {
    const [status, expiryStr] = await Promise.all([
      AsyncStorage.getItem(PASS_STATUS_KEY),
      AsyncStorage.getItem(PASS_EXPIRY_KEY),
    ]);

    if (status !== 'active' || !expiryStr) {
      return { isActive: false, expirationDate: null };
    }

    const expirationDate = new Date(expiryStr);
    const isActive = expirationDate > new Date();

    // Clean up expired passes
    if (!isActive) {
      await AsyncStorage.setItem(PASS_STATUS_KEY, 'inactive');
    }

    return { isActive, expirationDate: isActive ? expirationDate : null };
  } catch (err) {
    console.warn('[Purchase] Could not load pass state:', err);
    return { isActive: false, expirationDate: null };
  }
}

/**
 * Persist a validated pass to local storage.
 */
export async function savePassState(expirationDate: Date): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(PASS_STATUS_KEY, 'active'),
    AsyncStorage.setItem(PASS_EXPIRY_KEY, expirationDate.toISOString()),
  ]);
}

// ── Purchase flow ─────────────────────────────────────────────────────────────

export interface PurchaseResult {
  success:        boolean;
  expirationDate: Date | null;
  error?:         string;
}

/**
 * Initiate an In-App Purchase for the given product.
 *
 * TODO: Replace the stub below with real IAP logic:
 *
 *   import { requestPurchase, getProducts } from 'react-native-iap';
 *
 *   const products = await getProducts({ skus: [productId] });
 *   const purchase = await requestPurchase({ sku: productId });
 *   const receipt  = purchase.transactionReceipt;
 *
 *   // Server-side validation (Feature 4)
 *   const validation = await validateReceiptWithServer(receipt, deviceId);
 *   if (validation.isActive) {
 *     await savePassState(new Date(validation.expirationDate));
 *     return { success: true, expirationDate: new Date(validation.expirationDate) };
 *   }
 *   return { success: false, expirationDate: null, error: 'Receipt validation failed' };
 */
export async function purchasePass(productId: ProductId): Promise<PurchaseResult> {
  const tier = PRICING_TIERS.find(t => t.productId === productId);
  if (!tier) return { success: false, expirationDate: null, error: 'Unknown product' };

  // ── STUB: simulate a successful purchase ──────────────────────────────────
  // Remove this block and implement real IAP when ready.
  console.warn('[Purchase] STUB — simulating purchase for', productId);
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + tier.durationDays);
  await savePassState(expirationDate);
  return { success: true, expirationDate };
  // ── END STUB ──────────────────────────────────────────────────────────────
}

// ── Server-side receipt validation (Feature 4) ───────────────────────────────

/**
 * Validate a purchase receipt with the SalvaRota backend.
 *
 * The server forwards the receipt to Apple's verifyReceipt endpoint and
 * returns a clean { isActive, expirationDate } response.
 *
 * Falls back to local state if the network is unavailable.
 */
export async function validateReceiptWithServer(
  receipt:  string,
  deviceId: string,
): Promise<{ isActive: boolean; expirationDate: string } | null> {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

  try {
    const res = await fetch(`${apiUrl}/validate-receipt`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ receipt, deviceId }),
    });

    if (!res.ok) {
      console.warn('[Purchase] Receipt validation HTTP error:', res.status);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.warn('[Purchase] Receipt validation error (offline?):', err);
    return null; // caller falls back to local state
  }
}
