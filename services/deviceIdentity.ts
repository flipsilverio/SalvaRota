/**
 * deviceIdentity.ts
 *
 * Lightweight, privacy-friendly device fingerprint (Feature 3).
 *
 * Approach:
 *   - Generate a UUID on first launch and persist it in AsyncStorage.
 *   - Hash the UUID before storing or sending it to avoid exposing the raw ID.
 *   - No personal data is collected.
 *   - Survives app updates but is reset on a full uninstall/reinstall
 *     (AsyncStorage is cleared on uninstall on Android; on iOS it may persist
 *     if iCloud backup is enabled).
 *
 * TODO (upgrade path):
 *   Install expo-secure-store (`npx expo install expo-secure-store`)
 *   and replace AsyncStorage with SecureStore.getItemAsync /
 *   SecureStore.setItemAsync. This makes the ID persist after reinstall on iOS
 *   because Keychain data is NOT cleared on uninstall.
 *
 *   Also install expo-application and replace the UUID generation with:
 *     Application.getIosIdForVendorAsync()   // IDFV — best option
 *   Then hash the IDFV before storing.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@salvarota/device_id';

// ── Simple djb2-style hash (no dependencies) ──────────────────────────────────

function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0; // keep unsigned 32-bit
  }
  // Return as hex, padded to 8 chars
  return hash.toString(16).padStart(8, '0');
}

// ── UUID v4 generator (no crypto dependency required) ─────────────────────────

function generateUUID(): string {
  // Use crypto.getRandomValues if available (React Native 0.69+ / Hermes)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant bits
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join('-');
  }

  // Fallback for environments without crypto
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

let _cachedId: string | null = null;

/**
 * Returns a stable, hashed device identifier.
 * Generated on first call and cached in memory + AsyncStorage.
 *
 * The returned value is a hex hash (not the raw UUID) — safe to log or send
 * to the backend for abuse prevention without exposing any personal data.
 */
export async function getHashedDeviceId(): Promise<string> {
  if (_cachedId) return _cachedId;

  try {
    let raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = generateUUID();
      await AsyncStorage.setItem(STORAGE_KEY, raw);
    }
    _cachedId = hashString(raw);
    return _cachedId;
  } catch (err) {
    console.warn('[DeviceIdentity] Could not read/write device ID:', err);
    // Return a session-only ID so the app doesn't break
    const sessionId = hashString(generateUUID());
    _cachedId = sessionId;
    return sessionId;
  }
}
