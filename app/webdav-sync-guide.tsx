import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';

const STEPS = [
  {
    title: '1. Open Jianguoyun WebDAV',
    body: 'Open Jianguoyun settings and enable WebDAV service.',
  },
  {
    title: '2. Create Sync Folder (Important)',
    body: 'Jianguoyun does not allow writing directly in WebDAV root. Create a folder first, for example: anote_sync.',
  },
  {
    title: '3. Create App Password',
    body: 'In Jianguoyun security settings, create an app-specific password for WebDAV.',
  },
  {
    title: '4. Fill in A-Note settings',
    body: 'Provider = WebDAV, Server URL = https://dav.jianguoyun.com/dav/anote_sync/, Username = Jianguoyun account, Password = app password, Remote File can keep a-note-sync.json.',
  },
  {
    title: '5. Save and sync',
    body: 'Tap Save Config, then Sync Now (or pull down on main screen) to run sync.',
  },
];

export default function WebDAVSyncGuideScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

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
          <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[Typography.title, { color: colors.textPrimary }]}>WebDAV Sync Guide</Text>
        <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>Jianguoyun example.</Text>

        {STEPS.map((step) => (
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
            Tip: Use an app password (not account password), and use a subfolder URL like /dav/anote_sync/.
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
