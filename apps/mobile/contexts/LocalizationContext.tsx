import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const LANGUAGE_PREFERENCE_KEY = '@a_note_language_preference';

export type LanguagePreference = 'system' | 'en' | 'zh';
export type AppLanguage = 'en' | 'zh';

const TRANSLATIONS = {
  en: {
    'common.ok': 'OK',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.save': 'Save',
    'common.clear': 'Clear',
    'common.back': 'Back',
    'common.copy': 'Copy',
    'common.search': 'Search',
    'common.light': 'Light',
    'common.dark': 'Dark',
    'common.syncNow': 'Sync Now',
    'common.saveConfig': 'Save Config',
    'common.clearConfig': 'Clear Config',
    'common.openFailed': 'Open failed',

    'tabs.notes': 'Notes',
    'tabs.settings': 'Settings',

    'home.allNotes': 'All Notes',
    'home.starred': 'Starred',
    'home.recycleBin': 'Recycle Bin',
    'home.noNotesYet': 'No notes yet.',
    'home.syncSuccess': '{provider} sync successful',
    'home.syncFailed': '{provider} sync failed',
    'home.deleteNotePermanently': 'Delete Note Permanently',
    'home.moveNoteToRecycleBin': 'Move Note to Recycle Bin',
    'home.noteRemovedPermanentlyMsg': 'This note will be removed permanently.',
    'home.noteMovedToBinMsg': 'This note will be moved to Recycle Bin.',
    'home.move': 'Move',

    'settings.title': 'Settings',
    'settings.section.language': 'Language',
    'settings.section.font': 'App Font',
    'settings.section.syncMethod': 'Sync Method',
    'settings.section.update': 'App Update',
    'settings.section.export': 'Import / Export',
    'settings.section.sync': 'Sync (also pull down on main screen)',
    'settings.language.system': 'System',
    'settings.language.chinese': 'Chinese',
    'settings.language.english': 'English',
    'settings.language.systemHint': 'Current system language: {language}',
    'settings.systemLang.zh': 'Chinese',
    'settings.systemLang.en': 'English',

    'settings.provider': 'Provider',
    'settings.provider.github': 'GitHub',
    'settings.provider.webdav': 'WebDAV',

    'settings.version.current': 'Current version: v{version}',
    'settings.version.latest': 'Latest release: v{version}',
    'settings.update.check': 'Check Update',
    'settings.update.downloadLatest': 'Download Latest',
    'settings.update.upToDateTitle': 'Up to date',
    'settings.update.availableTitle': 'Update available',
    'settings.update.failedTitle': 'Check failed',
    'settings.update.latestDialog': 'Current: v{current}\nLatest: v{latest}',
    'settings.update.later': 'Later',
    'settings.update.download': 'Download',
    'settings.export.description':
      'Export notes as an MD zip, or import an anote / Smartisan MD zip archive.',
    'settings.export.button': 'Export MD Zip',
    'settings.export.shareTitle': 'Export Notes Zip',
    'settings.export.emptyTitle': 'No notes to export',
    'settings.export.emptyMessage': 'There are no notes outside the recycle bin to export right now.',
    'settings.export.failedTitle': 'Export failed',
    'settings.export.failedMessage': 'Something went wrong while exporting: {error}',
    'settings.export.failedFallback': 'Please try again in a moment.',
    'settings.export.savedTitle': 'Export ready',
    'settings.export.savedMessage':
      'Created {file}, but this device does not support the system share sheet.',
    'settings.import.button': 'Import MD Zip',
    'settings.import.successTitle': 'Import complete',
    'settings.import.successMessage':
      'Imported {count} notes from {format}. Created {folders} folders.',
    'settings.import.unsupportedTitle': 'Unsupported archive',
    'settings.import.unsupportedMessage':
      'This archive is not a supported anote or Smartisan Markdown zip.',
    'settings.import.failedTitle': 'Import failed',
    'settings.import.failedMessage': 'Something went wrong while importing: {error}',
    'settings.import.failedFallback': 'Please try another archive.',
    'settings.import.pickFailed': 'Cannot read this archive.',
    'settings.import.format.anote': 'anote',
    'settings.import.format.smartisan': 'Smartisan Notes',

    'settings.github.title': 'GitHub Sync',
    'settings.github.repoLabel': 'Repo (owner/repo)',
    'settings.github.tokenLabel': 'Token',
    'settings.github.branchLabel': 'Branch',
    'settings.github.repoPlaceholder': 'username/my-notes',
    'settings.github.tokenPlaceholder': 'ghp_xxx',
    'settings.github.branchPlaceholder': 'main',
    'settings.github.guideTitle': 'GitHub Sync Guide',
    'settings.github.guideDesc': 'Step-by-step instructions for creating token and filling repo info.',

    'settings.webdav.title': 'WebDAV Sync',
    'settings.webdav.serverUrlLabel': 'Server URL',
    'settings.webdav.usernameLabel': 'Username',
    'settings.webdav.passwordLabel': 'Password / App Password',
    'settings.webdav.remoteFileLabel': 'Remote File',
    'settings.webdav.serverUrlPlaceholder': 'https://dav.jianguoyun.com/dav/anote_sync/',
    'settings.webdav.usernamePlaceholder': 'your-jianguoyun-username',
    'settings.webdav.passwordPlaceholder': 'your-app-password',
    'settings.webdav.filePlaceholder': 'a-note-sync.json',
    'settings.webdav.guideTitle': 'WebDAV Sync Guide',
    'settings.webdav.guideDesc': 'Jianguoyun example and required fields.',

    'settings.validation.missingFieldTitle': 'Missing field',
    'settings.validation.githubMissingFieldMsg': 'Repo and token are required.',
    'settings.validation.webdavMissingFieldMsg': 'Server URL, Username, and Password are required.',
    'settings.savedTitle': 'Saved',
    'settings.savedGithubMsg': 'GitHub configuration saved.',
    'settings.savedWebdavMsg': 'WebDAV configuration saved.',
    'settings.errorTitle': 'Error',
    'settings.font.downloadTitle': 'Download Font',
    'settings.font.downloadAsk': 'Do you want to download {font}?',
    'settings.font.downloading': 'Downloading...',

    'settings.font.system': 'System',
    'settings.font.sarasa_gothic': 'Sarasa Gothic',
    'settings.font.source_han_serif': 'Source Han Serif',
    'settings.font.glow_sans': 'Glow Sans',

    'settings.error.invalidGithubToken': 'Invalid GitHub token',
    'settings.error.invalidWebdavConfig': 'Invalid WebDAV configuration',
    'settings.error.downloadFailed': 'Download failed',
    'settings.error.checkUpdateFailed': 'Check update failed',
    'settings.error.cannotOpenDownloadLink': 'Cannot open download link.',

    'sync.badge.syncing': 'Syncing...',
    'sync.badge.success': 'Synced',
    'sync.badge.failed': 'Sync failed',

    'folder.system.all': 'All Notes',
    'folder.system.starred': 'Starred',
    'folder.system.trash': 'Recycle Bin',
    'folder.newPlaceholder': 'New folder',
    'folder.deleteTitle': 'Delete Folder',
    'folder.deleteMessage': 'Delete "{name}"? Notes inside will be kept.',

    'note.emptyPreview': "It's empty now, maybe write something?",

    'editor.startTyping': 'Start typing...',
    'editor.permissionRequired': 'Permission required',
    'editor.allowPhotoAccess': 'Please allow photo access first.',
    'editor.insertFailed': 'Insert failed',
    'editor.insertFailedMessage': 'Cannot read this image. Please try another one.',
    'editor.imageTooLarge': 'Image too large',
    'editor.imageTooLargeMessage':
      'This image is {size} MB after compression. Please choose a smaller image.',
    'editor.saveFailed': 'Save failed',
    'editor.saveFailedFallback': 'Please try with a smaller image.',
    'editor.copied': 'Copied',
    'editor.noteCopied': 'Note copied to clipboard.',
    'editor.noteNotFound': 'Note not found.',
    'editor.addToFolder': 'Add to Folder',
    'editor.generateLongImage': 'Generate Long Image',
    'editor.newFolder': 'New folder',

    'longImage.title': 'Long Image',
    'longImage.notSupported': 'Not supported',
    'longImage.notSupportedMessage': 'Please save long images from iOS or Android.',
    'longImage.saved': 'Saved',
    'longImage.savedMessage': 'Long image saved to your photo library.',
    'longImage.saveFailed': 'Save failed',

    'guide.github.title': 'GitHub Sync Guide',
    'guide.github.subtitle': 'Simple setup for first-time users.',
    'guide.github.tip': 'Tip: If sync fails, check token scope and repo path first.',
    'guide.github.step1.title': '1. Create a GitHub token',
    'guide.github.step1.body':
      'Open GitHub > Settings > Developer settings > Personal access tokens. Create a token with repo permission.',
    'guide.github.step2.title': '2. Prepare your repository',
    'guide.github.step2.body':
      'Create an empty private repo. Copy the repo path in owner/repo format, for example: yourname/my-notes.',
    'guide.github.step3.title': '3. Fill settings in this app',
    'guide.github.step3.body':
      'In Settings > GitHub Sync, fill Repo, Token, and Branch (usually main), then tap Save Config.',
    'guide.github.step4.title': '4. Run sync',
    'guide.github.step4.body':
      'Tap Sync Now. If successful, your notes are uploaded and can be restored from GitHub later.',

    'guide.webdav.title': 'WebDAV Sync Guide',
    'guide.webdav.subtitle': 'Jianguoyun example.',
    'guide.webdav.tip':
      'Tip: Use an app password (not account password), and use a subfolder URL like /dav/anote_sync/.',
    'guide.webdav.step1.title': '1. Open Jianguoyun WebDAV',
    'guide.webdav.step1.body': 'Open Jianguoyun settings and enable WebDAV service.',
    'guide.webdav.step2.title': '2. Create Sync Folder (Important)',
    'guide.webdav.step2.body':
      'Jianguoyun does not allow writing directly in WebDAV root. Create a folder first, for example: anote_sync.',
    'guide.webdav.step3.title': '3. Create App Password',
    'guide.webdav.step3.body':
      'In Jianguoyun security settings, create an app-specific password for WebDAV.',
    'guide.webdav.step4.title': '4. Fill in anote settings',
    'guide.webdav.step4.body':
      'Provider = WebDAV, Server URL = https://dav.jianguoyun.com/dav/anote_sync/, Username = Jianguoyun account, Password = app password, Remote File can keep a-note-sync.json.',
    'guide.webdav.step5.title': '5. Save and sync',
    'guide.webdav.step5.body':
      'Tap Save Config, then Sync Now (or pull down on main screen) to run sync.',

    'empty.searchTitle': 'No matching notes',
    'empty.searchSubtitle': 'Try another keyword.',
    'empty.noNotesTitle': 'No notes yet',
    'empty.noNotesSubtitle': 'Tap the + button to create your first note.',
  },
  zh: {
    'common.ok': '确定',
    'common.cancel': '取消',
    'common.delete': '删除',
    'common.save': '保存',
    'common.clear': '清除',
    'common.back': '返回',
    'common.copy': '复制',
    'common.search': '搜索',
    'common.light': '浅色',
    'common.dark': '深色',
    'common.syncNow': '立即同步',
    'common.saveConfig': '保存配置',
    'common.clearConfig': '清除配置',
    'common.openFailed': '打开失败',

    'tabs.notes': '便签',
    'tabs.settings': '设置',

  'home.allNotes': '全部便签',
    'home.starred': '收藏',
    'home.recycleBin': '回收站',
    'home.noNotesYet': '还没有便签。',
    'home.syncSuccess': '{provider} 同步成功',
    'home.syncFailed': '{provider} 同步失败',
    'home.deleteNotePermanently': '永久删除便签',
    'home.moveNoteToRecycleBin': '移动到回收站',
    'home.noteRemovedPermanentlyMsg': '这条便签将被永久删除。',
    'home.noteMovedToBinMsg': '这条便签将被移动到回收站。',
    'home.move': '移动',

    'settings.title': '设置',
    'settings.section.language': '语言',
    'settings.section.font': '字体',
    'settings.section.syncMethod': '同步方式',
    'settings.section.update': '应用更新',
    'settings.section.export': '导入/导出',
    'settings.section.sync': '同步（也可在主界面下拉同步）',
    'settings.language.system': '跟随系统',
    'settings.language.chinese': '中文',
    'settings.language.english': '英文',
    'settings.language.systemHint': '当前系统语言：{language}',
    'settings.systemLang.zh': '中文',
    'settings.systemLang.en': '英文',

    'settings.provider': '提供方',
    'settings.provider.github': 'GitHub',
    'settings.provider.webdav': 'WebDAV',

    'settings.version.current': '当前版本：v{version}',
    'settings.version.latest': '最新版本：v{version}',
    'settings.update.check': '检查更新',
    'settings.update.downloadLatest': '下载最新版本',
    'settings.update.upToDateTitle': '已是最新版本',
    'settings.update.availableTitle': '有新版本可用',
    'settings.update.failedTitle': '检查失败',
    'settings.update.latestDialog': '当前：v{current}\n最新：v{latest}',
    'settings.update.later': '稍后',
    'settings.update.download': '下载',
    'settings.export.description': '可导出 anote 的 MD 压缩包，也可导入 anote / 锤子便签助手导出的 MD 压缩包。',
    'settings.export.button': '导出 MD 压缩包',
    'settings.export.shareTitle': '导出便签压缩包',
    'settings.export.emptyTitle': '没有可导出的便签',
    'settings.export.emptyMessage': '当前没有可导出的非回收站便签。',
    'settings.export.failedTitle': '导出失败',
    'settings.export.failedMessage': '导出过程中出现问题：{error}',
    'settings.export.failedFallback': '请稍后重试。',
    'settings.export.savedTitle': '已导出',
    'settings.export.savedMessage': '已生成 {file}，但当前设备不支持系统分享。',
    'settings.import.button': '导入 MD 压缩包',
    'settings.import.successTitle': '导入完成',
    'settings.import.successMessage': '已从 {format} 导入 {count} 条便签，并创建 {folders} 个文件夹。',
    'settings.import.unsupportedTitle': '不支持的压缩包',
    'settings.import.unsupportedMessage': '这个压缩包不是受支持的 anote 或锤子便签 Markdown 压缩包。',
    'settings.import.failedTitle': '导入失败',
    'settings.import.failedMessage': '导入过程中出现问题：{error}',
    'settings.import.failedFallback': '请尝试其他压缩包。',
    'settings.import.pickFailed': '无法读取这个压缩包。',
    'settings.import.format.anote': 'anote',
    'settings.import.format.smartisan': '锤子便签',

    'settings.github.title': 'GitHub 同步',
    'settings.github.repoLabel': '仓库（owner/repo）',
    'settings.github.tokenLabel': 'Token',
    'settings.github.branchLabel': '分支',
    'settings.github.repoPlaceholder': 'username/my-notes',
    'settings.github.tokenPlaceholder': 'ghp_xxx',
    'settings.github.branchPlaceholder': 'main',
    'settings.github.guideTitle': 'GitHub 同步指南',
    'settings.github.guideDesc': '按步骤创建 Token 并填写仓库信息。',

    'settings.webdav.title': 'WebDAV 同步',
    'settings.webdav.serverUrlLabel': '服务器地址',
    'settings.webdav.usernameLabel': '用户名',
    'settings.webdav.passwordLabel': '密码 / 应用密码',
    'settings.webdav.remoteFileLabel': '远程文件名',
    'settings.webdav.serverUrlPlaceholder': 'https://dav.jianguoyun.com/dav/anote_sync/',
    'settings.webdav.usernamePlaceholder': '你的坚果云用户名',
    'settings.webdav.passwordPlaceholder': '你的应用密码',
    'settings.webdav.filePlaceholder': 'a-note-sync.json',
    'settings.webdav.guideTitle': 'WebDAV 同步指南',
    'settings.webdav.guideDesc': '坚果云配置示例与字段说明。',

    'settings.validation.missingFieldTitle': '缺少必填项',
    'settings.validation.githubMissingFieldMsg': '仓库和 Token 不能为空。',
    'settings.validation.webdavMissingFieldMsg': '服务器地址、用户名和密码不能为空。',
    'settings.savedTitle': '已保存',
    'settings.savedGithubMsg': 'GitHub 配置已保存。',
    'settings.savedWebdavMsg': 'WebDAV 配置已保存。',
    'settings.errorTitle': '错误',
    'settings.font.downloadTitle': '下载字体',
    'settings.font.downloadAsk': '要下载 {font} 吗？',
    'settings.font.downloading': '下载中...',

    'settings.font.system': '系统',
    'settings.font.sarasa_gothic': '更纱黑体',
    'settings.font.source_han_serif': '思源宋体',
    'settings.font.glow_sans': '未来荧黑',

    'settings.error.invalidGithubToken': 'GitHub Token 无效',
    'settings.error.invalidWebdavConfig': 'WebDAV 配置无效',
    'settings.error.downloadFailed': '下载失败',
    'settings.error.checkUpdateFailed': '检查更新失败',
    'settings.error.cannotOpenDownloadLink': '无法打开下载链接。',

    'sync.badge.syncing': '同步中...',
    'sync.badge.success': '已同步',
    'sync.badge.failed': '同步失败',

    'folder.system.all': '全部',
    'folder.system.starred': '收藏',
    'folder.system.trash': '回收站',
    'folder.newPlaceholder': '新建文件夹',
    'folder.deleteTitle': '删除文件夹',
    'folder.deleteMessage': '删除“{name}”？其中便签会被保留。',

    'note.emptyPreview': '目前是空的，写点什么吧？',

    'editor.startTyping': '开始输入...',
    'editor.permissionRequired': '需要权限',
    'editor.allowPhotoAccess': '请先允许访问相册。',
    'editor.insertFailed': '插入失败',
    'editor.insertFailedMessage': '无法读取图片，请换一张试试。',
    'editor.imageTooLarge': '图片过大',
    'editor.imageTooLargeMessage': '压缩后图片大小为 {size} MB，请选择更小的图片。',
    'editor.saveFailed': '保存失败',
    'editor.saveFailedFallback': '请尝试使用更小的图片。',
    'editor.copied': '已复制',
    'editor.noteCopied': '便签内容已复制。',
    'editor.noteNotFound': '未找到该便签。',
    'editor.addToFolder': '添加到文件夹',
    'editor.generateLongImage': '生成长图',
    'editor.newFolder': '新建文件夹',

    'longImage.title': '长图',
    'longImage.notSupported': '暂不支持',
    'longImage.notSupportedMessage': '请在 iOS 或 Android 上保存长图。',
    'longImage.saved': '已保存',
    'longImage.savedMessage': '长图已保存到系统相册。',
    'longImage.saveFailed': '保存失败',

    'guide.github.title': 'GitHub 同步指南',
    'guide.github.subtitle': '首次使用可按以下步骤配置。',
    'guide.github.tip': '提示：同步失败时，优先检查 Token 权限和仓库路径。',
    'guide.github.step1.title': '1. 创建 GitHub Token',
    'guide.github.step1.body':
      '打开 GitHub > Settings > Developer settings > Personal access tokens，创建带 repo 权限的 Token。',
    'guide.github.step2.title': '2. 准备仓库',
    'guide.github.step2.body':
      '创建一个空的私有仓库，复制 owner/repo 格式路径，例如：yourname/my-notes。',
    'guide.github.step3.title': '3. 在应用内填写配置',
    'guide.github.step3.body':
      '进入 设置 > GitHub 同步，填写 Repo、Token、Branch（通常是 main），然后点击保存配置。',
    'guide.github.step4.title': '4. 执行同步',
    'guide.github.step4.body': '点击立即同步。成功后便签会上传到 GitHub，后续可用于恢复。',

    'guide.webdav.title': 'WebDAV 同步指南',
    'guide.webdav.subtitle': '以坚果云为例。',
    'guide.webdav.tip': '提示：请使用应用密码（不是账号密码），并使用子目录地址，例如 /dav/anote_sync/。',
    'guide.webdav.step1.title': '1. 打开坚果云 WebDAV',
    'guide.webdav.step1.body': '在坚果云设置中开启 WebDAV 服务。',
    'guide.webdav.step2.title': '2. 创建同步文件夹（重要）',
    'guide.webdav.step2.body': '坚果云不允许直接写入 WebDAV 根目录。请先创建文件夹，例如 anote_sync。',
    'guide.webdav.step3.title': '3. 创建应用密码',
    'guide.webdav.step3.body': '在坚果云安全设置中创建一个 WebDAV 专用应用密码。',
    'guide.webdav.step4.title': '4. 在anote中填写配置',
    'guide.webdav.step4.body':
      '提供方选择 WebDAV，服务器地址填写 https://dav.jianguoyun.com/dav/anote_sync/，用户名填坚果云账号，密码填应用密码，远程文件名可保持 a-note-sync.json。',
    'guide.webdav.step5.title': '5. 保存并同步',
    'guide.webdav.step5.body': '点击保存配置后，再点立即同步（或在主界面下拉）执行同步。',

    'empty.searchTitle': '未找到匹配便签',
    'empty.searchSubtitle': '试试其他关键词。',
    'empty.noNotesTitle': '还没有便签',
    'empty.noNotesSubtitle': '点击右下角 + 创建你的第一条便签。',
  },
} as const;

