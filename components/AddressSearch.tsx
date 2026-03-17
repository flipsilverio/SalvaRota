import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import {
  fetchAutocompleteSuggestions,
  fetchPlaceDetails,
  PlaceSuggestion,
} from '../services/placesAutocomplete';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SelectedPlace {
  lat:     number;
  lng:     number;
  address: string;
  /** Business or POI name, if applicable (e.g. "Café XYZ") */
  name?:   string;
}

interface Props {
  style?:            ViewStyle;
  onPlaceSelected:   (place: SelectedPlace) => void;
  onMenuPress:       () => void;
  /** Called when user clears the input so the parent can reset state */
  onClear?:          () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateSessionToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AddressSearch({ style, onPlaceSelected, onMenuPress, onClear }: Props) {
  const [text, setText]                         = useState('');
  const [suggestions, setSuggestions]           = useState<PlaceSuggestion[]>([]);
  const [isFocused, setIsFocused]               = useState(false);
  const [isLoadingSuggestions, setIsLoading]    = useState(false);
  const [isResolvingPlace, setIsResolving]      = useState(false);

  const inputRef      = useRef<TextInput>(null);
  const sessionToken  = useRef(generateSessionToken());
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Autocomplete fetch (debounced 400 ms) ────────────────────────────────────
  const fetchSuggestions = useCallback(async (input: string) => {
    if (input.trim().length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const results = await fetchAutocompleteSuggestions(input, sessionToken.current);
    setSuggestions(results);
    setIsLoading(false);
  }, []);

  function handleChangeText(value: string) {
    setText(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchSuggestions(value), 400);
  }

  // ── Selection ────────────────────────────────────────────────────────────────
  async function handleSelect(suggestion: PlaceSuggestion) {
    // Close keyboard + dropdown immediately for snappy feel
    setSuggestions([]);
    Keyboard.dismiss();
    setIsFocused(false);
    setText(suggestion.main_text);
    setIsResolving(true);

    const details = await fetchPlaceDetails(suggestion.place_id, sessionToken.current);
    // Rotate session token — the session ends when a detail is fetched
    sessionToken.current = generateSessionToken();

    setIsResolving(false);

    if (details) {
      onPlaceSelected({
        lat:     details.lat,
        lng:     details.lng,
        address: suggestion.description,
        name:    details.name,
      });
    }
  }

  // ── Clear ────────────────────────────────────────────────────────────────────
  function handleClear() {
    setText('');
    setSuggestions([]);
    onClear?.();
    inputRef.current?.focus();
  }

  // ── Blur (delay so a tap on suggestion registers first) ──────────────────────
  function handleBlur() {
    setTimeout(() => {
      setIsFocused(false);
      if (!text) setSuggestions([]);
    }, 180);
  }

  const showDropdown = isFocused && (isLoadingSuggestions || suggestions.length > 0);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.wrapper, style]}>

      {/* ── Search bar ── */}
      <View style={[styles.searchBar, isFocused && styles.searchBarFocused]}>
        <MaterialIcons
          name={isResolvingPlace ? 'hourglass-empty' : 'location-on'}
          size={20}
          color={isFocused ? '#E8A838' : '#888'}
        />

        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder="Para onde?"
          placeholderTextColor="#AAA"
          value={text}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="words"
        />

        {text.length > 0 ? (
          <TouchableOpacity onPress={handleClear} hitSlop={8}>
            <MaterialIcons name="close" size={20} color="#AAA" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onMenuPress} hitSlop={8}>
            <MaterialIcons name="menu" size={22} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Suggestions dropdown ── */}
      {showDropdown && (
        <View style={styles.dropdown}>
          {isLoadingSuggestions && suggestions.length === 0 ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#E8A838" />
              <Text style={styles.loadingText}>Buscando endereço…</Text>
            </View>
          ) : (
            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.place_id}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={suggestions.length > 4}
              renderItem={({ item, index }) => (
                <TouchableOpacity
                  style={[
                    styles.suggestionRow,
                    index < suggestions.length - 1 && styles.suggestionDivider,
                  ]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.65}
                >
                  <View style={styles.suggestionPin}>
                    <MaterialIcons name="place" size={16} color="#E8A838" />
                  </View>
                  <View style={styles.suggestionText}>
                    <Text style={styles.mainText} numberOfLines={1}>
                      {item.main_text}
                    </Text>
                    {item.secondary_text ? (
                      <Text style={styles.secondaryText} numberOfLines={1}>
                        {item.secondary_text}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
  },

  searchBar: {
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 4,
  },
  searchBarFocused: {
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 7,
  },

  input: {
    flex: 1,
    fontSize: 15,
    color: '#111',
  },

  dropdown: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginTop: 6,
    overflow: 'hidden',
    maxHeight: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#AAA',
  },

  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  suggestionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  suggestionPin: {
    width: 24,
    alignItems: 'center',
    marginRight: 10,
  },
  suggestionText: {
    flex: 1,
  },
  mainText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1A18',
  },
  secondaryText: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 1,
  },
});
