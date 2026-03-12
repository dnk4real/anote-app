import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons';
import { getString } from '../lib/strings';
import type {
  AppLanguage,
  DesktopSettings,
  DownloadableFontPreset,
  FontAvailabilityMap,
  FontPreset,
  GitHubConfig,
  SyncProvider,
  WebDAVConfig,
} from '../lib/models';

const RELEASE_REPO = 'dnk4real/anote-app';
const RELEASE_API_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;

interface SettingsViewProps {
  language: AppLanguage;
  settings: DesktopSettings;
  syncStatusText: string;
  appVersion: string;
  fontAvailability: FontAvailabilityMap;
  fontBusyPreset: DownloadableFontPreset | null;
  onSaveSettings: (patch: Partial<DesktopSettings>) => Promise<void>;
  onSyncNow: () => Promise<void>;
  onSelectFontPreset: (preset: FontPreset) => Promise<void>;
  onDownloadFont: (preset: DownloadableFontPreset) => Promise<void>;
}

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

const FONT_OPTIONS: FontPreset[] = ['system', 'sarasa_gothic', 'source_han_serif', 'glow_sans'];

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
  const desktopAsset = release.assets?.find((asset) => {
    const lowerName = asset.name.toLowerCase();
    return lowerName.endsWith('.exe') || lowerName.endsWith('.msi');
  });

  return desktopAsset?.browser_download_url ?? release.html_url;
}

function normalizeErrorMessage(language: AppLanguage, message: string): string {
  if (message === 'Invalid GitHub token') {
    return language === 'zh' ? 'GitHub Token 无效。' : 'Invalid GitHub token.';
  }
  if (message === 'Invalid WebDAV configuration') {
    return language === 'zh' ? 'WebDAV 配置无效。' : 'Invalid WebDAV configuration.';
  }
  if (message === 'FONT_NOT_DOWNLOADED') {
    return getString(language, 'fontUnavailable');
  }
  return message;
}

