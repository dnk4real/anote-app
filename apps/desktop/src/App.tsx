import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LongImageModal } from './components/long-image-modal';
import {
  RichTextEditor,
  type RichTextCommand,
  type RichTextEditorHandle,
} from './components/rich-text-editor';
import { SettingsView } from './components/settings-view';
import { useAnoteDesktop } from './hooks/use-anote-desktop';
import { Icon } from './icons';
import {
  downloadDesktopFontPreset,
  getDesktopAppVersion,
  getDesktopFontAvailability,
  saveDesktopLongImage,
} from './lib/desktop-bridge';
import { resolveDesktopFontBundle } from './lib/desktop-fonts';
import type { DownloadableFontPreset, FontPreset } from './lib/models';
import {
  buildNotePreview,
  buildSuggestedNoteFileName,
  getWordCount,
  stripHtml,
} from './lib/note-utils';
import { getString } from './lib/strings';

const DEFAULT_FONT_BUNDLE = {
  appFontFamily:
    '"Segoe UI Variable Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  editorFontFamily:
    '"Segoe UI Variable Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  editorFontFaceCss: '',
};

const FORMAT_BUTTONS: Array<{ command: RichTextCommand; label?: string; icon?: Parameters<typeof Icon>[0]['name'] }> = [
  { command: 'heading', label: 'H' },
  { command: 'bold', icon: 'format_bold' },
  { command: 'italic', icon: 'format_italic' },
  { command: 'center', icon: 'align_center' },
  { command: 'list', icon: 'list_bullets' },
  { command: 'quote', icon: 'quote_mark' },
];

