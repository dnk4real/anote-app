import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
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
import { LanguagePreference, useLocalization } from '../../contexts/LocalizationContext';
import { useNotes } from '../../contexts/NotesContext';
import { useColorScheme } from '../../hooks/use-color-scheme';
import * as Storage from '../../services/storage';
import { SyncProvider } from '../../types/note';
import { exportNotesAsMarkdownZip } from '../../utils/export-notes';
import { importNotesFromZip, IMPORT_ERROR_UNSUPPORTED } from '../../utils/import-notes';

const RELEASE_REPO = 'dnk4real/anote-app';
const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;

type GitHubReleaseAsset = {
  name: string;
  content_type?: string;
  browser_download_url: string;
};

type GitHubLatestRelease = {
  tag_name?: string;
  name?: string;
  html_url: string;
  assets?: GitHubReleaseAsset[];
};

function normalizeVersion(raw: string): string {
  const value = raw.trim().replace(/^v/i, '');
  const clean = value.split(/[+-]/)[0] ?? '';
  return clean || '0.0.0';
}

function parseVersionPart(part: string): number {
  const numeric = part.match(/\d+/)?.[0];
  return numeric ? Number(numeric) : 0;
}

function compareVersions(a: string, b: string): number {
  const aParts = normalizeVersion(a).split('.');
  const bParts = normalizeVersion(b).split('.');
  const maxLen = Math.max(aParts.length, bParts.length, 3);

  for (let i = 0; i < maxLen; i += 1) {
    const aNum = parseVersionPart(aParts[i] ?? '0');
    const bNum = parseVersionPart(bParts[i] ?? '0');
    if (aNum > bNum) return 1;
    if (aNum < bNum) return -1;
  }

  return 0;
}

function pickReleaseDownloadUrl(release: GitHubLatestRelease): string {
  const apk = release.assets?.find((asset) => {
    const lowerName = asset.name.toLowerCase();
    return (
      lowerName.endsWith('.apk') ||
      asset.content_type === 'application/vnd.android.package-archive'
    );
  });

  return apk?.browser_download_url ?? release.html_url;
}

