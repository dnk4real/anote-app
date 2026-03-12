import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { WebView } from 'react-native-webview';
import AppDialog from '../components/AppDialog';
import { BorderRadius, Colors, Spacing, Typography } from '../constants/theme';
import { useFontSettings } from '../contexts/FontContext';
import { useLocalization } from '../contexts/LocalizationContext';
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
  const { editorFontFaceCss, editorFontFamily, fontPreset } = useFontSettings();
  const { t } = useLocalization();
  const { width: screenWidth } = useWindowDimensions();
  const { notes } = useNotes();

  const note = useMemo(() => notes.find((item) => item.id === id), [id, notes]);
  const defaultTheme: LongImageTheme = colorScheme === 'dark' ? 'dark' : 'light';
  const [theme, setTheme] = useState<LongImageTheme>(defaultTheme);
  const [saving, setSaving] = useState(false);
  const [contentHeight, setContentHeight] = useState(900);
  const [dialogConfig, setDialogConfig] = useState<{ title: string; message: string } | null>(null);
  const previewRef = useRef<View>(null);

  const image = useMemo(
    () =>
      buildLongImage({
        html: note?.content ?? '',
        theme,
        fontFaceCss: editorFontFaceCss,
        fontFamily: editorFontFamily,
      }),
    [note?.content, theme, editorFontFaceCss, editorFontFamily]
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
        <Text style={[Typography.body, { color: colors.textSecondary }]}>{t('editor.noteNotFound')}</Text>
      </View>
    );
  }

  async function handleDownload() {
    if (saving) return;
    setSaving(true);

    try {
      if (Platform.OS === 'web') {
        setDialogConfig({
          title: t('longImage.notSupported'),
          message: t('longImage.notSupportedMessage'),
        });
        return;
      }

      const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
      if (!permission.granted) {
        setDialogConfig({
          title: t('editor.permissionRequired'),
          message: t('editor.allowPhotoAccess'),
        });
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

      setDialogConfig({
        title: t('longImage.saved'),
        message: t('longImage.savedMessage'),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('longImage.saveFailed');
      setDialogConfig({
        title: t('longImage.saveFailed'),
        message,
      });
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

        <Text style={[Typography.heading, { color: colors.textPrimary }]}>{t('longImage.title')}</Text>

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
            {t('common.light')}
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
            {t('common.dark')}
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
            key={`long-image-${theme}-${fontPreset}`}
            source={{ html: image.html }}
            style={styles.previewWebview}
            originWhitelist={['*']}
            scrollEnabled={false}
            textZoom={100}
            injectedJavaScript={HEIGHT_REPORT_SCRIPT}
            onMessage={handleWebMessage}
            mixedContentMode="always"
            allowFileAccess
            allowFileAccessFromFileURLs
            allowUniversalAccessFromFileURLs
          />
        </View>
      </ScrollView>

      <AppDialog
        visible={dialogConfig !== null}
        title={dialogConfig?.title ?? ''}
        message={dialogConfig?.message ?? ''}
        actions={[{ label: t('common.ok'), variant: 'primary' }]}
        onClose={() => setDialogConfig(null)}
      />
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