export default function App() {
  const app = useAnoteDesktop();
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const folderMenuRef = useRef<HTMLDivElement | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [appVersion, setAppVersion] = useState('0.1.0');
  const [fontAvailability, setFontAvailability] = useState({
    system: { installed: true, downloading: false },
    sarasa_gothic: { installed: false, downloading: false },
    source_han_serif: { installed: false, downloading: false },
    glow_sans: { installed: false, downloading: false },
  });
  const [fontBusyPreset, setFontBusyPreset] = useState<DownloadableFontPreset | null>(null);
  const [fontBundle, setFontBundle] = useState(DEFAULT_FONT_BUNDLE);
  const [isLongImageOpen, setIsLongImageOpen] = useState(false);
  const [exportingLongImage, setExportingLongImage] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [activeFormats, setActiveFormats] = useState<Record<string, boolean>>({});

  const controls = window.anoteDesktop?.windowControls;
  const showWindowControls = window.anoteDesktop?.platform !== 'darwin' && Boolean(controls);
  const t = (key: Parameters<typeof getString>[1]) => getString(app.language, key);

  useEffect(() => {
    if (!controls) return;
    let active = true;
    controls
      .getMaximized()
      .then((value) => {
        if (active) {
          setIsMaximized(value);
        }
      })
      .catch(() => {});

    const unsubscribe = controls.onMaximizedChange((value) => {
      setIsMaximized(value);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [controls]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const [version, availability] = await Promise.all([
          getDesktopAppVersion(),
          getDesktopFontAvailability(),
        ]);
        if (!active) return;
        setAppVersion(version);
        setFontAvailability(availability);
      } catch {
        // keep defaults
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const nextBundle = await resolveDesktopFontBundle(app.settings.fontPreset);
        if (active) {
          setFontBundle(nextBundle);
        }
      } catch {
        if (active) {
          setFontBundle(DEFAULT_FONT_BUNDLE);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [app.settings.fontPreset]);

  useEffect(() => {
    if (!shareMenuOpen && !folderMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (shareMenuOpen && shareMenuRef.current && !shareMenuRef.current.contains(target)) {
        setShareMenuOpen(false);
      }
      if (folderMenuOpen && folderMenuRef.current && !folderMenuRef.current.contains(target)) {
        setFolderMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [folderMenuOpen, shareMenuOpen]);

  useEffect(() => {
    if (!isDraggingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      // Constrain width between 200px and 350px
      const newWidth = Math.max(200, Math.min(350, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSidebar]);

  const folderCounts = useMemo(() => {
    return new Map(
      app.folders.map((folder) => [
        folder.id,
        app.notes.filter((note) => !note.isDeleted && note.folderIds.includes(folder.id)).length,
      ])
    );
  }, [app.folders, app.notes]);

  const appStyle = useMemo(
    () =>
      ({
        '--app-content-font': fontBundle.appFontFamily,
      }) as CSSProperties,
    [fontBundle.appFontFamily]
  );

  const syncStatusText =
    app.syncState.status === 'error' && app.syncState.error
      ? `${t('syncErrorPrefix')} ${app.syncState.error}`
      : app.syncState.status === 'success'
        ? t('syncSuccess')
        : t('syncIdle');

  const currentFolder = app.activeFolderId
    ? app.folders.find((folder) => folder.id === app.activeFolderId) ?? null
    : null;
  const listTitle = currentFolder
    ? currentFolder.name
    : app.systemView === 'starred'
      ? t('starred')
      : app.systemView === 'trash'
        ? t('recycleBin')
        : t('allNotes');

  const emptyState = app.searchQuery.trim()
    ? {
        title: t('noSearchTitle'),
        subtitle: t('noSearchSubtitle'),
      }
    : {
        title: t('noNotesTitle'),
        subtitle: t('noNotesSubtitle'),
      };

  const handleSelectNote = async (noteId: string) => {
    if (app.selectedNoteId && app.selectedNoteId !== noteId) {
      await app.cleanupBlankNote(app.selectedNoteId);
    }
    app.setWorkspaceView('notes');
    app.setSelectedNoteId(noteId);
    setShareMenuOpen(false);
    setFolderMenuOpen(false);
  };

  const handleOpenSettings = async () => {
    await app.cleanupBlankNote(app.selectedNoteId);
    app.setWorkspaceView('settings');
    setShareMenuOpen(false);
    setFolderMenuOpen(false);
  };

  const handleChangeView = async (view: 'all' | 'starred' | 'trash', folderId: string | null) => {
    await app.cleanupBlankNote(app.selectedNoteId);
    app.setWorkspaceView('notes');
    app.setActiveFolderId(folderId);
    app.setSystemView(view);
    setShareMenuOpen(false);
    setFolderMenuOpen(false);
  };

  const handleCreateNote = async () => {
    await app.createNote('', app.activeFolderId ?? undefined);
  };

  const handleCreateFolder = async () => {
    const input = window.prompt(t('newFolder'));
    if (!input) return;
    await app.createFolder(input);
  };

  const handleCreateFolderInline = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    await app.createFolder(trimmed);
    setNewFolderName('');
  };

  const handleRenameFolder = async (folderId: string) => {
    const current = app.folders.find((folder) => folder.id === folderId);
    if (!current) return;
    const input = window.prompt(t('renameFolder'), current.name);
    if (!input) return;
    await app.renameFolder(folderId, input);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const current = app.folders.find((folder) => folder.id === folderId);
    if (!current) return;
    const confirmed = window.confirm(`${t('deleteFolder')} "${current.name}"?`);
    if (!confirmed) return;
    await app.deleteFolder(folderId);
  };

  const handleSyncNow = async () => {
    try {
      await app.syncNow();
    } catch {
      // sync state already updated in hook
    }
  };

  const handleSelectFontPreset = async (preset: FontPreset) => {
    const bundle = await resolveDesktopFontBundle(preset);
    setFontBundle(bundle);
    await app.updateSettings({ fontPreset: preset });
  };

  const handleDownloadFont = async (preset: DownloadableFontPreset) => {
    setFontBusyPreset(preset);
    try {
      const availability = await downloadDesktopFontPreset(preset);
      setFontAvailability(availability);
    } finally {
      setFontBusyPreset(null);
    }
  };

  const handleExportLongImage = async (payload: { html: string; width: number }) => {
    if (!app.selectedNote) return;
    setExportingLongImage(true);
    try {
      const result = await saveDesktopLongImage({
        html: payload.html,
        width: payload.width,
        suggestedName: buildSuggestedNoteFileName(app.selectedNote.content, app.language),
      });
      if (result.filePath) {
        setIsLongImageOpen(false);
        setShareMenuOpen(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Export failed.';
      window.alert(message);
    } finally {
      setExportingLongImage(false);
    }
  };

  const handleCopyText = async () => {
    if (!app.selectedNote) return;
    try {
      await copyPlainText(stripHtml(app.selectedNote.content));
      setShareMenuOpen(false);
    } catch {
      window.alert(app.language === 'zh' ? '复制失败。' : 'Copy failed.');
    }
  };

  const handleToolbarCommand = (command: RichTextCommand) => {
    editorRef.current?.applyCommand(command);
  };

  const handleToggleFolder = async (event: ReactMouseEvent, folderId: string) => {
    event.preventDefault();
    if (!app.selectedNote) return;
    await app.assignFolder(app.selectedNote.id, folderId);
  };

  const editorMetaText = app.selectedNote
    ? `${formatEditorTimestamp(app.selectedNote.updatedAt, app.language)}`
    : '';

  const folderDisplayText = (() => {
    if (!app.selectedNote) return t('addToFolder');
    const noteFolderIds = app.selectedNote.folderIds;
    if (noteFolderIds.length === 0) return t('addToFolder');
    const firstFolder = app.folders.find((f) => f.id === noteFolderIds[0]);
    if (!firstFolder) return t('addToFolder');
    const shortName = firstFolder.name.length > 8 ? `${firstFolder.name.slice(0, 8)}...` : firstFolder.name;
    if (noteFolderIds.length > 1) return `#${shortName}&...`;
    return `#${shortName}`;
  })();

  return (
    <div className="desktop-app real-app" style={appStyle}>
      <header className="window-titlebar">
        <div className="window-drag-region" />
        {showWindowControls ? (
          <div className="window-controls">
            <button className="window-control-btn" type="button" aria-label="Minimize" onClick={() => void controls?.minimize()}>
              <Icon name="window_minimize" size={14} strokeWidth={2.5} className="window-control-icon minimize-icon" />
            </button>
            <button
              className="window-control-btn"
              type="button"
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
              onClick={() => void controls?.toggleMaximize()}
            >
              <Icon
                name={isMaximized ? 'window_restore' : 'window_maximize'}
                size={13}
                strokeWidth={2.5}
                className="window-control-icon"
              />
            </button>
            <button className="window-control-btn close" type="button" aria-label="Close" onClick={() => void controls?.close()}>
              <Icon name="window_close" size={14} strokeWidth={2.5} className="window-control-icon" />
            </button>
          </div>
        ) : null}
      </header>

      <div
        className={`desktop-shell ${isDraggingSidebar ? 'is-dragging' : ''}`}
        style={{ gridTemplateColumns: `${sidebarWidth}px 4px 1fr` }}
      >
        <aside className="sidebar">
          <div className="sidebar-top-row">
            <span className="sidebar-brand">anote</span>
            <div className="sidebar-top-actions">
              <button className="sidebar-icon-btn" type="button" onClick={() => void app.syncNow()} title={t('syncNow')}>
                <Icon name="sync_outline" size={16} strokeWidth={1.9} />
              </button>
              <button className="sidebar-icon-btn" type="button" onClick={handleCreateNote} title={t('newNote')}>
                <Icon name="edit" size={16} strokeWidth={1.9} />
              </button>
            </div>
          </div>

          <label className="search-shell">
            <Icon name="search" size={15} className="search-icon" />
            <input
              value={app.searchQuery}
              onChange={(event) => app.setSearchQuery(event.target.value)}
              placeholder={t('searchPlaceholder')}
            />
          </label>

          <div className="sidebar-scroll">
            <Section title={t('allNotes')} count={app.notes.filter((note) => !note.isDeleted).length}>
              <SidebarFilterRow
                active={!app.activeFolderId && app.systemView === 'all'}
                icon="document_outline"
                label={t('allNotes')}
                count={app.notes.filter((note) => !note.isDeleted).length}
                onClick={() => void handleChangeView('all', null)}
              />
              <SidebarFilterRow
                active={!app.activeFolderId && app.systemView === 'starred'}
                icon="star_outline"
                label={t('starred')}
                count={app.notes.filter((note) => note.isStarred && !note.isDeleted).length}
                onClick={() => void handleChangeView('starred', null)}
              />
              <SidebarFilterRow
                active={!app.activeFolderId && app.systemView === 'trash'}
                icon="trash_outline"
                label={t('recycleBin')}
                count={app.notes.filter((note) => note.isDeleted).length}
                onClick={() => void handleChangeView('trash', null)}
              />
            </Section>

            <Section
              title={t('folders')}
              count={app.folders.length}
              action={
                <button className="section-link" type="button" onClick={handleCreateFolder}>
                  {t('newFolder')}
                </button>
              }
            >
              {app.folders.map((folder) => (
                <div key={folder.id} className="folder-row-wrap">
                  <button
                    className={`folder-row ${app.activeFolderId === folder.id ? 'active' : ''}`}
                    type="button"
                    onClick={() => void handleChangeView('all', folder.id)}
                  >
                    <span className="sidebar-row-leading">
                      <Icon name="folder_outline" size={15} strokeWidth={1.9} />
                      <span>{folder.name}</span>
                    </span>
                    <span className="folder-count">{folderCounts.get(folder.id) ?? 0}</span>
                  </button>
                  {app.activeFolderId === folder.id ? (
                    <div className="folder-actions">
                      <button type="button" onClick={() => void handleRenameFolder(folder.id)}>
                        {t('renameFolder')}
                      </button>
                      <button type="button" onClick={() => void handleDeleteFolder(folder.id)}>
                        {t('deleteFolder')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </Section>

            <Section title={listTitle} count={app.noteRows.length}>
              {app.noteRows.map((note) => (
                <NoteRow
                  key={note.id}
                  preview={note.preview}
                  subtitle={note.subtitle}
                  active={note.id === app.selectedNoteId}
                  isPinned={note.isPinned}
                  isStarred={note.isStarred}
                  onClick={() => void handleSelectNote(note.id)}
                />
              ))}
            </Section>
          </div>

          <div className="sidebar-footer">
            <button className={`sidebar-icon-btn ${app.workspaceView === 'settings' ? 'active' : ''}`} type="button" onClick={() => void handleOpenSettings()} title={t('settings')}>
              <Icon name="settings" size={16} strokeWidth={1.9} />
            </button>
            {app.syncState.lastSyncAt ? (
              <span className="footer-sync-time">
                {app.language === 'zh' ? '上次同步：' : 'Last sync: '}
                {new Date(app.syncState.lastSyncAt).toLocaleTimeString(app.language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
          </div>
        </aside>

        <div
          className="sidebar-resizer"
          onMouseDown={() => setIsDraggingSidebar(true)}
        />

        <main className="workspace">
          {app.workspaceView !== 'notes' || !app.selectedNote ? (
            <header className="workspace-toolbar">
              <div className="workspace-heading">
                <p className="workspace-overline">{app.workspaceView === 'settings' ? t('settings') : listTitle}</p>
                <h2>
                  {app.workspaceView === 'settings'
                    ? t('settings')
                    : app.loading
                      ? (app.language === 'zh' ? '正在加载...' : 'Loading...')
                      : emptyState.title}
                </h2>
              </div>

              {app.workspaceView === 'settings' ? (
                <button className="primary-pill" type="button" onClick={() => void handleSyncNow()}>
                  {t('syncNow')}
                </button>
              ) : null}
            </header>
          ) : null}

          {app.workspaceView === 'settings' ? (
            <SettingsView
              language={app.language}
              settings={app.settings}
              syncStatusText={syncStatusText}
              appVersion={appVersion}
              fontAvailability={fontAvailability}
              fontBusyPreset={fontBusyPreset}
              onSaveSettings={app.updateSettings}
              onSyncNow={handleSyncNow}
              onSelectFontPreset={handleSelectFontPreset}
              onDownloadFont={handleDownloadFont}
            />
          ) : app.selectedNote ? (
            <>
            <div className="editor-action-bar">
              <div className="editor-action-bar-left">
                {app.selectedNote.isDeleted ? (
                  <>
                    <button className="paper-action" type="button" onClick={() => void app.restoreNote(app.selectedNote!.id)}>
                      {t('restore')}
                    </button>
                    <button className="paper-action danger" type="button" onClick={() => void app.permanentlyDeleteNote(app.selectedNote!.id)}>
                      {t('deleteForever')}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="editor-action-button"
                      type="button"
                      aria-label={t('uploadImage')}
                      onClick={() => editorRef.current?.openImagePicker()}
                    >
                      <Icon name="image" size={17} strokeWidth={1.9} />
                    </button>
                    <button
                      className={`editor-action-button ${app.selectedNote.isStarred ? 'active gold' : ''}`}
                      type="button"
                      aria-label={app.selectedNote.isStarred ? t('unstar') : t('star')}
                      onClick={() => void app.toggleStar(app.selectedNote!.id)}
                    >
                      <Icon name="star" size={18} />
                    </button>
                  </>
                )}
              </div>

              {!app.selectedNote.isDeleted ? (
                <div className="editor-action-bar-right">
                  <div ref={shareMenuRef} className="editor-menu-wrap">
                    <button
                      className={`editor-action-button ${shareMenuOpen ? 'active' : ''}`}
                      type="button"
                      aria-label={t('share')}
                      onClick={() => {
                        setFolderMenuOpen(false);
                        setShareMenuOpen((previous) => !previous);
                      }}
                    >
                      <Icon name="share" size={16} />
                    </button>

                    {shareMenuOpen ? (
                      <div className="editor-popover">
                        <button type="button" onClick={() => void handleCopyText()}>
                          <Icon name="copy" size={15} strokeWidth={1.9} />
                          <span>{t('copyText')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShareMenuOpen(false);
                            setIsLongImageOpen(true);
                          }}
                        >
                          <Icon name="image_solid" size={14} />
                          <span>{t('longImage')}</span>
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <button
                    className="editor-action-button danger"
                    type="button"
                    aria-label={t('delete')}
                    onClick={() => void app.moveToTrash(app.selectedNote!.id)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ) : null}
            </div>

            <section className="canvas-wrap">
              <article className="editor-paper compact-editor-paper">
                {!app.selectedNote.isDeleted ? (
                  <div className="editor-toolbar-row">
                    <div className="editor-toolbar-left">
                      <div ref={folderMenuRef} className="editor-menu-wrap">
                        <button
                          className={`editor-folder-pill ${folderMenuOpen ? 'active' : ''}`}
                          type="button"
                          onClick={() => {
                            setShareMenuOpen(false);
                            setFolderMenuOpen((previous) => !previous);
                          }}
                        >
                          {folderDisplayText}
                        </button>

                        {folderMenuOpen ? (
                          <div className="editor-popover folder-popover">
                            {app.folders.length ? (
                              app.folders.map((folder) => {
                                const active = app.selectedNote?.folderIds.includes(folder.id);
                                return (
                                  <button key={folder.id} type="button" onClick={(event) => void handleToggleFolder(event, folder.id)}>
                                    <span>#{folder.name}</span>
                                    <span className={`folder-check ${active ? 'active' : ''}`}>
                                      {active ? <Icon name="checkmark" size={15} strokeWidth={2.2} /> : null}
                                    </span>
                                  </button>
                                );
                              })
                            ) : (
                              <div className="editor-empty-popover">
                                {app.language === 'zh' ? '还没有文件夹' : 'No folders yet'}
                              </div>
                            )}
                            <div className="folder-popover-divider" />
                            <div className="folder-new-row">
                              <input
                                className="folder-new-input"
                                type="text"
                                value={newFolderName}
                                placeholder={app.language === 'zh' ? '新建文件夹...' : 'New folder...'}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleCreateFolderInline();
                                  }
                                }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="editor-format-toolbar">
                        {FORMAT_BUTTONS.map((item) => {
                          const isActive = activeFormats[item.command];
                          return (
                            <button
                              key={item.command}
                              className={`editor-format-button ${isActive ? 'active' : ''}`}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handleToolbarCommand(item.command)}
                            >
                            {item.icon ? (
                              <Icon name={item.icon} size={17} strokeWidth={1.9} />
                            ) : (
                              <span className={`editor-format-text ${item.command}`}>
                                {item.label}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      </div>
                    </div>

                    <div className="editor-meta-line">
                      <span>{editorMetaText}</span>
                      <span className="meta-divider" />
                      <span>
                        {getWordCount(app.selectedNote.content)} {t('wordUnit')}
                      </span>
                    </div>
                  </div>
                ) : null}

                <RichTextEditor
                  ref={editorRef}
                  noteId={app.selectedNote.id}
                  initialHtml={app.selectedNote.content}
                  language={app.language}
                  readOnly={app.selectedNote.isDeleted}
                  onChange={(html) => void app.updateNoteContent(app.selectedNote!.id, html)}
                  onError={(message) => window.alert(message)}
                  onFormatChange={setActiveFormats}
                />
              </article>
            </section>
            </>
          ) : (
            <section className="workspace-empty">
              <div className="empty-symbol">anote</div>
              <p>{app.loading ? (app.language === 'zh' ? '正在加载...' : 'Loading...') : emptyState.title}</p>
              <span>{app.loading ? '' : emptyState.subtitle}</span>
              {!app.loading ? (
                <button className="primary-button" type="button" onClick={handleCreateNote}>
                  {t('createFirstNote')}
                </button>
              ) : null}
            </section>
          )}
        </main>
      </div>

      {app.selectedNote ? (
        <LongImageModal
          open={isLongImageOpen}
          noteHtml={app.selectedNote.content}
          language={app.language}
          fontFaceCss={fontBundle.editorFontFaceCss}
          fontFamily={fontBundle.editorFontFamily}
          exporting={exportingLongImage}
          onClose={() => setIsLongImageOpen(false)}
          onExport={(payload) => handleExportLongImage(payload)}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  count,
  children,
  action,
}: {
  title: string;
  count: number;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="sidebar-section">
      <div className="section-header">
        <div className="section-label">
          <span>{title}</span>
        </div>
        <div className="section-meta">
          <span className="section-count">{count}</span>
          {action}
        </div>
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

function SidebarFilterRow({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button className={`folder-row ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <span className="sidebar-row-leading">
        <Icon name={icon} size={14} strokeWidth={1.9} />
        <span>{label}</span>
      </span>
      <span className="folder-count">{count}</span>
    </button>
  );
}

function NoteRow({
  preview,
  subtitle,
  active,
  isPinned,
  isStarred,
  onClick,
}: {
  preview: string;
  subtitle: string;
  active: boolean;
  isPinned: boolean;
  isStarred: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`note-row ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <div className="note-leading">
        <div className="note-copy">
          <span className="note-preview">{preview}</span>
          <span className="note-date">{subtitle}</span>
        </div>
      </div>
      <div className="note-actions">
        {isPinned ? (
          <span className="meta-dot">
            <Icon name="pin" size={13} />
          </span>
        ) : null}
        {isStarred ? (
          <span className="meta-dot gold">
            <Icon name="star" size={14} />
          </span>
        ) : null}
      </div>
    </button>
  );
}

function formatEditorTimestamp(value: string, language: 'en' | 'zh'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

async function copyPlainText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}
