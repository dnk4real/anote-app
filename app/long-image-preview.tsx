import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { WebView } from 'react-native-webview';
import { BorderRadius, Colors, Spacing, Typography } from '../constants/theme';
import { useNotes } from '../contexts/NotesContext';
import { useColorScheme } from '../hooks/use-color-scheme';
import { buildLongImage, LongImageTheme } from '../utils/long-image';

const HEIGHT_REPORT_SCRIPT = `
(() => {
  const post = () => {
    const body = document.body;
    const doc = document.documentElement;
    const height = Math.ceil(Math.max(body ? body.scrollHeight : 0, doc ? doc.scrollHeight : 0));
    window.ReactNativeWebView.postMessage(String(height));
  };

  const schedule = () => setTimeout(post, 32);

  window.addEventListener('load', schedule);
  window.addEventListener('resize', schedule);

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(schedule);
    if (document.body) ro.observe(document.body);
    if (document.documentElement) ro.observe(document.documentElement);
  }

  setTimeout(post, 60);
  setTimeout(post, 220);
  setTimeout(post, 520);
})();
true;
`;

export default function LongImagePreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { width: screenWidth } = useWindowDimensions();
  const { notes } = useNotes();

  const note = useMemo(() => notes.find((item) => item.id === id), [id, notes]);
  const defaultTheme: LongImageTheme = colorScheme === 'dark' ? 'dark' : 'light';
  const [theme, setTheme] = useState<LongImageTheme>(defaultTheme);
  const [saving, setSaving] = useState(false);
  const [contentHeight, setContentHeight] = useState(900);
  const previewRef = useRef<View>(null);

  const image = useMemo(
    () =>
      buildLongImage({
        html: note?.content ?? '',
        theme,
      }),
    [note?.content, theme]
  );

  const previewWidth = Math.max(300, Math.min(420, screenWidth - Spacing.lg * 2));
  const previewHeight = Math.max(420, Math.round(contentHeight));

  const handleWebMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    const nextHeight = Number(event.nativeEvent.data);
    if (!Number.isFinite(nextHeight)) return;
    if (nextHeight < 200 || nextHeight > 30000) return;
    setContentHeight((prev) => (Math.abs(prev - nextHeight) > 1 ? nextHeight : prev));
  }, []);

  if (!note) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[Typography.body, { color: colors.textSecondary }]}>Note not found.</Text>
      </View>
    );
  }

  async function handleDownload() {
    if (saving) return;
    setSaving(true);

    try {
      if (Platform.OS === 'web') {
        Alert.alert('Not supported', 'Please save long images from iOS or Android.');
        return;
      }

      const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please allow photo access first.');
        return;
      }

      if (!previewRef.current) return;

      const scale = image.width / previewWidth;
      const exportHeight = Math.max(1, Math.round(contentHeight * scale));
      const pngPath = await captureRef(previewRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: image.width,
        height: exportHeight,
      });
      await MediaLibrary.createAssetAsync(pngPath);

      Alert.alert('Saved', 'Long image saved to your photo library.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Save failed.';
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.navRow}>
        <Pressable onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
        </Pressable>

        <Text style={[Typography.heading, { color: colors.textPrimary }]}>Long Image</Text>

        <Pressable onPress={handleDownload} disabled={saving}>
          <Feather name="download" size={21} color={saving ? colors.textTertiary : colors.textSecondary} />
        </Pressable>
      </View>

      <View style={[styles.themeRow, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
        <Pressable
          style={[
            styles.themeBtn,
            {
              backgroundColor: theme === 'light' ? colors.primaryLight : 'transparent',
              borderColor: theme === 'light' ? colors.primary : colors.borderLight,
            },
          ]}
          onPress={() => setTheme('light')}
        >
          <Text
            style={[
              Typography.bodySmall,
              { color: theme === 'light' ? colors.primary : colors.textSecondary },
            ]}
          >
            Light
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.themeBtn,
            {
              backgroundColor: theme === 'dark' ? colors.primaryLight : 'transparent',
              borderColor: theme === 'dark' ? colors.primary : colors.borderLight,
            },
          ]}
          onPress={() => setTheme('dark')}
        >
          <Text
            style={[
              Typography.bodySmall,
              { color: theme === 'dark' ? colors.primary : colors.textSecondary },
            ]}
          >
            Dark
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          ref={previewRef}
          collapsable={false}
          style={[styles.previewFrame, { width: previewWidth, height: previewHeight }]}
        >
          <WebView
            source={{ html: image.html }}
            style={styles.previewWebview}
            originWhitelist={['*']}
            scrollEnabled={false}
            textZoom={100}
            injectedJavaScript={HEIGHT_REPORT_SCRIPT}
            onMessage={handleWebMessage}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navRow: {
    paddingTop: Spacing.xxxxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  themeRow: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    padding: 4,
    gap: Spacing.xs,
  },
  themeBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: Spacing.xxxxl,
  },
  previewFrame: {
    borderRadius: 0,
    overflow: 'hidden',
  },
  previewWebview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
