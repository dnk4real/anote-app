import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../constants/theme';
import { FontProvider } from '../contexts/FontContext';
import { NotesProvider } from '../contexts/NotesContext';
import { useColorScheme } from '../hooks/use-color-scheme';

SplashScreen.preventAutoHideAsync().catch(() => {
  // ignore duplicate calls during fast refresh
});

export default function RootLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [fontsLoaded] = useFonts({
    'SarasaUiSC-Regular': require('../assets/fonts/SarasaUiSC-Regular.ttf'),
    'SarasaUiSC-Bold': require('../assets/fonts/SarasaUiSC-Bold.ttf'),
    'SourceHanSerifCN-Regular': require('../assets/fonts/SourceHanSerifCN-Regular.otf'),
    'SourceHanSerifCN-Bold': require('../assets/fonts/SourceHanSerifCN-Bold.otf'),
    'GlowSansSC-Regular': require('../assets/fonts/GlowSansSC-Regular.otf'),
    'GlowSansSC-Bold': require('../assets/fonts/GlowSansSC-Bold.otf'),
  });

  useEffect(() => {
    if (!fontsLoaded) return;
    SplashScreen.hideAsync().catch(() => {
      // ignore hide errors during refresh
    });
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <FontProvider>
        <NotesProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              presentation: 'card',
              animation: 'slide_from_right',
              freezeOnBlur: true,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
            <Stack.Screen name="editor" options={{ gestureEnabled: false }} />
            <Stack.Screen name="long-image-preview" options={{ gestureEnabled: false }} />
            <Stack.Screen name="github-sync-guide" options={{ gestureEnabled: false }} />
          </Stack>
          <StatusBar style={colors.statusBar === 'dark-content' ? 'dark' : 'light'} />
        </NotesProvider>
      </FontProvider>
    </GestureHandlerRootView>
  );
}
