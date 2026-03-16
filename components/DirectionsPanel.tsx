import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
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
import { SelectedPlace } from './AddressSearch';

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveField = 'from' | 'to' | null;

interface Props {
  /** Initial display text for the "From" field */
  fromAddress: string;
  /** Initial display text for the "To" field */
  toAddress:   string;
  onFromChange: (place: SelectedPlace) => void;
  onToChange:   (place: SelectedPlace) => void;
  /** Swap From ↔ To */
  onSwap: () => void;
  onClose: () => void;
  /** Override wrapper position (e.g. { top: insets.top + 12 }) */
  style?: ViewStyle;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DirectionsPanel({
  fromAddress,
  toAddress,
  onFromChange,
  onToChange,
  onSwap,
  onClose,
  style,
}: Props) {
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [fromText, setFromText]       = useState(fromAddress);
  const [toText, setToText]           = useState(toAddress);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading]     = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const sessionToken = useRef(generateToken());
  const debounce     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync text fields when parent swaps or updates addresses
  useEffect(() => { setFromText(fromAddress); }, [fromAddress]);
  useEffect(() => { setToText(toAddress); }, [toAddress]);

  // ── Autocomplete ─────────────────────────────────────────────────────────

  async function fetchSuggestions(input: string) {
    if (input.trim().length < 2) { setSuggestions([]); setIsLoading(false); return; }
    setIsLoading(true);
    const results = await fetchAutocompleteSuggestions(input, sessionToken.current);
    setSuggestions(results);
    setIsLoading(false);
  }

  function handleTextChange(field: ActiveField, value: string) {
    if (field === 'from') setFromText(value);
    else setToText(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => fetchSuggestions(value), 400);
  }

  // ── Selection ────────────────────────────────────────────────────────────

  async function handleSelect(suggestion: PlaceSuggestion) {
    setSuggestions([]);
    Keyboard.dismiss();
    setIsResolving(true);

    const details = await fetchPlaceDetails(suggestion.place_id, sessionToken.current);
    sessionToken.current = generateToken();
    setIsResolving(false);

    if (!details) return;

    const place: SelectedPlace = {
      lat:     details.lat,
      lng:     details.lng,
      address: suggestion.description,
    };

    if (activeField === 'from') {
      setFromText(suggestion.main_text);
      onFromChange(place);
    } else {
      setToText(suggestion.main_text);
      onToChange(place);
    }

    setActiveField(null);
  }

  // ── Blur (delay so suggestion tap registers first) ────────────────────────

  function handleBlur(field: ActiveField) {
    setTimeout(() => {
      setActiveField((current) => (current === field ? null : current));
    }, 180);
  }

  const showDropdown = activeField !== null && (isLoading || suggestions.length > 0);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.wrapper, style]}>

      {/* ── Panel card ── */}
      <View style={styles.panel}>

        {/* Back */}
        <TouchableOpacity onPress={onClose} style={styles.backButton} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>

        {/* From / To fields */}
        <View style={styles.fields}>

          {/* From */}
          <View style={styles.fieldRow}>
            <View style={[styles.dot, styles.dotFrom]} />
            <TextInput
              style={styles.fieldInput}
              value={fromText}
              onChangeText={(v) => handleTextChange('from', v)}
              onFocus={() => setActiveField('from')}
              onBlur={() => handleBlur('from')}
              placeholder="De onde?"
              placeholderTextColor="#AAA"
              autoCorrect={false}
              autoCapitalize="words"
            />
          </View>

          {/* Connector + swap button */}
          <View style={styles.connectorRow}>
            <View style={styles.connectorDots} />
            <TouchableOpacity onPress={onSwap} style={styles.swapButton} hitSlop={8}>
              <MaterialIcons name="swap-vert" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* To */}
          <View style={styles.fieldRow}>
            <View style={[styles.dot, styles.dotTo]} />
            <TextInput
              style={styles.fieldInput}
              value={toText}
              onChangeText={(v) => handleTextChange('to', v)}
              onFocus={() => setActiveField('to')}
              onBlur={() => handleBlur('to')}
              placeholder="Para onde?"
              placeholderTextColor="#AAA"
              autoCorrect={false}
              autoCapitalize="words"
            />
            {isResolving && (
              <ActivityIndicator size="small" color="#E8A838" style={styles.resolveSpinner} />
            )}
          </View>

        </View>
      </View>

      {/* ── Suggestions dropdown ── */}
      {showDropdown && (
        <View style={styles.dropdown}>
          {isLoading && suggestions.length === 0 ? (
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
                  <MaterialIcons name="place" size={16} color="#E8A838" style={styles.placeIcon} />
                  <View style={styles.suggestionText}>
                    <Text style={styles.mainText} numberOfLines={1}>{item.main_text}</Text>
                    {item.secondary_text ? (
                      <Text style={styles.secondaryText} numberOfLines={1}>{item.secondary_text}</Text>
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
    left:     16,
    right:    16,
    zIndex:   100,
  },

  panel: {
    backgroundColor:  '#fff',
    borderRadius:     16,
    paddingVertical:  14,
    paddingRight:     16,
    paddingLeft:      8,
    flexDirection:    'row',
    alignItems:       'center',
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 2 },
    shadowOpacity:    0.16,
    shadowRadius:     10,
    elevation:        6,
  },

  backButton: {
    padding:     8,
    marginRight: 4,
  },

  fields: {
    flex: 1,
  },

  fieldRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 4,
    gap:            10,
  },

  dot: {
    width:        10,
    height:       10,
    borderRadius: 5,
    flexShrink:   0,
  },
  dotFrom: {
    backgroundColor: '#4A90D9',
  },
  dotTo: {
    backgroundColor: '#E05252',
  },

  fieldInput: {
    flex:       1,
    fontSize:   14,
    color:      '#1C1A18',
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },

  resolveSpinner: {
    marginLeft: 4,
  },

  connectorRow: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingLeft:    4,
    height:         20,
  },
  connectorDots: {
    width:           2,
    flex:            1,
    marginLeft:      4,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(0,0,0,0.12)',
    borderStyle:     'dashed',
  },
  swapButton: {
    marginLeft: 'auto',
    padding:    4,
  },

  dropdown: {
    backgroundColor: '#fff',
    borderRadius:    14,
    marginTop:       6,
    overflow:        'hidden',
    maxHeight:       280,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.14,
    shadowRadius:    14,
    elevation:       8,
  },

  loadingRow: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 16,
    paddingVertical:   16,
    gap:             10,
  },
  loadingText: {
    fontSize: 13,
    color:    '#AAA',
  },

  suggestionRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    paddingVertical:   12,
  },
  suggestionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  placeIcon: {
    marginRight: 10,
  },
  suggestionText: {
    flex: 1,
  },
  mainText: {
    fontSize:   14,
    fontWeight: '600',
    color:      '#1C1A18',
  },
  secondaryText: {
    fontSize:  12,
    color:     '#AAA',
    marginTop: 1,
  },
});
