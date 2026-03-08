import { Feather, Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { format } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { BorderRadius, Colors, Spacing, Typography } from '../constants/theme';
import { useFontSettings } from '../contexts/FontContext';
import { useNotes } from '../contexts/NotesContext';
import { useColorScheme } from '../hooks/use-color-scheme';

type FormatKind = 'bold' | 'italic' | 'center' | 'list' | 'quote';

interface FormatState {
  bold: boolean;
  italic: boolean;
  center: boolean;
  list: boolean;
  quote: boolean;
}

type WebMessage =
  | { type: 'plainText'; payload: string }
  | { type: 'formatState'; payload: FormatState }
  | { type: 'contentSnapshot'; payload: string }
  | { type: 'editorFocus'; payload: boolean }
  | { type: 'keyboardVisible'; payload: boolean };

function isFormatState(value: unknown): value is FormatState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.bold === 'boolean' &&
    typeof candidate.italic === 'boolean' &&
    typeof candidate.center === 'boolean' &&
    typeof candidate.list === 'boolean' &&
    typeof candidate.quote === 'boolean'
  );
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCharCount(html: string): number {
  return stripHtml(html).replace(/\s+/g, '').length;
}

function makeEditorDocument(
  initialHtml: string,
  background: string,
  textColor: string,
  hintColor: string,
  fontStack: string
): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body {
    margin: 0;
    background: ${background};
    font-family: ${fontStack};
    color: ${textColor};
  }
  #editor {
    min-height: 100vh;
    padding: 30px 27px 168px 30px;
    line-height: 1.68;
    font-size: 16px;
    outline: none;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  #editor p,
  #editor div,
  #editor ul,
  #editor ol,
  #editor blockquote {
    margin: 0 0 0.58em;
  }
  #editor p:last-child,
  #editor div:last-child,
  #editor ul:last-child,
  #editor ol:last-child,
  #editor blockquote:last-child {
    margin-bottom: 0;
  }
  #editor:empty:before { content: 'Start typing...'; color: ${hintColor}; }
  blockquote {
    border-left: 3px solid #c5cad3;
    padding-left: 12px;
    color: #6b7280;
  }
  ul, ol { padding-left: 24px; }
  li { margin: 0 0 0.24em; }
  li:last-child { margin-bottom: 0; }