export default function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t, languagePreference, setLanguagePreference, systemLanguage } = useLocalization();
  const {
    syncState,
    syncProvider,
    setSyncProvider,
    folders,
    githubConfig,
    webdavConfig,
    syncWithGitHub,
    saveGitHubConfig,
    clearGitHubConfig,
    saveWebDAVConfig,
    clearWebDAVConfig,
    refreshData,
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
  const [exportingNotes, setExportingNotes] = useState(false);
  const [importingNotes, setImportingNotes] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [latestReleaseVersion, setLatestReleaseVersion] = useState<string | null>(null);
  const [latestReleaseUrl, setLatestReleaseUrl] = useState<string | null>(null);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [dialogConfig, setDialogConfig] = useState<{
    title: string;
    message: string;
    actions: AppDialogAction[];
  } | null>(null);

  const languageOptions: { id: LanguagePreference; label: string }[] = useMemo(
    () => [
      { id: 'system', label: t('settings.language.system') },
      { id: 'zh', label: t('settings.language.chinese') },
      { id: 'en', label: t('settings.language.english') },
    ],
    [t]
  );

  const systemLanguageLabel = useMemo(
    () => (systemLanguage === 'zh' ? t('settings.systemLang.zh') : t('settings.systemLang.en')),
    [systemLanguage, t]
  );

  const fontLabel = useCallback(
    (preset: FontPreset): string => {
      if (preset === 'system') return t('settings.font.system');
      if (preset === 'sarasa_gothic') return t('settings.font.sarasa_gothic');
      if (preset === 'source_han_serif') return t('settings.font.source_han_serif');
      return t('settings.font.glow_sans');
    },
    [t]
  );

  function normalizeErrorMessage(message: string): string {
    if (message === 'Invalid GitHub token') return t('settings.error.invalidGithubToken');
    if (message === 'Invalid WebDAV configuration') return t('settings.error.invalidWebdavConfig');
    if (message === 'Download failed') return t('settings.error.downloadFailed');
    if (message === 'Check update failed') return t('settings.error.checkUpdateFailed');
    if (message === 'Cannot open download link.') return t('settings.error.cannotOpenDownloadLink');
    return message;
  }

  function showDialog(title: string, message: string, actions?: AppDialogAction[]) {
    setDialogConfig({
      title,
      message,
      actions: actions ?? [{ label: t('common.ok'), variant: 'primary' }],
    });
  }

  const providerLabel = useMemo(
    () => (syncProvider === 'github' ? t('settings.provider.github') : t('settings.provider.webdav')),
    [syncProvider, t]
  );
  const currentVersion = useMemo(
    () => normalizeVersion(Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? '0.0.0'),
    []
  );
  const hasUpdate = useMemo(() => {
    if (!latestReleaseVersion) return false;
    return compareVersions(currentVersion, latestReleaseVersion) < 0;
  }, [currentVersion, latestReleaseVersion]);

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
      showDialog(t('settings.validation.missingFieldTitle'), t('settings.validation.githubMissingFieldMsg'));
      return;
    }

    setSaving(true);
    try {
      await saveGitHubConfig({
        repo: repo.trim(),
        token: token.trim(),
        branch: branch.trim() || 'main',
      });
      showDialog(t('settings.savedTitle'), t('settings.savedGithubMsg'));
    } catch (error: unknown) {
      const message = error instanceof Error ? normalizeErrorMessage(error.message) : t('editor.saveFailed');
      showDialog(t('settings.errorTitle'), message);
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
      showDialog(t('settings.validation.missingFieldTitle'), t('settings.validation.webdavMissingFieldMsg'));
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
      showDialog(t('settings.savedTitle'), t('settings.savedWebdavMsg'));
    } catch (error: unknown) {
      const message = error instanceof Error ? normalizeErrorMessage(error.message) : t('editor.saveFailed');
      showDialog(t('settings.errorTitle'), message);
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

    const label = fontLabel(preset);

    showDialog(t('settings.font.downloadTitle'), t('settings.font.downloadAsk', { font: label }), [
      { label: t('common.cancel'), variant: 'ghost' },
      {
        label: t('settings.update.download'),
        variant: 'primary',
        onPress: async () => {
          try {
            await downloadFontPreset(preset);
            await setFontPreset(preset);
          } catch (error: unknown) {
            const message =
              error instanceof Error
                ? normalizeErrorMessage(error.message)
                : t('settings.error.downloadFailed');
            showDialog(t('settings.errorTitle'), message);
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

  async function openDownloadUrl(url: string) {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      showDialog(t('common.openFailed'), t('settings.error.cannotOpenDownloadLink'));
      return;
    }
    await Linking.openURL(url);
  }

  async function handleCheckForUpdate() {
    setCheckingUpdate(true);
    try {
      const response = await fetch(RELEASE_API_URL, {
        headers: {
          Accept: 'application/vnd.github+json',
        },
      });
      if (!response.ok) {
        let message = `GitHub request failed (${response.status})`;
        try {
          const payload = (await response.json()) as { message?: string };
          if (payload.message) message = payload.message;
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      const release = (await response.json()) as GitHubLatestRelease;
      const latestVersion = normalizeVersion(release.tag_name || release.name || '');
      const downloadUrl = pickReleaseDownloadUrl(release);

      setLatestReleaseVersion(latestVersion);
      setLatestReleaseUrl(downloadUrl);

      if (compareVersions(currentVersion, latestVersion) >= 0) {
        showDialog(
          t('settings.update.upToDateTitle'),
          t('settings.update.latestDialog', {
            current: currentVersion,
            latest: latestVersion,
          })
        );
        return;
      }

      showDialog(
        t('settings.update.availableTitle'),
        t('settings.update.latestDialog', {
          current: currentVersion,
          latest: latestVersion,
        }),
        [
          { label: t('settings.update.later'), variant: 'ghost' },
          {
            label: t('settings.update.download'),
            variant: 'primary',
            onPress: async () => {
              await openDownloadUrl(downloadUrl);
            },
          },
        ]
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? normalizeErrorMessage(error.message)
          : t('settings.error.checkUpdateFailed');
      showDialog(t('settings.update.failedTitle'), message);
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleExportNotes() {
    setExportingNotes(true);
    try {
      const allNotes = await Storage.getAllNotes();
      const result = await exportNotesAsMarkdownZip(allNotes, folders, {
        shareTitle: t('settings.export.shareTitle'),
      });

      if (!result.shared) {
        showDialog(
          t('settings.export.savedTitle'),
          t('settings.export.savedMessage', { file: result.fileName })
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'NO_EXPORTABLE_NOTES') {
        showDialog(t('settings.export.emptyTitle'), t('settings.export.emptyMessage'));
      } else {
        const detail = error instanceof Error ? normalizeErrorMessage(error.message) : t('settings.export.failedFallback');
        showDialog(
          t('settings.export.failedTitle'),
          t('settings.export.failedMessage', { error: detail })
        );
      }
    } finally {
      setExportingNotes(false);
    }
  }

  async function handleImportNotes() {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (picked.canceled || !picked.assets?.length) {
      return;
    }

    const asset = picked.assets[0];
    if (!asset.uri) {
      showDialog(t('settings.import.failedTitle'), t('settings.import.failedMessage', { error: t('settings.import.pickFailed') }));
      return;
    }

    setImportingNotes(true);
    try {
      const [existingNotes, existingFolders] = await Promise.all([
        Storage.getAllNotes(),
        Storage.getFolders(),
      ]);

      const result = await importNotesFromZip(
        asset.uri,
        asset.name || 'notes.zip',
        existingNotes,
        existingFolders
      );

      await Storage.saveNotes(result.notes);
      await Storage.saveFolders(result.folders);
      await refreshData();

      showDialog(
        t('settings.import.successTitle'),
        t('settings.import.successMessage', {
          count: result.importedCount,
          folders: result.createdFolderCount,
          format:
            result.format === 'smartisan'
              ? t('settings.import.format.smartisan')
              : t('settings.import.format.anote'),
        })
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      if (message === IMPORT_ERROR_UNSUPPORTED) {
        showDialog(t('settings.import.unsupportedTitle'), t('settings.import.unsupportedMessage'));
      } else {
        const detail =
          error instanceof Error ? normalizeErrorMessage(error.message) : t('settings.import.failedFallback');
        showDialog(
          t('settings.import.failedTitle'),
          t('settings.import.failedMessage', { error: detail })
        );
      }
    } finally {
      setImportingNotes(false);
    }
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[Typography.title, { color: colors.textPrimary }]}>{t('settings.title')}</Text>

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
          <Ionicons name="language-outline" size={22} color={colors.textPrimary} />
          <Text style={[Typography.heading, { color: colors.textPrimary }]}>
            {t('settings.section.language')}
          </Text>
        </View>

        <Text style={[Typography.caption, { color: colors.textSecondary }]}>
          {t('settings.language.systemHint', { language: systemLanguageLabel })}
        </Text>

        <View style={styles.languageRow}>
          {languageOptions.map((option) => {
            const active = languagePreference === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.languageBtn,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primaryLight : 'transparent',
                  },
                ]}
                onPress={() => {
                  void setLanguagePreference(option.id);
                }}
              >
                <Text
                  style={[
                    Typography.bodySmall,
                    {
                      color: active ? colors.primary : colors.textSecondary,
                    },
                  ]}
                >
                  {option.label}
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
          <Ionicons name="text-outline" size={22} color={colors.textPrimary} />
          <Text style={[Typography.heading, { color: colors.textPrimary }]}>
            {t('settings.section.font')}
          </Text>
        </View>

        <View style={styles.fontRow}>
          {fontOptions.map((option) => {
            const active = fontPreset === option.id;
            const status =
              option.id === 'system' ? { installed: true, downloading: false } : fontAvailability[option.id];
            const disabled = option.id !== 'system' && !status.installed;
            const label = status.downloading
              ? `${fontLabel(option.id)} ${t('settings.font.downloading')}`
              : fontLabel(option.id);

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
                onPress={() => {
                  void handleFontPresetChange(option.id);
                }}
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
          <Text style={[Typography.heading, { color: colors.textPrimary }]}>
            {t('settings.section.syncMethod')}
          </Text>
        </View>

        <Pressable
          style={[styles.selectTrigger, { borderColor: colors.border }]}
          onPress={() => setProviderMenuOpen(true)}
        >
          <Text style={[Typography.caption, { color: colors.textSecondary }]}>
            {t('settings.provider')}
          </Text>
          <View style={styles.selectValueRow}>
            <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>{providerLabel}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
          </View>
        </Pressable>
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
          <Text style={[Typography.heading, { color: colors.textPrimary }]}>
            {t('settings.section.sync')}
          </Text>
        </View>

        <SyncBadge syncState={syncState} />

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: Spacing.sm }]}
          onPress={() => {
            void syncWithGitHub();
          }}
          disabled={syncState.status === 'syncing'}
        >
          {syncState.status === 'syncing' ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={[Typography.button, { color: colors.textInverse }]}>
              {t('common.syncNow')}
            </Text>
          )}
        </TouchableOpacity>
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
              <Text style={[Typography.heading, { color: colors.textPrimary }]}>
                {t('settings.github.title')}
              </Text>
            </View>

            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              {t('settings.github.repoLabel')}
            </Text>
            <TextInput
              value={repo}
              onChangeText={setRepo}
              placeholder={t('settings.github.repoPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="none"
            />

            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              {t('settings.github.tokenLabel')}
            </Text>
            <TextInput
              value={token}
              onChangeText={setToken}
              placeholder={t('settings.github.tokenPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="none"
              secureTextEntry
            />

            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              {t('settings.github.branchLabel')}
            </Text>
            <TextInput
              value={branch}
              onChangeText={setBranch}
              placeholder={t('settings.github.branchPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                void handleSaveGitHubConfig();
              }}
            >
              {saving ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={[Typography.button, { color: colors.textInverse }]}>
                  {t('common.saveConfig')}
                </Text>
              )}
            </TouchableOpacity>

            {githubConfig && (
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: colors.border }]}
                onPress={() => {
                  void handleClearGitHubConfig();
                }}
              >
                <Text style={[Typography.button, { color: colors.textSecondary }]}>
                  {t('common.clearConfig')}
                </Text>
              </TouchableOpacity>
            )}
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
                <Text style={[Typography.heading, { color: colors.textPrimary }]}>
                  {t('settings.github.guideTitle')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </View>
            <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>
              {t('settings.github.guideDesc')}
            </Text>
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
              <Text style={[Typography.heading, { color: colors.textPrimary }]}>
                {t('settings.webdav.title')}
              </Text>
            </View>

            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              {t('settings.webdav.serverUrlLabel')}
            </Text>
            <TextInput
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder={t('settings.webdav.serverUrlPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="none"
            />

            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              {t('settings.webdav.usernameLabel')}
            </Text>
            <TextInput
              value={webdavUsername}
              onChangeText={setWebDAVUsername}
              placeholder={t('settings.webdav.usernamePlaceholder')}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="none"
            />

            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              {t('settings.webdav.passwordLabel')}
            </Text>
            <TextInput
              value={webdavPassword}
              onChangeText={setWebDAVPassword}
              placeholder={t('settings.webdav.passwordPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="none"
              secureTextEntry
            />

            <Text style={[Typography.caption, { color: colors.textSecondary }]}>
              {t('settings.webdav.remoteFileLabel')}
            </Text>
            <TextInput
              value={webdavFileName}
              onChangeText={setWebDAVFileName}
              placeholder={t('settings.webdav.filePlaceholder')}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { borderColor: colors.border, color: colors.textPrimary }]}
              autoCapitalize="none"
            />

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                void handleSaveWebDAVConfigPress();
              }}
            >
              {saving ? (
                <ActivityIndicator color={colors.textInverse} />
              ) : (
                <Text style={[Typography.button, { color: colors.textInverse }]}>
                  {t('common.saveConfig')}
                </Text>
              )}
            </TouchableOpacity>

            {webdavConfig && (
              <TouchableOpacity
                style={[styles.outlineBtn, { borderColor: colors.border }]}
                onPress={() => {
                  void handleClearWebDAVConfigPress();
                }}
              >
                <Text style={[Typography.button, { color: colors.textSecondary }]}>
                  {t('common.clearConfig')}
                </Text>
              </TouchableOpacity>
            )}
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
                <Text style={[Typography.heading, { color: colors.textPrimary }]}>
                  {t('settings.webdav.guideTitle')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </View>
            <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>
              {t('settings.webdav.guideDesc')}
            </Text>
          </TouchableOpacity>
        </>
      )}

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
          <Ionicons name="download-outline" size={22} color={colors.textPrimary} />
          <Text style={[Typography.heading, { color: colors.textPrimary }]}>
            {t('settings.section.update')}
          </Text>
        </View>

        <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>
          {t('settings.version.current', { version: currentVersion })}
        </Text>
        {latestReleaseVersion && (
          <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>
            {t('settings.version.latest', { version: latestReleaseVersion })}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: Spacing.sm }]}
          onPress={() => {
            void handleCheckForUpdate();
          }}
          disabled={checkingUpdate}
        >
          {checkingUpdate ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={[Typography.button, { color: colors.textInverse }]}>
              {t('settings.update.check')}
            </Text>
          )}
        </TouchableOpacity>

        {hasUpdate && latestReleaseUrl && (
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: colors.border }]}
            onPress={() => {
              void openDownloadUrl(latestReleaseUrl);
            }}
          >
            <Text style={[Typography.button, { color: colors.textSecondary }]}>
              {t('settings.update.downloadLatest')}
            </Text>
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
        <View style={styles.sectionHeader}>
          <Ionicons name="archive-outline" size={22} color={colors.textPrimary} />
          <Text style={[Typography.heading, { color: colors.textPrimary }]}>
            {t('settings.section.export')}
          </Text>
        </View>

        <Text style={[Typography.bodySmall, { color: colors.textSecondary }]}>
          {t('settings.export.description')}
        </Text>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, styles.actionBtnHalf, { backgroundColor: colors.primary }]}
            onPress={() => {
              void handleExportNotes();
            }}
            disabled={exportingNotes || importingNotes}
          >
            {exportingNotes ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={[Typography.button, { color: colors.textInverse }]}>
                {t('settings.export.button')}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.outlineBtn, styles.actionBtnHalf, { borderColor: colors.border }]}
            onPress={() => {
              void handleImportNotes();
            }}
            disabled={importingNotes || exportingNotes}
          >
            {importingNotes ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={[Typography.button, { color: colors.textSecondary }]}>
                {t('settings.import.button')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

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
              <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>
                {t('settings.provider.github')}
              </Text>
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
              <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>
                {t('settings.provider.webdav')}
              </Text>
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
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  languageBtn: {
    minHeight: 38,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
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
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  actionBtnHalf: {
    flex: 1,
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


