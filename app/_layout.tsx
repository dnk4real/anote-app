import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Colors } from '../constants/theme';
import { FontProvider } from '../contexts/FontContext';
import { NotesProvider } from '../contexts/NotesContext';
import { useColorScheme } from '../hooks/use-color-scheme';

export default function RootLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

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