</style></head>
<body>
<div id="editor" contenteditable="true">${initialHtml}</div>
<script>
  const editor = document.getElementById('editor');
  let snapshotTimer = null;
  let baseViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  const emit = (type, payload) => {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
  };

  const readState = () => {
    const formatBlock = (document.queryCommandValue('formatBlock') || '').toString().toLowerCase();
    emit('formatState', {
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      center: document.queryCommandState('justifyCenter'),
      list: document.queryCommandState('insertUnorderedList'),
      quote: formatBlock === 'blockquote',
    });
  };

  const emitFocus = () => {
    emit('editorFocus', document.activeElement === editor);
  };

  const emitKeyboardVisible = () => {
    const currentViewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const isFocused = document.activeElement === editor;

    if (!isFocused && currentViewportHeight > baseViewportHeight - 2) {
      baseViewportHeight = currentViewportHeight;
    }

    const delta = baseViewportHeight - currentViewportHeight;
    const visible = isFocused && delta > 100;
    emit('keyboardVisible', visible);
  };

  window.__editorApply = (kind) => {
    if (kind === 'bold') document.execCommand('bold', false);
    if (kind === 'italic') document.execCommand('italic', false);

    if (kind === 'center') {
      if (document.queryCommandState('justifyCenter')) document.execCommand('justifyLeft', false);
      else document.execCommand('justifyCenter', false);
    }

    if (kind === 'list') {
      document.execCommand('insertUnorderedList', false);
    }

    if (kind === 'quote') {
      const block = (document.queryCommandValue('formatBlock') || '').toString().toLowerCase();
      if (block === 'blockquote') document.execCommand('formatBlock', false, 'div');
      else document.execCommand('formatBlock', false, 'blockquote');
    }

    readState();
    editor.focus();
  };

  editor.addEventListener('input', () => {
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      emit('contentSnapshot', editor.innerHTML);
    }, 600);
  });
  editor.addEventListener('focus', () => {
    emitFocus();
    setTimeout(emitKeyboardVisible, 40);
  });
  editor.addEventListener('blur', () => {
    emitFocus();
    setTimeout(emitKeyboardVisible, 0);
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', emitKeyboardVisible);
  }
  window.addEventListener('resize', emitKeyboardVisible);

  window.__snapshot = () => emit('contentSnapshot', editor.innerHTML);
  window.__readText = () => emit('plainText', editor.innerText);
  window.__dismissInput = () => {
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    editor.blur();
    emitFocus();
    emit('keyboardVisible', false);
  };
  window.__insertImage = (uri) => {
    if (!uri) return;
    const safeUri = String(uri).replace(/"/g, '&quot;');
    document.execCommand('insertHTML', false, '<div><img src="' + safeUri + '" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;" /></div>');
    emit('contentSnapshot', editor.innerHTML);
    readState();
    editor.focus();
  };

  setTimeout(readState, 0);
  setTimeout(emitFocus, 0);
  setTimeout(emitKeyboardVisible, 0);
</script></body></html>`;
}

export default function EditorScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { editorFontStack } = useFontSettings();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    notes,
    folders,
    updateNote,
    removeNote,
    toggleNoteStar,
    toggleNoteFolder,
    createFolder,
  } = useNotes();

  const note = useMemo(() => notes.find((item) => item.id === id), [id, notes]);
  const noteId = note?.id;
  const noteContent = note?.content ?? '';

  const webviewRef = useRef<WebView>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotResolverRef = useRef<((html: string) => void) | null>(null);
  const isLeavingRef = useRef(false);
  const contentRef = useRef(noteContent);
  const loadedNoteIdRef = useRef<string | null>(null);

  const [shareOpen, setShareOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [editorInitialHtml, setEditorInitialHtml] = useState(noteContent);
  const [charCount, setCharCount] = useState(getCharCount(noteContent));
  const [formats, setFormats] = useState<FormatState>({
    bold: false,
    italic: false,
    center: false,
    list: false,
    quote: false,
  });

  const editorSource = useMemo(
    () => ({
      html: makeEditorDocument(
        editorInitialHtml,
        colors.background,
        colors.textPrimary,
        colors.textTertiary,
        editorFontStack
      ),
    }),
    [editorInitialHtml, colors.background, colors.textPrimary, colors.textTertiary, editorFontStack]
  );

  useEffect(() => {
    if (!noteId) return;
    if (loadedNoteIdRef.current === noteId) return;

    loadedNoteIdRef.current = noteId;
    contentRef.current = noteContent;
    setEditorInitialHtml(noteContent);
    setCharCount(getCharCount(noteContent));
  }, [noteId, noteContent]);

  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      setKeyboardVisible(true);
    });

    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
      setKeyboardVisible(false);
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const captureContent = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      snapshotResolverRef.current = resolve;
      webviewRef.current?.injectJavaScript('window.__snapshot(); true;');

      setTimeout(() => {
        if (snapshotResolverRef.current) {
          snapshotResolverRef.current(contentRef.current);
          snapshotResolverRef.current = null;
        }
      }, 220);
    });
  }, []);

  const saveNow = useCallback(async (options?: { silentUi?: boolean }) => {
    if (!note) return;
    const latestHtml = contentRef.current;
    if (!options?.silentUi) {
      setCharCount(getCharCount(latestHtml));
    }
    await updateNote(note.id, latestHtml);
  }, [note, updateNote]);

  const scheduleSave = useCallback(() => {
    if (!note) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveNow();
    }, 900);
  }, [note, saveNow]);

  async function handleBack() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    isLeavingRef.current = true;
    router.replace('/(tabs)');
    setTimeout(() => {
      saveNow({ silentUi: true });
    }, 420);
  }

  function applyFormat(kind: FormatKind) {
    webviewRef.current?.injectJavaScript(`window.__editorApply('${kind}'); true;`);
    scheduleSave();
  }

  async function handleInsertImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Please allow photo access first.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.9,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const mimeType = asset.mimeType || 'image/jpeg';
    const imageSrc = asset.base64
      ? `data:${mimeType};base64,${asset.base64}`
      : asset.uri.replace(/\\/g, '/');

    webviewRef.current?.injectJavaScript(
      `window.__insertImage(${JSON.stringify(imageSrc)}); true;`
    );
    scheduleSave();
  }

  async function handleConfirmSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await captureContent();
    await saveNow();
    setKeyboardVisible(false);
    setKeyboardHeight(0);
    webviewRef.current?.injectJavaScript('window.__dismissInput && window.__dismissInput(); true;');
    Keyboard.dismiss();
  }

  function onWebMessage(raw: string) {
    try {
      const data = JSON.parse(raw) as WebMessage;

      if (data.type === 'formatState' && isFormatState(data.payload)) {
        if (isLeavingRef.current) return;
        const nextFormats = data.payload;
        setFormats((prev) => {
          if (
            prev.bold === nextFormats.bold &&
            prev.italic === nextFormats.italic &&
            prev.center === nextFormats.center &&
            prev.list === nextFormats.list &&
            prev.quote === nextFormats.quote
          ) {
            return prev;
          }
          return nextFormats;
        });
      }

      if (data.type === 'contentSnapshot' && typeof data.payload === 'string') {
        contentRef.current = data.payload || '';
        if (!isLeavingRef.current) {
          setCharCount(getCharCount(contentRef.current));
          scheduleSave();
        }
        if (snapshotResolverRef.current) {
          snapshotResolverRef.current(contentRef.current);
          snapshotResolverRef.current = null;
        }
      }

      if (data.type === 'plainText' && typeof data.payload === 'string') {
        if (Platform.OS === 'web' && navigator?.clipboard) {
          navigator.clipboard.writeText(data.payload || '');
          Alert.alert('Copied', 'Note copied to clipboard.');
          return;
        }

        Share.share({ message: data.payload || '' });
      }

      if (data.type === 'editorFocus' && typeof data.payload === 'boolean') {
        if (!data.payload) {
          setKeyboardVisible(false);
          setKeyboardHeight(0);
        }
      }

      if (data.type === 'keyboardVisible' && typeof data.payload === 'boolean') {
        setKeyboardVisible(data.payload);
        if (!data.payload) setKeyboardHeight(0);
      }
    } catch {
      // ignore parse errors
    }
  }

  async function handleDelete() {
    if (!note) return;
    await removeNote(note.id);
    router.replace('/(tabs)');
  }

  function handleCopy() {
    setShareOpen(false);
    webviewRef.current?.injectJavaScript('window.__readText(); true;');
  }

  async function handleGenerateLongImage() {
    if (!note) return;
    await captureContent();
    await saveNow();
    setShareOpen(false);
    router.push({ pathname: '/long-image-preview', params: { id: note.id } });
  }

  if (!note) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[Typography.body, { color: colors.textSecondary }]}>Note not found.</Text>
      </View>
    );
  }

  const selectedFolders = note.folderIds
    .map((folderId) => folders.find((folder) => folder.id === folderId))
    .filter(Boolean) as { name: string }[];
  const hasFolder = selectedFolders.length > 0;
  const folderDisplayText = (() => {
    if (!hasFolder) return 'Add to Folder';
    const first = selectedFolders[0].name;
    const shortName = first.length > 8 ? `${first.slice(0, 8)}...` : first;
    if (selectedFolders.length > 1) return `#${shortName} &...`;
    return `#${shortName}`;
  })();

  const toolbarBottom = keyboardHeight > 0 ? keyboardHeight : 0;
  const showInputActions = keyboardVisible;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.navRow}>
        <View style={styles.navLeft}>
          <Pressable onPress={handleBack}>
            <Ionicons name="chevron-back" size={24} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.navCenter} />

        <View style={styles.navActions}>
          {showInputActions ? (
            <>
              <Pressable onPress={handleInsertImage}>
                <Feather name="image" size={21} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={handleConfirmSave}>
                <Feather name="check" size={21} color={colors.textSecondary} />
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => setShareOpen((value) => !value)}>
                <Feather name="share-2" size={21} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={handleDelete}>
                <Feather name="trash-2" size={21} color={colors.textSecondary} />
              </Pressable>
            </>
          )}
        </View>
      </View>

      <View style={[styles.metaRow, { borderBottomColor: colors.borderLight }]}>
        <View style={styles.metaLeft}>
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>{format(new Date(note.updatedAt), 'yyyy/MM/dd HH:mm')}</Text>
          <View style={[styles.metaDivider, { backgroundColor: colors.textTertiary }]} />
          <Text style={[styles.metaText, { color: colors.textTertiary }]}>{charCount}</Text>
        </View>

        <View style={styles.metaRight}>
          <Pressable
            onPress={() => setFolderOpen(true)}
            style={[
              styles.folderChip,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderLight,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.folderText, { color: colors.textTertiary }]}
            >
              {folderDisplayText}
            </Text>
          </Pressable>

          <Pressable onPress={() => toggleNoteStar(note.id)}>
            <MaterialIcons
              name="star"
              size={17}
              color={note.isStarred ? colors.star : colors.textTertiary}
            />
          </Pressable>
        </View>
      </View>

      <WebView
        ref={webviewRef}
        source={editorSource}
        onMessage={(event) => onWebMessage(event.nativeEvent.data)}
        style={[styles.webview, { backgroundColor: colors.background }]}
        originWhitelist={['*']}
      />

      <View style={[styles.toolbarWrap, { bottom: toolbarBottom }]}> 
        <View style={[styles.toolbar, { borderTopColor: colors.borderLight, backgroundColor: colors.surface }]}> 
          <ToolbarBtn onPress={() => applyFormat('bold')} icon="format-bold" active={formats.bold} color={colors.textSecondary} activeColor={colors.primary} />
          <ToolbarBtn onPress={() => applyFormat('italic')} icon="format-italic" active={formats.italic} color={colors.textSecondary} activeColor={colors.primary} />
          <ToolbarBtn onPress={() => applyFormat('center')} icon="format-align-center" active={formats.center} color={colors.textSecondary} activeColor={colors.primary} />
          <ToolbarBtn onPress={() => applyFormat('list')} icon="format-list-bulleted" active={formats.list} color={colors.textSecondary} activeColor={colors.primary} />
          <ToolbarBtn onPress={() => applyFormat('quote')} icon="format-quote-close" active={formats.quote} color={colors.textSecondary} activeColor={colors.primary} />
        </View>
      </View>

      {shareOpen && (
        <View style={[styles.shareMenu, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}> 
          <Pressable style={styles.shareItem} onPress={handleCopy}>
            <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>Copy</Text>
          </Pressable>
          <Pressable style={styles.shareItem} onPress={handleGenerateLongImage}>
            <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>Generate Long Image</Text>
          </Pressable>
        </View>
      )}

      <Modal visible={folderOpen} transparent animationType="fade" onRequestClose={() => setFolderOpen(false)}>
        <Pressable style={[styles.modalMask, { backgroundColor: colors.overlay }]} onPress={() => setFolderOpen(false)}>
          <Pressable style={[styles.folderPanel, { backgroundColor: colors.surface }]} onPress={() => undefined}>
            <ScrollView style={{ maxHeight: 260 }}>
              {folders.map((folder) => {
                const active = note.folderIds.includes(folder.id);
                return (
                  <Pressable key={folder.id} style={styles.folderItem} onPress={() => toggleNoteFolder(note.id, folder.id)}>
                    <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>#{folder.name}</Text>
                    {active && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={[styles.newFolderRow, { borderTopColor: colors.borderLight }]}>
              <TextInput
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="New folder"
                placeholderTextColor={colors.textTertiary}
                style={[styles.newFolderInput, { borderColor: colors.border, color: colors.textPrimary }]}
                onSubmitEditing={async () => {
                  if (!newFolderName.trim()) return;
                  await createFolder(newFolderName.trim());
                  setNewFolderName('');
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ToolbarBtn({
  onPress,
  icon,
  active,
  color,
  activeColor,
}: {
  onPress: () => void;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  active: boolean;
  color: string;
  activeColor: string;
}) {
  return (
    <Pressable style={styles.toolbarBtn} onPress={onPress}>
      <MaterialCommunityIcons name={icon} size={22} color={active ? activeColor : color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navRow: {
    paddingTop: Spacing.xxxxl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navLeft: {
    width: 32,
    alignItems: 'flex-start',
  },
  navCenter: {
    flex: 1,
    alignItems: 'center',
  },
  navActions: {
    width: 84,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.lg,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaText: {
    ...Typography.caption,
    fontWeight: '500',
    fontSize: 13,
  },
  metaDivider: {
    width: 1,
    height: 11,
    marginHorizontal: 8,
    opacity: 0.6,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  folderChip: {
    maxWidth: 112,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderText: {
    ...Typography.caption,
    fontWeight: '500',
    fontSize: 12,
  },
  webview: {
    flex: 1,
  },
  toolbarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  toolbar: {
    borderTopWidth: 1,
    height: 56,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolbarBtn: {
    width: 42,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareMenu: {
    position: 'absolute',
    top: 78,
    right: 16,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    zIndex: 30,
  },
  shareItem: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  modalMask: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  folderPanel: {
    width: '90%',
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  newFolderRow: {
    borderTopWidth: 1,
    padding: Spacing.md,
  },
  newFolderInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
