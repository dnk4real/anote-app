import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';

const STEPS = [
  {
    title: '1. Create a GitHub token',
    body: 'Open GitHub > Settings > Developer settings > Personal access tokens. Create a token with repo permission.',
  },
  {
    title: '2. Prepare your repository',
    body: 'Create an empty private repo. Copy the repo path in owner/repo format, for example: yourname/my-notes.',
  },
  {
    title: '3. Fill settings in this app',
    body: 'In Settings > GitHub Sync, fill Repo, Token, and Branch (usually main), then tap Save Config.',
  },
  {
    title: '4. Run sync',
    body: 'Tap Sync Now. If successful, your notes are uploaded and can be restored from GitHub later.',
  },
];

export default function GitHubSyncGuideScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.replace('/(tabs)/settings')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>Back</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[Typography.title, { color: colors.textPrimary }]}>GitHub Sync Guide</Text>
        <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>Simple setup for first-time users.</Text>

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
            Tip: If sync fails, check token scope and repo path first.
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
