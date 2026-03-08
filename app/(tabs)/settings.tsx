import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import SyncBadge from '../../components/SyncBadge';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../../constants/theme';
import { FontPreset, useFontSettings } from '../../contexts/FontContext';
import { useNotes } from '../../contexts/NotesContext';
import { useColorScheme } from '../../hooks/use-color-scheme';

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const {
    syncState,
    githubConfig,
    syncWithGitHub,
    saveGitHubConfig,
    clearGitHubConfig,
  } = useNotes();
  const { fontPreset, fontOptions, setFontPreset } = useFontSettings();

  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [branch, setBranch] = useState('main');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!githubConfig) return;
    setRepo(githubConfig.repo);
    setToken(githubConfig.token);
    setBranch(githubConfig.branch);
  }, [githubConfig]);

  async function handleSaveConfig() {
    if (!repo.trim() || !token.trim()) {
      Alert.alert('Missing field', 'Repo and token are required.');
      return;
    }

    setSaving(true);
    try {
      await saveGitHubConfig({
        repo: repo.trim(),
        token: token.trim(),
        branch: branch.trim() || 'main',
      });
      Alert.alert('Saved', 'GitHub configuration saved.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Save failed';
      Alert.alert('Error', message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearConfig() {
    await clearGitHubConfig();
    setRepo('');
    setToken('');
    setBranch('main');
  }

  async function handleFontPresetChange(preset: FontPreset) {
    await setFontPreset(preset);
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[Typography.title, { color: colors.textPrimary }]}>Settings</Text>

      <View
        style={[
          styles.section,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderLight,
            ...Shadows.card,
            shadowColor: colors.shadowColor,
          },
        ]}
      >
        <View style={styles.sectionHeader}>
          <Ionicons name="text-outline" size={22} color={colors.textPrimary} />
          <Text style={[Typography.heading, { color: colors.textPrimary }]}>App Font</Text>
        </View>

        <View style={styles.fontRow}>
          {fontOptions.map((option) => {
            const active = fontPreset === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.fontBtn,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primaryLight : 'transparent',
                  },
                ]}
                onPress={() => handleFontPresetChange(option.id)}
              >
                <Text style={[Typography.bodySmall, { color: active ? colors.primary : colors.textSecondary }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.section,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderLight,
            ...Shadows.card,
            shadowColor: colors.shadowColor,
          },
        ]}
        onPress={() => router.push('/github-sync-guide')}
        activeOpacity={0.8}
      >
        <View style={styles.guideRow}>
          <View style={styles.sectionHeader}>
            <Ionicons name="help-circle-outline" size={22} color={colors.textPrimary} />
            <Text style={[Typography.heading, { color: colors.textPrimary }]}>GitHub Sync Guide</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
        </View>
        <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>
          Step-by-step instructions for creating token and filling repo info.
        </Text>
      </TouchableOpacity>

      <View
        style={[
          styles.section,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderLight,
            ...Shadows.card,
            shadowColor: colors.shadowColor,
          },
        ]}
      >
        <View style={styles.sectionHeader}>
          <Ionicons name="logo-github" size={22} color={colors.textPrimary} />
          <Text style={[Typography.heading, { color: colors.textPrimary }]}>GitHub Sync</Text>
        </View>

        <Text style={[Typography.caption, { color: colors.textSecondary }]}>Repo (owner/repo)</Text>
        <TextInput
          value={repo}
          onChangeText={setRepo}
          placeholder="username/my-notes"
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
          autoCapitalize="none"
        />

        <Text style={[Typography.caption, { color: colors.textSecondary }]}>Token</Text>
        <TextInput
          value={token}
          onChangeText={setToken}
          placeholder="ghp_xxx"
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
          autoCapitalize="none"
          secureTextEntry
        />

        <Text style={[Typography.caption, { color: colors.textSecondary }]}>Branch</Text>
        <TextInput
          value={branch}
          onChangeText={setBranch}
          placeholder="main"
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
          autoCapitalize="none"
        />

        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }]} onPress={handleSaveConfig}>
          {saving ? <ActivityIndicator color={colors.textInverse} /> : <Text style={[Typography.button, { color: colors.textInverse }]}>Save Config</Text>}
        </TouchableOpacity>

        {githubConfig && (
          <TouchableOpacity style={[styles.outlineBtn, { borderColor: colors.border }]} onPress={handleClearConfig}>
            <Text style={[Typography.button, { color: colors.textSecondary }]}>Clear Config</Text>
          </TouchableOpacity>
        )}
      </View>

      <View
        style={[
          styles.section,
          {
            backgroundColor: colors.surface,
            borderColor: colors.borderLight,
            ...Shadows.card,
            shadowColor: colors.shadowColor,
          },
        ]}
      >
        <Text style={[Typography.heading, { color: colors.textPrimary, marginBottom: Spacing.md }]}>Sync</Text>
        <SyncBadge syncState={syncState} />

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: Spacing.md }]}
          onPress={syncWithGitHub}
          disabled={syncState.status === 'syncing'}
        >
          {syncState.status === 'syncing' ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={[Typography.button, { color: colors.textInverse }]}>Sync Now</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: Spacing.xxxxl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxxl,
    gap: Spacing.lg,
  },
  section: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fontRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  fontBtn: {
    width: '48%',
    minHeight: 38,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  primaryBtn: {
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  outlineBtn: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
});
