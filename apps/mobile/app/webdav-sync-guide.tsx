import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../constants/theme';
import { useLocalization } from '../contexts/LocalizationContext';
import { useColorScheme } from '../hooks/use-color-scheme';

export default function WebDAVSyncGuideScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useLocalization();

  const steps = useMemo(
    () => [
      { title: t('guide.webdav.step1.title'), body: t('guide.webdav.step1.body') },
      { title: t('guide.webdav.step2.title'), body: t('guide.webdav.step2.body') },
      { title: t('guide.webdav.step3.title'), body: t('guide.webdav.step3.body') },
      { title: t('guide.webdav.step4.title'), body: t('guide.webdav.step4.body') },
      { title: t('guide.webdav.step5.title'), body: t('guide.webdav.step5.body') },
    ],
    [t]
  );

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/settings');
  }, [navigation, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => { void handleBack(); }} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>{t('common.back')}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[Typography.title, { color: colors.textPrimary }]}>{t('guide.webdav.title')}</Text>
        <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>
          {t('guide.webdav.subtitle')}
        </Text>

        {steps.map((step) => (
          <View
            key={step.title}
            style={[
              styles.stepCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderLight,
                ...Shadows.card,
                shadowColor: colors.shadowColor,
              },
            ]}
          >
            <Text style={[Typography.heading, { color: colors.textPrimary }]}>{step.title}</Text>
            <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>{step.body}</Text>
          </View>
        ))}

        <View style={[styles.tipCard, { backgroundColor: colors.primaryLight, borderColor: colors.borderLight }]}>
          <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>
            {t('guide.webdav.tip')}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingTop: Spacing.xxxxl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxxl,
    gap: Spacing.md,
  },
  stepCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  tipCard: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginTop: Spacing.sm,
  },
});