export function SettingsView({
  language,
  settings,
  syncStatusText,
  appVersion,
  fontAvailability,
  fontBusyPreset,
  onSaveSettings,
  onSyncNow,
  onSelectFontPreset,
  onDownloadFont,
}: SettingsViewProps) {
  const t = (key: Parameters<typeof getString>[1]) => getString(language, key);
  const [githubConfig, setGithubConfig] = useState<GitHubConfig>(
    settings.githubConfig ?? { repo: '', token: '', branch: 'main' }
  );
  const [webdavConfig, setWebdavConfig] = useState<WebDAVConfig>(
    settings.webdavConfig ?? {
      serverUrl: '',
      username: '',
      password: '',
      fileName: 'a-note-sync.json',
    }
  );
  const [feedback, setFeedback] = useState('');
  const [latestReleaseVersion, setLatestReleaseVersion] = useState<string | null>(null);
  const [latestReleaseUrl, setLatestReleaseUrl] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    setGithubConfig(settings.githubConfig ?? { repo: '', token: '', branch: 'main' });
    setWebdavConfig(
      settings.webdavConfig ?? {
        serverUrl: '',
        username: '',
        password: '',
        fileName: 'a-note-sync.json',
      }
    );
  }, [settings.githubConfig, settings.webdavConfig]);

  const hasUpdate = useMemo(() => {
    if (!latestReleaseVersion) return false;
    return compareVersions(appVersion, latestReleaseVersion) < 0;
  }, [appVersion, latestReleaseVersion]);

  const selectedFontStatus = fontAvailability[settings.fontPreset];

  async function handleCheckUpdate() {
    setCheckingUpdate(true);
    setFeedback('');

    try {
      const response = await fetch(RELEASE_API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (!response.ok) {
        throw new Error(`GitHub request failed (${response.status})`);
      }

      const release = (await response.json()) as GitHubLatestRelease;
      const latestVersion = normalizeVersion(release.tag_name || release.name || '');
      setLatestReleaseVersion(latestVersion);
      setLatestReleaseUrl(pickReleaseDownloadUrl(release));
      setFeedback(compareVersions(appVersion, latestVersion) < 0 ? t('updateAvailable') : t('upToDate'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('updateCheckFailed');
      setFeedback(normalizeErrorMessage(language, message));
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleFontSelect(preset: FontPreset) {
    setFeedback('');
    try {
      if (preset === 'system' || fontAvailability[preset].installed) {
        await onSelectFontPreset(preset);
        setFeedback(t('saveSuccess'));
        return;
      }

      const confirmed = window.confirm(
        language === 'zh'
          ? '这个字体还没下载，是否现在下载？'
          : 'This font is not downloaded yet. Download it now?'
      );
      if (!confirmed) {
        return;
      }

      await onDownloadFont(preset);
      await onSelectFontPreset(preset);
      setFeedback(t('fontDownloaded'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('fontUnavailable');
      setFeedback(normalizeErrorMessage(language, message));
    }
  }

  async function handleManualFontDownload() {
    if (settings.fontPreset === 'system') return;
    setFeedback('');
    try {
      await onDownloadFont(settings.fontPreset);
      setFeedback(t('fontDownloaded'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('fontUnavailable');
      setFeedback(normalizeErrorMessage(language, message));
    }
  }

  async function handleSaveGitHubConfig() {
    if (!githubConfig.repo.trim() || !githubConfig.token.trim()) {
      setFeedback(t('missingGithubFields'));
      return;
    }

    setSavingKey('github');
    try {
      await onSaveSettings({
        githubConfig: {
          repo: githubConfig.repo.trim(),
          token: githubConfig.token.trim(),
          branch: githubConfig.branch.trim() || 'main',
        },
      });
      setFeedback(t('saveSuccess'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      setFeedback(normalizeErrorMessage(language, message));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleClearGitHubConfig() {
    setSavingKey('github-clear');
    try {
      await onSaveSettings({ githubConfig: null });
      setGithubConfig({ repo: '', token: '', branch: 'main' });
      setFeedback(t('configCleared'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clear failed';
      setFeedback(normalizeErrorMessage(language, message));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleSaveWebdavConfig() {
    if (!webdavConfig.serverUrl.trim() || !webdavConfig.username.trim() || !webdavConfig.password.trim()) {
      setFeedback(t('missingWebdavFields'));
      return;
    }

    setSavingKey('webdav');
    try {
      await onSaveSettings({
        webdavConfig: {
          serverUrl: webdavConfig.serverUrl.trim(),
          username: webdavConfig.username.trim(),
          password: webdavConfig.password,
          fileName: webdavConfig.fileName.trim() || 'a-note-sync.json',
        },
      });
      setFeedback(t('saveSuccess'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Save failed';
      setFeedback(normalizeErrorMessage(language, message));
    } finally {
      setSavingKey(null);
    }
  }

  async function handleClearWebdavConfig() {
    setSavingKey('webdav-clear');
    try {
      await onSaveSettings({ webdavConfig: null });
      setWebdavConfig({
        serverUrl: '',
        username: '',
        password: '',
        fileName: 'a-note-sync.json',
      });
      setFeedback(t('configCleared'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clear failed';
      setFeedback(normalizeErrorMessage(language, message));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="settings-view">
      <div className="settings-hero">
        <div>
          <p className="settings-overline">{t('desktopSettings')}</p>
          <h2 className="settings-title">{t('desktopSettingsTitle')}</h2>
        </div>
        <button className="primary-button settings-sync-button" type="button" onClick={() => void onSyncNow()}>
          <Icon name="sync_outline" size={16} strokeWidth={1.9} />
          <span>{t('syncNow')}</span>
        </button>
      </div>

      <div className="settings-status-stack">
        <p className="settings-sync-status">{syncStatusText}</p>
        {feedback ? <p className="settings-feedback">{feedback}</p> : null}
      </div>

      <div className="settings-grid">
        <SettingCard title={t('basics')}>
          <Field label={t('language')} icon="language_outline">
            <SelectShell>
              <select
                value={settings.languagePreference}
                onChange={(event) =>
                  void onSaveSettings({
                    languagePreference: event.target.value as DesktopSettings['languagePreference'],
                  })
                }
              >
                <option value="system">{language === 'zh' ? '跟随系统' : 'System'}</option>
                <option value="zh">中文</option>
                <option value="en">English</option>
              </select>
            </SelectShell>
          </Field>

          <Field label={t('font')} icon="text_outline">
            <SelectShell>
              <select
                value={settings.fontPreset}
                onChange={(event) => void handleFontSelect(event.target.value as FontPreset)}
              >
                {FONT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {fontOptionLabel(language, option)}
                  </option>
                ))}
              </select>
            </SelectShell>
          </Field>

          <div className="settings-inline-actions">
            <span className={`settings-tag ${selectedFontStatus?.installed ? 'success' : ''}`}>
              {settings.fontPreset === 'system'
                ? language === 'zh'
                  ? '系统字体'
                  : 'System font'
                : selectedFontStatus?.installed
                  ? language === 'zh'
                    ? '已下载'
                    : 'Installed'
                  : t('fontUnavailable')}
            </span>
            {settings.fontPreset !== 'system' && !selectedFontStatus?.installed ? (
              <button
                className="settings-save-button"
                type="button"
                disabled={fontBusyPreset === settings.fontPreset}
                onClick={() => void handleManualFontDownload()}
              >
                <Icon name="download_outline" size={16} strokeWidth={1.9} />
                <span>{fontBusyPreset === settings.fontPreset ? t('fontDownloading') : t('downloadFont')}</span>
              </button>
            ) : null}
          </div>

          <Field label={t('syncProvider')} icon="sync_outline">
            <SelectShell>
              <select
                value={settings.syncProvider}
                onChange={(event) =>
                  void onSaveSettings({
                    syncProvider: event.target.value as SyncProvider,
                  })
                }
              >
                <option value="github">GitHub</option>
                <option value="webdav">WebDAV</option>
              </select>
            </SelectShell>
          </Field>
        </SettingCard>

        <SettingCard title={language === 'zh' ? '版本与更新' : 'Version & Updates'}>
          <Field label={t('currentVersion')}>
            <input value={appVersion} readOnly />
          </Field>
          <Field label={t('latestRelease')}>
            <input value={latestReleaseVersion ?? '-'} readOnly />
          </Field>

          <div className="settings-inline-actions">
            <button
              className="settings-save-button"
              type="button"
              disabled={checkingUpdate}
              onClick={() => void handleCheckUpdate()}
            >
              <Icon name="download_outline" size={16} strokeWidth={1.9} />
              <span>{checkingUpdate ? (language === 'zh' ? '检查中...' : 'Checking...') : t('checkUpdate')}</span>
            </button>
            {hasUpdate && latestReleaseUrl ? (
              <button
                className="settings-save-button"
                type="button"
                onClick={() => window.open(latestReleaseUrl, '_blank', 'noopener,noreferrer')}
              >
                <Icon name="download" size={15} strokeWidth={1.9} />
                <span>{t('downloadLatest')}</span>
              </button>
            ) : null}
          </div>
        </SettingCard>

        <SettingCard title="GitHub" icon="github">
          <Field label={t('repoLabel')}>
            <input
              value={githubConfig.repo}
              placeholder="owner/repo"
              onChange={(event) => setGithubConfig((previous) => ({ ...previous, repo: event.target.value }))}
            />
          </Field>
          <Field label={t('tokenLabel')}>
            <input
              value={githubConfig.token}
              type="password"
              placeholder="ghp_xxx"
              onChange={(event) => setGithubConfig((previous) => ({ ...previous, token: event.target.value }))}
            />
          </Field>
          <Field label={t('branchLabel')}>
            <input
              value={githubConfig.branch}
              placeholder="main"
              onChange={(event) => setGithubConfig((previous) => ({ ...previous, branch: event.target.value }))}
            />
          </Field>
          <div className="settings-inline-actions">
            <button
              className="settings-save-button"
              type="button"
              disabled={savingKey === 'github'}
              onClick={() => void handleSaveGitHubConfig()}
            >
              <Icon name="sync_outline" size={16} strokeWidth={1.9} />
              <span>{t('saveGithubConfig')}</span>
            </button>
            <button
              className="paper-action"
              type="button"
              disabled={savingKey === 'github-clear'}
              onClick={() => void handleClearGitHubConfig()}
            >
              {t('clearConfig')}
            </button>
          </div>
        </SettingCard>

        <SettingCard title="WebDAV" icon="cloud_outline">
          <Field label={t('serverUrl')}>
            <input
              value={webdavConfig.serverUrl}
              placeholder="https://dav.jianguoyun.com/dav/anote_sync/"
              onChange={(event) =>
                setWebdavConfig((previous) => ({ ...previous, serverUrl: event.target.value }))
              }
            />
          </Field>
          <Field label={t('username')}>
            <input
              value={webdavConfig.username}
              onChange={(event) =>
                setWebdavConfig((previous) => ({ ...previous, username: event.target.value }))
              }
            />
          </Field>
          <Field label={t('password')}>
            <input
              value={webdavConfig.password}
              type="password"
              onChange={(event) =>
                setWebdavConfig((previous) => ({ ...previous, password: event.target.value }))
              }
            />
          </Field>
          <Field label={t('remoteFile')}>
            <input
              value={webdavConfig.fileName}
              placeholder="a-note-sync.json"
              onChange={(event) =>
                setWebdavConfig((previous) => ({ ...previous, fileName: event.target.value }))
              }
            />
          </Field>
          <div className="settings-inline-actions">
            <button
              className="settings-save-button"
              type="button"
              disabled={savingKey === 'webdav'}
              onClick={() => void handleSaveWebdavConfig()}
            >
              <Icon name="sync_outline" size={16} strokeWidth={1.9} />
              <span>{t('saveWebdavConfig')}</span>
            </button>
            <button
              className="paper-action"
              type="button"
              disabled={savingKey === 'webdav-clear'}
              onClick={() => void handleClearWebdavConfig()}
            >
              {t('clearConfig')}
            </button>
          </div>
        </SettingCard>
      </div>
    </section>
  );
}

function SelectShell({ children }: { children: ReactNode }) {
  return (
    <span className="settings-select-wrap">
      {children}
      <Icon name="chevron_down" size={16} strokeWidth={2} className="settings-select-chevron" />
    </span>
  );
}

function fontOptionLabel(language: AppLanguage, preset: FontPreset): string {
  if (preset === 'system') return language === 'zh' ? '系统' : 'System';
  if (preset === 'sarasa_gothic') return language === 'zh' ? '更纱黑体' : 'Sarasa Gothic';
  if (preset === 'source_han_serif') return language === 'zh' ? '思源宋体' : 'Source Han Serif';
  return language === 'zh' ? '未来荧黑' : 'Glow Sans';
}

function SettingCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: Parameters<typeof Icon>[0]['name'];
  children: ReactNode;
}) {
  return (
    <section className="setting-card">
      <div className="setting-card-header">
        {icon ? <Icon name={icon} size={18} strokeWidth={1.9} className="setting-card-header-icon" /> : null}
        <h3 className="setting-card-title">{title}</h3>
      </div>
      <div className="setting-card-body">{children}</div>
    </section>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: Parameters<typeof Icon>[0]['name'];
  children: ReactNode;
}) {
  return (
    <label className="settings-field">
      <span className="settings-field-label">
        {icon ? <Icon name={icon} size={16} strokeWidth={1.9} className="settings-field-icon" /> : null}
        <span>{label}</span>
      </span>
      {children}
    </label>
  );
}
