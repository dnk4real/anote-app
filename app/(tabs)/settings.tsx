import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AppDialog, { type AppDialogAction } from '../../components/AppDialog';
import SyncBadge from '../../components/SyncBadge';
import { BorderRadius, Colors, Shadows, Spacing, Typography } from '../../constants/theme';
import { FontPreset, useFontSettings } from '../../contexts/FontContext';
import { useNotes } from '../../contexts/NotesContext';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { SyncProvider } from '../../types/note';

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const {
    syncState,
    syncProvider,
    setSyncProvider,
    githubConfig,
    webdavConfig,
    syncWithGitHub,
    saveGitHubConfig,
    clearGitHubConfig,
    saveWebDAVConfig,
    clearWebDAVConfig,
  } = useNotes();
  const { fontPreset, fontOptions, fontAvailability, setFontPreset, downloadFontPreset } = useFontSettings();

  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [branch, setBranch] = useState('main');

  const [serverUrl, setServerUrl] = useState('');
  const [webdavUsername, setWebDAVUsername] = useState('');
  const [webdavPassword, setWebDAVPassword] = useState('');
  const [webdavFileName, setWebDAVFileName] = useState('a-note-sync.json');

  const [saving, setSaving] = useState(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
    title: string;
    message: string;
    actions: AppDialogAction[];
  } | null>(null);

  function showDialog(title: string, message: string, actions?: AppDialogAction[]) {
    setDialogConfig({
      title,
      message,
      actions: actions ?? [{ label: 'OK', variant: 'primary' }],
    });
  }

  const providerLabel = useMemo(
    () => (syncProvider === 'github' ? 'GitHub' : 'WebDAV'),
    [syncProvider]
  );

  useEffect(() => {
    if (!githubConfig) return;
    setRepo(githubConfig.repo);
    setToken(githubConfig.token);
    setBranch(githubConfig.branch);
  }, [githubConfig]);

  useEffect(() => {
    if (!webdavConfig) return;
    setServerUrl(webdavConfig.serverUrl);
    setWebDAVUsername(webdavConfig.username);
    setWebDAVPassword(webdavConfig.password);
    setWebDAVFileName(webdavConfig.fileName || 'a-note-sync.json');
  }, [webdavConfig]);

  async function handleSaveGitHubConfig() {
    if (!repo.trim() || !token.trim()) {
      showDialog('Missing field', 'Repo and token are required.');
      return;
    }

    setSaving(true);
    try {
      await saveGitHubConfig({
        repo: repo.trim(),
        token: token.trim(),
        branch: branch.trim() || 'main',
      });
      showDialog('Saved', 'GitHub configuration saved.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Save failed';
      showDialog('Error', message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearGitHubConfig() {
    await clearGitHubConfig();
    setRepo('');
    setToken('');
    setBranch('main');
  }

  async function handleSaveWebDAVConfigPress() {
    if (!serverUrl.trim() || !webdavUsername.trim() || !webdavPassword.trim()) {
      showDialog('Missing field', 'Server URL, Username, and Password are required.');
      return;
    }

    setSaving(true);
    try {
      await saveWebDAVConfig({
        serverUrl: serverUrl.trim(),
        username: webdavUsername.trim(),
        password: webdavPassword,
        fileName: webdavFileName.trim() || 'a-note-sync.json',
      });
      showDialog('Saved', 'WebDAV configuration saved.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Save failed';
      showDialog('Error', message);
    } finally {
      setSaving(false);
    }
  }

  async function handleClearWebDAVConfigPress() {
    await clearWebDAVConfig();
    setServerUrl('');
    setWebDAVUsername('');
    setWebDAVPassword('');
    setWebDAVFileName('a-note-sync.json');
  }

  async function handleFontPresetChange(preset: FontPreset) {
    if (preset === 'system') {
      await setFontPreset('system');
      return;
    }

    const status = fontAvailability[preset];
    if (status.installed) {
      await setFontPreset(preset);
      return;
    }

    const option = fontOptions.find((item) => item.id === preset);
    const label = option?.label ?? preset;

    showDialog('下载字体', `要下载 ${label} 吗？`, [
      { label: '取消', variant: 'ghost' },
      {
        label: '下载',
        variant: 'primary',
        onPress: async () => {
          try {
            await downloadFontPreset(preset);
            await setFontPreset(preset);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Download failed';
            showDialog('Error', message);
          }
        },
      },
    ]);
  }

  async function handleSelectProvider(provider: SyncProvider) {
    setProviderMenuOpen(false);
    if (provider === syncProvider) return;
    await setSyncProvider(provider);
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
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
            const status =
              option.id === 'system' ? { installed: true, downloading: false } : fontAvailability[option.id];
            const disabled = option.id !== 'system' && !status.installed;
            const label = status.downloading ? `${option.label} 下载中...` : option.label;

            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.fontBtn,
                  disabled && styles.fontBtnDisabled,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primaryLight : 'transparent',
                  },
                ]}
                onPress={() => handleFontPresetChange(option.id)}
                disabled={status.downloading}
              >
                <Text
                  style={[
                    Typography.bodySmall,
                    { color: active ? colors.primary : disabled ? colors.textTertiary : colors.textSecondary },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
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
        <View style={styles.sectionHeader}>
          <Ionicons name="sync-outline" size={22} color={colors.textPrimary} />
          <Text style={[Typography.heading, { color: colors.textPrimary }]}>Sync Method</Text>
        </View>

        <Pressable
          style={[styles.selectTrigger, { borderColor: colors.border }]}
          onPress={() => setProviderMenuOpen(true)}
        >
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>Provider</Text>
          <View style={styles.selectValueRow}>
            <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>{providerLabel}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
          </View>
        </Pressable>
      </View>

      {syncProvider === 'github' ? (
        <>
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

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleSaveGitHubConfig}
            >
              {saving ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={[Typography.button, { color: colors.textInverse }]}>Save Config</Text>
              )}
            </TouchableOpacity>

            {githubConfig && (
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: colors.border }]}
                onPress={handleClearGitHubConfig}
              >
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
            <Text style={[Typography.heading, { color: colors.textPrimary, marginBottom: Spacing.md }]}>
              Sync（也可在主界面下拉同步）
            </Text>
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
            <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>Step-by-step instructions for creating token and filling repo info.</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
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
              <Ionicons name="cloud-outline" size={22} color={colors.textPrimary} />
              <Text style={[Typography.heading, { color: colors.textPrimary }]}>WebDAV Sync</Text>
            </View>

            <Text style={[Typography.caption, { color: colors.textSecondary }]}>Server URL</Text>
            <TextInput
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="https://dav.jianguoyun.com/dav/anote_sync/"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="none"
            />

            <Text style={[Typography.caption, { color: colors.textSecondary }]}>Username</Text>
            <TextInput
              value={webdavUsername}
              onChangeText={setWebDAVUsername}
              placeholder="your-jianguoyun-username"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="none"
            />

            <Text style={[Typography.caption, { color: colors.textSecondary }]}>Password / App Password</Text>
            <TextInput
              value={webdavPassword}
              onChangeText={setWebDAVPassword}
              placeholder="your-app-password"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="none"
              secureTextEntry
            />

            <Text style={[Typography.caption, { color: colors.textSecondary }]}>Remote File</Text>
            <TextInput
              value={webdavFileName}
              onChangeText={setWebDAVFileName}
              placeholder="a-note-sync.json"
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={handleSaveWebDAVConfigPress}
            >
              {saving ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={[Typography.button, { color: colors.textInverse }]}>Save Config</Text>
              )}
            </TouchableOpacity>

            {webdavConfig && (
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: colors.border }]}
                onPress={handleClearWebDAVConfigPress}
              >
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
            <Text style={[Typography.heading, { color: colors.textPrimary, marginBottom: Spacing.md }]}>
              Sync（也可在主界面下拉同步）
            </Text>
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
            onPress={() => router.push('/webdav-sync-guide')}
            activeOpacity={0.8}
          >
            <View style={styles.guideRow}>
              <View style={styles.sectionHeader}>
                <Ionicons name="help-circle-outline" size={22} color={colors.textPrimary} />
                <Text style={[Typography.heading, { color: colors.textPrimary }]}>WebDAV Sync Guide</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </View>
            <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>Jianguoyun example and required fields.</Text>
          </TouchableOpacity>
        </>
      )}

      <Modal
        visible={providerMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProviderMenuOpen(false)}
      >
        <Pressable
          style={[styles.optionMask, { backgroundColor: colors.overlay }]}
          onPress={() => setProviderMenuOpen(false)}
        >
          <Pressable style={[styles.optionPanel, { backgroundColor: colors.surface }]} onPress={() => undefined}>
            <Pressable
              style={[
                styles.optionItem,
                syncProvider === 'github' && { backgroundColor: colors.primaryLight },
              ]}
              onPress={() => void handleSelectProvider('github')}
            >
              <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>GitHub</Text>
              {syncProvider === 'github' && (
                <Ionicons name="checkmark" size={18} color={colors.primary} />
              )}
            </Pressable>

            <Pressable
              style={[
                styles.optionItem,
                syncProvider === 'webdav' && { backgroundColor: colors.primaryLight },
              ]}
              onPress={() => void handleSelectProvider('webdav')}
            >
              <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>WebDAV</Text>
              {syncProvider === 'webdav' && (
                <Ionicons name="checkmark" size={18} color={colors.primary} />
              )}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <AppDialog
        visible={dialogConfig !== null}
        title={dialogConfig?.title ?? ''}
        message={dialogConfig?.message ?? ''}
        actions={dialogConfig?.actions ?? []}
        onClose={() => setDialogConfig(null)}
      />
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
  selectTrigger: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  selectValueRow: {
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
  fontBtnDisabled: {
    opacity: 0.7,
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
  optionMask: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionPanel: {
    width: '88%',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
});
