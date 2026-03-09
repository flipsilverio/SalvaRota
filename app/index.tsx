import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

export default function Index() {
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('onboarding_done').then((value) => {
      setDestination(value ? '/(tabs)' : '/onboarding');
    });
  }, []);

  if (!destination) return <View style={{ flex: 1, backgroundColor: '#33302C' }} />;
  return <Redirect href={destination as any} />;
}
