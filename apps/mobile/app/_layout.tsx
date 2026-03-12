import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Feather, Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '../constants/theme';
import { FontProvider } from '../contexts/FontContext';
import { LocalizationProvider } from '../contexts/LocalizationContext';
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

  const shouldPrewarmWebView = Platform.OS === 'android';
  const prewarmSource = {
    html: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;background:transparent;"></body></html>',
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: blankBackground }}>
      <LocalizationProvider>
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
            {shouldPrewarmWebView && (
              <View
                pointerEvents="none"
                style={styles.webviewPrewarm}
                importantForAccessibility="no-hide-descendants"
              >
                <WebView
                  source={prewarmSource}
                  originWhitelist={['*']}
                  style={styles.webviewPrewarm}
                  androidLayerType="hardware"
                  javaScriptEnabled
                  scrollEnabled={false}
                />
              </View>
            )}
            <StatusBar style={colors.statusBar === 'dark-content' ? 'dark' : 'light'} />
          </NotesProvider>
        </FontProvider>
      </LocalizationProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  webviewPrewarm: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    right: 0,
    bottom: 0,
  },
});
