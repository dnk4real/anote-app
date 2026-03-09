import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Feather, Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
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
  const blankBackground = colorScheme === 'light' ? '#FAF7F2' : colors.background;
  const [fontsLoaded] = useFonts({
    ...Feather.font,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    ...MaterialIcons.font,
    'SarasaGothicSC-Regular': require('../assets/fonts/SarasaGothicSC-Regular.ttf'),
    'SarasaGothicSC-Bold': require('../assets/fonts/SarasaGothicSC-Bold.ttf'),
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

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(blankBackground).catch(() => {
      // ignore system UI background failures
    });
  }, [blankBackground]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: blankBackground }}>
      <FontProvider>
        <NotesProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: blankBackground },
              presentation: 'card',
              animation: 'ios_from_right',
              animationDuration: 333,
              freezeOnBlur: false,
            }}
          >
            <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
            <Stack.Screen name="editor" options={{ gestureEnabled: false }} />
            <Stack.Screen name="long-image-preview" options={{ gestureEnabled: false }} />
            <Stack.Screen name="github-sync-guide" options={{ gestureEnabled: false }} />
            <Stack.Screen name="webdav-sync-guide" options={{ gestureEnabled: false }} />
          </Stack>
          <StatusBar style={colors.statusBar === 'dark-content' ? 'dark' : 'light'} />
        </NotesProvider>
      </FontProvider>
    </GestureHandlerRootView>
  );
}
