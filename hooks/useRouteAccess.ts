/**
 * useRouteAccess.ts
 *
 * Controls access to route calculation based on:
 *   1. Free route allowance (3 routes)
 *   2. Active time-pass
 *
 * Free usage logic (Feature 5):
 *   freeRoutesRemaining = 3
 *   if freeRoutesRemaining > 0 → allow, decrement
 *   else if passIsActive       → allow
 *   else                       → show paywall
 *
 * Storage note:
 *   Currently uses AsyncStorage (available without native rebuild).
 *   TODO: Replace with expo-secure-store after running:
 *     npx expo install expo-secure-store && cd ios && pod install
 *   SecureStore uses iOS Keychain so the count persists after reinstall,
 *   which makes it much harder for users to reset their free quota.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import {
  loadPassState,
  savePassState,
} from '../services/purchaseService';

// ── Constants ─────────────────────────────────────────────────────────────────

const FREE_ROUTES_KEY     = '@salvarota/freeRoutesRemaining';
const FREE_ROUTES_INITIAL = 3;

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface RouteAccessState {
  /** How many free routes are left. null while loading. */
  freeRoutesRemaining: number | null;
  /** Whether the user has an active paid pass */
  passIsActive:        boolean;
  /** Whether the paywall should be visible */
  showPaywall:         boolean;
  /** Call before starting a route calculation. Returns true if allowed. */
  requestRouteAccess: () => Promise<boolean>;
  /** Called after a successful purchase to persist pass state */
  onPurchaseComplete: (expirationDate: Date) => Promise<void>;
  /** Dismiss the paywall without purchasing */
  dismissPaywall:     () => void;
}

export function useRouteAccess(): RouteAccessState {
  const [freeRoutesRemaining, setFreeRoutesRemaining] = useState<number | null>(null);
  const [passIsActive, setPassIsActive]               = useState(false);
  const [showPaywall, setShowPaywall]                 = useState(false);

  // ── Load persisted state on mount ────────────────────────────────────────

  useEffect(() => {
    (async () => {
      const [freeStr, passState] = await Promise.all([
        AsyncStorage.getItem(FREE_ROUTES_KEY),
        loadPassState(),
      ]);

      const free = freeStr !== null ? parseInt(freeStr, 10) : FREE_ROUTES_INITIAL;
      setFreeRoutesRemaining(isNaN(free) ? FREE_ROUTES_INITIAL : free);
      setPassIsActive(passState.isActive);
    })();
  }, []);

  // ── Check access and consume a free route if applicable ──────────────────

  const requestRouteAccess = useCallback(async (): Promise<boolean> => {
    // Always allow if pass is active
    if (passIsActive) return true;

    const remaining = freeRoutesRemaining ?? FREE_ROUTES_INITIAL;

    if (remaining > 0) {
      const next = remaining - 1;
      setFreeRoutesRemaining(next);
      await AsyncStorage.setItem(FREE_ROUTES_KEY, String(next));
      return true;
    }

    // No free routes left and no active pass
    setShowPaywall(true);
    return false;
  }, [passIsActive, freeRoutesRemaining]);

  // ── Handle successful purchase ────────────────────────────────────────────

  const onPurchaseComplete = useCallback(async (expirationDate: Date): Promise<void> => {
    await savePassState(expirationDate);
    setPassIsActive(true);
    setShowPaywall(false);
  }, []);

  // ── Dismiss paywall ───────────────────────────────────────────────────────

  const dismissPaywall = useCallback(() => {
    setShowPaywall(false);
  }, []);

  return {
    freeRoutesRemaining,
    passIsActive,
    showPaywall,
    requestRouteAccess,
    onPurchaseComplete,
    dismissPaywall,
  };
}