type TranslationMap = typeof TRANSLATIONS.en;
export type TranslationKey = keyof TranslationMap;

function detectSystemLanguage(): AppLanguage {
  const locale = String(Intl.DateTimeFormat().resolvedOptions().locale || '').toLowerCase();
  return locale.startsWith('zh') ? 'zh' : 'en';
}

function fillTemplate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

interface LocalizationContextValue {
  languagePreference: LanguagePreference;
  language: AppLanguage;
  systemLanguage: AppLanguage;
  setLanguagePreference: (next: LanguagePreference) => Promise<void>;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

const LocalizationContext = createContext<LocalizationContextValue | undefined>(undefined);

function toLanguagePreference(raw: string | null): LanguagePreference {
  if (raw === 'en' || raw === 'zh' || raw === 'system') return raw;
  return 'system';
}

export function LocalizationProvider({ children }: { children: React.ReactNode }) {
  const [languagePreference, setLanguagePreferenceState] = useState<LanguagePreference>('system');
  const systemLanguage = useMemo(() => detectSystemLanguage(), []);
  const language: AppLanguage = languagePreference === 'system' ? systemLanguage : languagePreference;

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY);
        setLanguagePreferenceState(toLanguagePreference(saved));
      } catch {
        setLanguagePreferenceState('system');
      }
    })();
  }, []);

  const setLanguagePreference = useCallback(async (next: LanguagePreference) => {
    setLanguagePreferenceState(next);
    try {
      await AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, next);
    } catch {
      // ignore persist failures to avoid blocking UI
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>): string => {
      const template = TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key;
      return fillTemplate(template, params);
    },
    [language]
  );

  const value = useMemo<LocalizationContextValue>(
    () => ({
      languagePreference,
      language,
      systemLanguage,
      setLanguagePreference,
      t,
    }),
    [language, languagePreference, setLanguagePreference, systemLanguage, t]
  );

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization(): LocalizationContextValue {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error('useLocalization must be used within LocalizationProvider');
  return context;
}
