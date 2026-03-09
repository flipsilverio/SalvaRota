import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

// Three gradient states that slowly crossfade into each other
// Colors pulled from the Figma warm brownish-amber palette
const GRADIENT_A = ['#2A231C', '#4A3020', '#2A4453'] as const;
const GRADIENT_B = ['#3D2810', '#622318', '#1E3040'] as const;
const GRADIENT_C = ['#33302C', '#5C3A1E', '#2D4A45'] as const;

const CYCLE_DURATION = 8000; // 8s per phase — full cycle = 24s

export default function AnimatedGradient() {
  const phaseB = useRef(new Animated.Value(0)).current;
  const phaseC = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // A → B → C → A → ... looping seamlessly
    const animate = () => {
      Animated.sequence([
        // Fade in B over A
        Animated.timing(phaseB, { toValue: 1, duration: CYCLE_DURATION, useNativeDriver: true }),
        // Fade in C over B (B still visible)
        Animated.parallel([
          Animated.timing(phaseC, { toValue: 1, duration: CYCLE_DURATION, useNativeDriver: true }),
          Animated.timing(phaseB, { toValue: 0, duration: CYCLE_DURATION, useNativeDriver: true }),
        ]),
        // Fade back to A (fade out C)
        Animated.timing(phaseC, { toValue: 0, duration: CYCLE_DURATION, useNativeDriver: true }),
      ]).start(() => animate());
    };

    animate();
  }, []);

  return (
    <>
      {/* Base layer — always visible */}
      <LinearGradient
        colors={GRADIENT_A}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Second layer — fades in and out */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: phaseB }]}>
        <LinearGradient
          colors={GRADIENT_B}
          start={{ x: 0.8, y: 0 }}
          end={{ x: 0.1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      {/* Third layer — fades in and out offset from B */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: phaseC }]}>
        <LinearGradient
          colors={GRADIENT_C}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.3, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </>
  );
}
