import { FontAwesome6, Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { format } from 'date-fns';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
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
import AppDialog, { type AppDialogAction } from '../components/AppDialog';
import { BorderRadius, Colors, Spacing, Typography } from '../constants/theme';
import { useFontSettings } from '../contexts/FontContext';
import { useNotes } from '../contexts/NotesContext';
import { useColorScheme } from '../hooks/use-color-scheme';

type FormatKind = 'heading' | 'bold' | 'italic' | 'center' | 'list' | 'quote';

interface FormatState {
  heading: boolean;
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
  | { type: 'editorFocused'; payload: boolean };

function isFormatState(value: unknown): value is FormatState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.heading === 'boolean' &&
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
    .replace(/&#160;/g, ' ')
    .replace(/&#8203;|&#8204;|&#8205;|&#65279;/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCharCount(html: string): number {
  return stripHtml(html).replace(/\s+/g, '').length;
}

function buildShellText(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div|li|blockquote|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#8203;|&#8204;|&#8205;|&#65279;/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitShellParagraphs(text: string): string[] {
  return String(text || '')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasMeaningfulNoteContent(content: string): boolean {
  const html = String(content || '');
  const hasMedia = /<(img|video|audio|iframe|svg|canvas)\b/i.test(html);
  const text = stripHtml(html).replace(/\s+/g, '').trim();
  return hasMedia || text.length > 0;
}

function makeEditorDocument(
  initialHtml: string,
  background: string,
  textColor: string,
  hintColor: string,
  fontFaceCss: string,
  fontFamily: string,
  autoFocusOnLoad: boolean
): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  ${fontFaceCss}
  body {
    margin: 0;
    background: ${background};
    font-family: ${fontFamily};
    color: ${textColor};
  }
  #editor {
    min-height: 100vh;
    padding: 30px 27px 168px 30px;
    line-height: 1.68;
    font-size: 16px;
    caret-color: ${textColor};
    outline: none;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  #editor p,
  #editor div,
  #editor h2,
  #editor ul,
  #editor ol,
  #editor blockquote {
    margin: 0 0 0.58em;
  }
  #editor p:last-child,
  #editor div:last-child,
  #editor h2:last-child,
  #editor ul:last-child,
  #editor ol:last-child,
  #editor blockquote:last-child {
    margin-bottom: 0;
  }
  #editor:empty:before { content: 'Start typing...'; color: ${hintColor}; }
  #editor h2 {
    font-size: 19px;
    line-height: 1.5;
    font-weight: 700;
  }
  blockquote {
    border-left: 3px solid #c5cad3;
    padding-left: 12px;
    color: #6b7280;
  }
  ul, ol { padding-left: 24px; }
  li { margin: 0 0 0.24em; }
  li:last-child { margin-bottom: 0; }
  #editor b, #editor strong {
    font-weight: 700;
  }
  #editor .bridge-caret {
    display: inline-block;
    width: 1.5px;
    height: 1.05em;
    margin-left: 1px;
    vertical-align: -0.12em;
    background: ${textColor};
    animation: bridge-caret-blink 1s steps(1) infinite;
    pointer-events: none;
    user-select: none;
  }
  @keyframes bridge-caret-blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }
</style></head>
<body>
<div id="editor" contenteditable="true">${initialHtml}</div>
<script>
  const editor = document.getElementById('editor');
  let snapshotTimer = null;
  let autoFocusCancelled = false;
  let bridgeCaretSuppressed = false;
  let lastBridgeLineBreakAt = 0;
  const BRIDGE_CARET_SELECTOR = 'span[data-bridge-caret="1"]';
  const BLOCK_TAGS = new Set(['P', 'DIV', 'H2', 'UL', 'OL', 'BLOCKQUOTE', 'LI']);

  const emit = (type, payload) => {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
  };

  const snapshotHtml = () => {
    normalizeTopLevelBlocks();
    const clone = editor.cloneNode(true);
    const caret = clone.querySelector(BRIDGE_CARET_SELECTOR);
    if (caret && caret.parentNode) {
      caret.parentNode.removeChild(caret);
    }
    return clone.innerHTML;
  };

  const ensureBridgeCaret = () => {
    if (bridgeCaretSuppressed) return null;
    let caret = editor.querySelector(BRIDGE_CARET_SELECTOR);
    if (caret) return caret;

    caret = document.createElement('span');
    caret.setAttribute('data-bridge-caret', '1');
    caret.setAttribute('contenteditable', 'false');
    caret.className = 'bridge-caret';
    editor.appendChild(caret);
    return caret;
  };

  const isBridgeCaretNode = (node) => {
    return (
      node &&
      node.nodeType === Node.ELEMENT_NODE &&
      node.matches &&
      node.matches(BRIDGE_CARET_SELECTOR)
    );
  };

  const isBlockNode = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    return BLOCK_TAGS.has(node.tagName);
  };

  const shouldWrapTopLevelNode = (node) => {
    if (!node || isBridgeCaretNode(node)) return false;
    if (node.nodeType === Node.TEXT_NODE) {
      return Boolean((node.textContent || '').trim());
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    if (isBlockNode(node)) return false;
    return true;
  };

  const normalizeTopLevelBlocks = () => {
    const children = Array.from(editor.childNodes);
    let wrapper = null;
    children.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && !(node.textContent || '').trim()) {
        editor.removeChild(node);
        return;
      }
      if (shouldWrapTopLevelNode(node)) {
        if (!wrapper) {
          wrapper = document.createElement('div');
          editor.insertBefore(wrapper, node);
        }
        wrapper.appendChild(node);
        return;
      }
      wrapper = null;
    });
  };

  const ensureCaretInsideBlock = () => {
    const caret = ensureBridgeCaret();
    if (!caret) return null;
    if (caret.parentNode === editor) {
      const block = document.createElement('div');
      editor.insertBefore(block, caret);
      block.appendChild(caret);
    }
    return caret;
  };

  const removeBridgeCaret = () => {
    const caret = editor.querySelector(BRIDGE_CARET_SELECTOR);
    if (caret && caret.parentNode) {
      caret.parentNode.removeChild(caret);
    }
  };

  const placeSelectionBeforeBridgeCaret = () => {
    normalizeTopLevelBlocks();
    const caret = ensureCaretInsideBlock();
    if (!caret) return null;
    const selection = window.getSelection && window.getSelection();
    if (selection && document.createRange) {
      const range = document.createRange();
      range.setStartBefore(caret);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    return caret;
  };

  const syncBridgeCaretToSelection = () => {
    if (bridgeCaretSuppressed) return null;
    const selection = window.getSelection && window.getSelection();
    if (!selection || !selection.rangeCount || !document.createRange) {
      return placeSelectionBeforeBridgeCaret();
    }

    const range = selection.getRangeAt(0);
    const container = range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentNode
      : range.startContainer;

    if (container && container !== editor && !editor.contains(container)) {
      return placeSelectionBeforeBridgeCaret();
    }
    if (container === editor) {
      return placeSelectionBeforeBridgeCaret();
    }

    const caret = ensureBridgeCaret();
    const nextRange = range.cloneRange();
    nextRange.collapse(true);

    if (caret.parentNode) {
      caret.parentNode.removeChild(caret);
    }

    nextRange.insertNode(caret);

    const collapsedRange = document.createRange();
    collapsedRange.setStartBefore(caret);
    collapsedRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(collapsedRange);
    return caret;
  };

  const suppressBridgeCaret = () => {
    bridgeCaretSuppressed = true;
    removeBridgeCaret();
  };

  const restoreBridgeCaret = () => {
    bridgeCaretSuppressed = false;
    return ensureBridgeCaret();
  };

  const readState = () => {
    const formatBlock = (document.queryCommandValue('formatBlock') || '').toString().toLowerCase();
    const heading = formatBlock === 'h2';
    emit('formatState', {
      heading,
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      center: document.queryCommandState('justifyCenter'),
      list: document.queryCommandState('insertUnorderedList'),
      quote: formatBlock === 'blockquote',
    });
  };

  window.__editorApply = (kind) => {
    if (kind === 'heading') {
      const block = (document.queryCommandValue('formatBlock') || '').toString().toLowerCase();
      if (block === 'h2') {
        document.execCommand('formatBlock', false, 'div');
      } else {
        document.execCommand('formatBlock', false, 'h2');
        // bold is a toggle command; only enable it when currently off.
        if (!document.queryCommandState('bold')) {
          document.execCommand('bold', false);
        }
      }
    }
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
    autoFocusCancelled = true;
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      emit('contentSnapshot', snapshotHtml());
    }, 600);
  });
  editor.addEventListener('focus', () => {
    readState();
    emit('editorFocused', true);
  });
  editor.addEventListener('blur', readState);
  editor.addEventListener('mouseup', () => setTimeout(suppressBridgeCaret, 0));
  editor.addEventListener('keyup', () => setTimeout(suppressBridgeCaret, 0));
  editor.addEventListener('touchend', () => setTimeout(suppressBridgeCaret, 0));

  window.__snapshot = () => emit('contentSnapshot', snapshotHtml());
  window.__readText = () => emit('plainText', editor.innerText);
  window.__dismissInput = () => {
    suppressBridgeCaret();
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    editor.blur();
  };
  window.__removeBridgeCaret = () => {
    suppressBridgeCaret();
  };
  window.__restoreBridgeCaret = () => {
    restoreBridgeCaret();
  };
  window.__focusEditor = () => {
    if (!bridgeCaretSuppressed) {
      restoreBridgeCaret();
    }
    try { editor.click(); } catch (e) {}
    try {
      const ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
      editor.dispatchEvent(ev);
    } catch (e) {}
    try { editor.focus({ preventScroll: true }); } catch (e) { editor.focus(); }
    if (!bridgeCaretSuppressed) {
      placeSelectionBeforeBridgeCaret();
    }
    const focused = document.activeElement === editor;
    if (focused) emit('editorFocused', true);
    return focused;
  };
  window.__insertImage = (uri) => {
    if (!uri) return;
    const safeUri = String(uri).replace(/"/g, '&quot;');
    if (!bridgeCaretSuppressed) {
      placeSelectionBeforeBridgeCaret();
    }
    document.execCommand('insertHTML', false, '<div><img src="' + safeUri + '" style="max-width:100%;height:auto;border-radius:8px;display:block;margin:8px 0;" /></div>');
    if (!bridgeCaretSuppressed) {
      placeSelectionBeforeBridgeCaret();
    }
    emit('contentSnapshot', snapshotHtml());
    readState();
    editor.focus();
  };
  window.__insertText = (text) => {
    const value = String(text || '');
    if (!value) return;
    if (window.__focusEditor) window.__focusEditor();
    normalizeTopLevelBlocks();
    if (!bridgeCaretSuppressed) {
      placeSelectionBeforeBridgeCaret();
    }
    try {
      document.execCommand('insertText', false, value);
    } catch (e) {
      const caret = placeSelectionBeforeBridgeCaret();
      if (caret) {
        caret.insertAdjacentText('beforebegin', value);
      } else {
        editor.appendChild(document.createTextNode(value));
      }
    }
    if (!bridgeCaretSuppressed) {
      placeSelectionBeforeBridgeCaret();
    }
    emit('contentSnapshot', snapshotHtml());
    readState();
  };
  window.__insertLineBreak = () => {
    const now = Date.now();
    // Some Android IMEs emit duplicate Enter events for one tap.
    if (now - lastBridgeLineBreakAt < 140) {
      return;
    }
    lastBridgeLineBreakAt = now;
    if (window.__focusEditor) window.__focusEditor();
    normalizeTopLevelBlocks();
    const shouldManageBridgeCaret = !bridgeCaretSuppressed;
    if (shouldManageBridgeCaret) {
      placeSelectionBeforeBridgeCaret();
      removeBridgeCaret();
    }
    let didInsert = false;
    try {
      didInsert = document.execCommand('insertParagraph', false);
    } catch (e) {
      didInsert = false;
    }
    if (!didInsert) {
      try {
        document.execCommand('insertHTML', false, '<br>');
      } catch (e) {
        // ignore
      }
    }
    if (shouldManageBridgeCaret) {
      bridgeCaretSuppressed = false;
      syncBridgeCaretToSelection();
    }
    emit('contentSnapshot', snapshotHtml());
    readState();
  };
  window.__deleteBackward = () => {
    if (window.__deleteBackwardCount) {
      window.__deleteBackwardCount(1);
      return;
    }
    if (window.__focusEditor) window.__focusEditor();
    try {
      document.execCommand('delete', false);
    } catch (e) {
      // ignore
    }
    placeSelectionBeforeBridgeCaret();
    emit('contentSnapshot', snapshotHtml());
    readState();
  };
  window.__deleteBackwardCount = (count) => {
    const total = Math.max(1, Number(count) || 1);
    if (window.__focusEditor) window.__focusEditor();
    const selection = window.getSelection && window.getSelection();

    for (let i = 0; i < total; i += 1) {
      if (selection && typeof selection.modify === 'function') {
        selection.modify('extend', 'backward', 'character');
        document.execCommand('delete', false);
      } else {
        try {
          document.execCommand('delete', false);
        } catch (e) {
          // ignore
        }
      }
      if (!bridgeCaretSuppressed) {
        placeSelectionBeforeBridgeCaret();
      }
    }

    emit('contentSnapshot', snapshotHtml());
    readState();
  };

  setTimeout(() => {
    normalizeTopLevelBlocks();
    readState();
    emit('contentSnapshot', snapshotHtml());
  }, 0);
  if (${autoFocusOnLoad ? 'true' : 'false'}) {
    let bootTries = 0;
    const bootFocus = () => {
      if (autoFocusCancelled) return;
      bootTries += 1;
      if (window.__focusEditor) {
        window.__focusEditor();
      } else {
        editor.focus();
      }
      if (document.activeElement === editor) return;
      if (bootTries < 6) setTimeout(bootFocus, 120);
    };
    setTimeout(bootFocus, 30);
  }
</script></body></html>`;
}

export default function EditorScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { editorFontFaceCss, editorFontFamily, fontPreset, appFontStyle } = useFontSettings();
  const router = useRouter();
  const navigation = useNavigation();
  const { id, autoFocus } = useLocalSearchParams<{ id: string; autoFocus?: string }>();
  const {
    notes,
    folders,
    updateNote,
    removeNote,
    permanentlyDeleteNote,
    toggleNoteStar,
    toggleNoteFolder,
    createFolder,
  } = useNotes();

  const note = useMemo(() => notes.find((item) => item.id === id), [id, notes]);
  const noteId = note?.id;
  const noteContent = note?.content ?? '';
  const shouldAutoFocusParam = useMemo(() => {
    const value = Array.isArray(autoFocus) ? autoFocus[0] : autoFocus;
    return value === '1' || value === 'true';
  }, [autoFocus]);

  const webviewRef = useRef<WebView>(null);
  const keyboardBridgeInputRef = useRef<TextInput>(null);
  const webviewLoadedRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shellHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shellOpacityRef = useRef(new Animated.Value(1));
  const shellHiddenRef = useRef(false);
  const snapshotResolverRef = useRef<((html: string) => void) | null>(null);
  const isLeavingRef = useRef(false);
  const contentRef = useRef(noteContent);
  const loadedNoteIdRef = useRef<string | null>(null);
  const noteIdRef = useRef<string | null>(null);
  const deletingEmptyRef = useRef(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [editorInitialHtml, setEditorInitialHtml] = useState(noteContent);
  const [editorShellText, setEditorShellText] = useState(buildShellText(noteContent));
  const [showEditorShell, setShowEditorShell] = useState(!shouldAutoFocusParam);
  const [charCount, setCharCount] = useState(getCharCount(noteContent));
  const [bridgeValue, setBridgeValue] = useState('');
  const [dialogConfig, setDialogConfig] = useState<{ title: string; message: string; actions?: AppDialogAction[] } | null>(null);
  const [formats, setFormats] = useState<FormatState>({
    heading: false,
    bold: false,
    italic: false,
    center: false,
    list: false,
    quote: false,
  });
  const shouldAutoFocusRef = useRef(false);
  const lastEnterKeyPressAtRef = useRef(0);
  const shellParagraphs = useMemo(() => splitShellParagraphs(editorShellText), [editorShellText]);

  const editorSource = useMemo(
    () => ({
      html: makeEditorDocument(
        editorInitialHtml,
        colors.background,
        colors.textPrimary,
        colors.textTertiary,
        editorFontFaceCss,
        editorFontFamily,
        shouldAutoFocusParam
      ),
    }),
    [
      editorInitialHtml,
      colors.background,
      colors.textPrimary,
      colors.textTertiary,
      editorFontFaceCss,
      editorFontFamily,
      shouldAutoFocusParam,
    ]
  );

  useEffect(() => {
    noteIdRef.current = noteId ?? null;
  }, [noteId]);

  useEffect(() => {
    if (!noteId) return;
    if (loadedNoteIdRef.current === noteId) return;

    loadedNoteIdRef.current = noteId;
    contentRef.current = noteContent;
    setEditorInitialHtml(noteContent);
    setEditorShellText(buildShellText(noteContent));
    setShowEditorShell(!shouldAutoFocusParam);
    shellOpacityRef.current.setValue(1);
    shellHiddenRef.current = false;
    setCharCount(getCharCount(noteContent));
    setBridgeValue('');
  }, [noteId, noteContent, shouldAutoFocusParam]);

  const deleteNoteIfEmpty = useCallback(async (): Promise<boolean> => {
    const targetNoteId = noteIdRef.current;
    if (!targetNoteId) return false;
    if (deletingEmptyRef.current) return false;
    if (hasMeaningfulNoteContent(contentRef.current)) return false;

    deletingEmptyRef.current = true;
    try {
      await permanentlyDeleteNote(targetNoteId);
      return true;
    } finally {
      deletingEmptyRef.current = false;
    }
  }, [permanentlyDeleteNote]);

  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      setKeyboardVisible(true);
    });

    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
      setKeyboardVisible(false);
      webviewRef.current?.injectJavaScript('window.__removeBridgeCaret && window.__removeBridgeCaret(); true;');
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (shellHideTimerRef.current) {
        clearTimeout(shellHideTimerRef.current);
        shellHideTimerRef.current = null;
      }
      shellOpacityRef.current.stopAnimation();
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
    if (!hasMeaningfulNoteContent(latestHtml)) {
      return;
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

  const hideEditorShell = useCallback((delayMs = 0) => {
    if (!showEditorShell) return;
    if (shellHiddenRef.current) return;

    if (shellHideTimerRef.current) {
      clearTimeout(shellHideTimerRef.current);
      shellHideTimerRef.current = null;
    }

    const runHide = () => {
      if (shellHiddenRef.current) return;
      shellHiddenRef.current = true;
      Animated.timing(shellOpacityRef.current, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start(() => {
        setShowEditorShell(false);
      });
    };

    if (delayMs <= 0) {
      runHide();
      return;
    }

    shellHideTimerRef.current = setTimeout(() => {
      shellHideTimerRef.current = null;
      runHide();
    }, delayMs);
  }, [showEditorShell]);

  const goBackToMain = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  }, [navigation, router]);

  async function handleBack() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    isLeavingRef.current = true;
    await captureContent();
    const deleted = await deleteNoteIfEmpty();
    if (deleted || !noteIdRef.current) {
      goBackToMain();
      return;
    }

    goBackToMain();
    setTimeout(() => {
      saveNow({ silentUi: true });
    }, 420);
  }

  function applyFormat(kind: FormatKind) {
    webviewRef.current?.injectJavaScript(`window.__editorApply('${kind}'); true;`);
    scheduleSave();
  }

  const triggerAutoFocus = useCallback(() => {
    if (!webviewLoadedRef.current) return;
    if (!shouldAutoFocusRef.current) return;
    shouldAutoFocusRef.current = false;
    keyboardBridgeInputRef.current?.focus();
    (webviewRef.current as unknown as { focus?: () => void })?.focus?.();

    setTimeout(() => {
      webviewRef.current?.injectJavaScript(`
        (function () {
          var tries = 0;
          var focusOnce = function () {
            if (window.__focusEditor) window.__focusEditor();
          };
          focusOnce();
          var timer = setInterval(function () {
            tries += 1;
            focusOnce();
            if (tries >= 15) clearInterval(timer);
          }, 90);
        })();
        true;
      `);
    }, 40);
  }, []);

  const injectBridgeLineBreak = useCallback(() => {
    webviewRef.current?.injectJavaScript('window.__insertLineBreak && window.__insertLineBreak(); true;');
    webviewRef.current?.injectJavaScript('window.__focusEditor && window.__focusEditor(); true;');
  }, []);

  const insertBridgeLineBreak = useCallback(() => {
    injectBridgeLineBreak();
    setBridgeValue('');
  }, [injectBridgeLineBreak]);

  const handleBridgeTextChange = useCallback((text: string) => {
    const previous = bridgeValue;
    const next = text.replace(/[\r\n]/g, '');

    let sharedPrefixLength = 0;
    const maxPrefixLength = Math.min(previous.length, next.length);
    while (
      sharedPrefixLength < maxPrefixLength &&
      previous[sharedPrefixLength] === next[sharedPrefixLength]
    ) {
      sharedPrefixLength += 1;
    }

    const deletedCount = previous.length - sharedPrefixLength;
    const insertedText = next.slice(sharedPrefixLength);

    if (deletedCount > 0) {
      webviewRef.current?.injectJavaScript(
        `window.__deleteBackwardCount && window.__deleteBackwardCount(${deletedCount}); true;`
      );
    }

    if (insertedText) {
      webviewRef.current?.injectJavaScript(
        `window.__insertText && window.__insertText(${JSON.stringify(insertedText)}); true;`
      );
      webviewRef.current?.injectJavaScript('window.__focusEditor && window.__focusEditor(); true;');
    }

    setBridgeValue(next);
  }, [bridgeValue]);

  const handleBridgeKeyPress = useCallback((event: { nativeEvent: { key: string } }) => {
    if (event.nativeEvent.key === 'Enter') {
      const now = Date.now();
      if (now - lastEnterKeyPressAtRef.current < 160) {
        return;
      }
      lastEnterKeyPressAtRef.current = now;
      insertBridgeLineBreak();
      return;
    }
    if (event.nativeEvent.key !== 'Backspace') return;
    if (bridgeValue.length > 0) return;
    webviewRef.current?.injectJavaScript('window.__deleteBackward && window.__deleteBackward(); true;');
  }, [bridgeValue, insertBridgeLineBreak]);

  useEffect(() => {
    if (!shouldAutoFocusParam) return;
    shouldAutoFocusRef.current = true;
    triggerAutoFocus();
  }, [shouldAutoFocusParam, triggerAutoFocus]);

  const handleEditorLoadEnd = useCallback(() => {
    webviewLoadedRef.current = true;
    triggerAutoFocus();
    hideEditorShell(780);
  }, [hideEditorShell, triggerAutoFocus]);

  async function handleInsertImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setDialogConfig({
        title: 'Permission required',
        message: 'Please allow photo access first.',
      });
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
    if (!noteIdRef.current) return;
    const deleted = await deleteNoteIfEmpty();
    if (deleted) {
      webviewRef.current?.injectJavaScript('window.__dismissInput && window.__dismissInput(); true;');
      Keyboard.dismiss();
      goBackToMain();
      return;
    }

    await saveNow();
    setKeyboardVisible(false);
    setKeyboardHeight(0);
    webviewRef.current?.injectJavaScript('window.__dismissInput && window.__dismissInput(); true;');
    Keyboard.dismiss();
  }

  useEffect(() => {
    return () => {
      if (hasMeaningfulNoteContent(contentRef.current)) return;
      const targetNoteId = noteIdRef.current;
      if (!targetNoteId) return;
      void permanentlyDeleteNote(targetNoteId);
    };
  }, [permanentlyDeleteNote]);

  function onWebMessage(raw: string) {
    try {
      const data = JSON.parse(raw) as WebMessage;

      if (data.type === 'formatState' && isFormatState(data.payload)) {
        if (isLeavingRef.current) return;
        const nextFormats = data.payload;
        setFormats((prev) => {
          if (
            prev.bold === nextFormats.bold &&
            prev.heading === nextFormats.heading &&
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
        const nextContent = data.payload || '';
        const hasChanged = nextContent !== contentRef.current;
        contentRef.current = nextContent;
        if (!isLeavingRef.current) {
          setCharCount(getCharCount(contentRef.current));
          if (hasChanged) {
            scheduleSave();
          }
          if (showEditorShell && webviewLoadedRef.current) {
            hideEditorShell(90);
          }
        }
        if (snapshotResolverRef.current) {
          snapshotResolverRef.current(contentRef.current);
          snapshotResolverRef.current = null;
        }
      }

      if (data.type === 'plainText' && typeof data.payload === 'string') {
        if (Platform.OS === 'web' && navigator?.clipboard) {
          navigator.clipboard.writeText(data.payload || '');
          setDialogConfig({
            title: 'Copied',
            message: 'Note copied to clipboard.',
          });
          return;
        }

        Share.share({ message: data.payload || '' });
      }

    } catch {
      // ignore parse errors
    }
  }

  async function handleDelete() {
    if (!note) return;
    await removeNote(note.id);
    goBackToMain();
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
  const closeDialog = () => setDialogConfig(null);

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
                <FontAwesome6 name="image" size={20} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={handleConfirmSave}>
                <FontAwesome6 name="check" size={20} color={colors.textSecondary} />
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => setShareOpen((value) => !value)}>
                <FontAwesome6 name="share-nodes" size={20} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={handleDelete}>
                <FontAwesome6 name="trash-can" size={20} color={colors.textSecondary} />
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

      <View style={styles.editorSurface}>
        <WebView
          key={`editor-${fontPreset}`}
          ref={webviewRef}
          source={editorSource}
          onMessage={(event) => onWebMessage(event.nativeEvent.data)}
          onLoadEnd={handleEditorLoadEnd}
          style={[styles.webview, { backgroundColor: colors.background }]}
          originWhitelist={['*']}
          keyboardDisplayRequiresUserAction={false}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          androidLayerType="hardware"
        />

        {showEditorShell && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.editorShell,
              { backgroundColor: colors.background, opacity: shellOpacityRef.current },
            ]}
          >
            {shellParagraphs.length === 0 ? (
              <Text
                style={[
                  styles.editorShellText,
                  appFontStyle,
                  { color: colors.textTertiary },
                ]}
              >
                Start typing...
              </Text>
            ) : (
              shellParagraphs.map((paragraph, index) => (
                <Text
                  key={`shell-paragraph-${index}`}
                  style={[
                    styles.editorShellText,
                    appFontStyle,
                    { color: colors.textPrimary },
                    index < shellParagraphs.length - 1 ? styles.editorShellParagraph : null,
                  ]}
                >
                  {paragraph}
                </Text>
              ))
            )}
          </Animated.View>
        )}
      </View>
      <TextInput
        ref={keyboardBridgeInputRef}
        style={styles.keyboardBridgeInput}
        value={bridgeValue}
        multiline
        autoCorrect={false}
        autoCapitalize="none"
        onChangeText={handleBridgeTextChange}
        onKeyPress={handleBridgeKeyPress}
      />

      <View style={[styles.toolbarWrap, { bottom: toolbarBottom }]}> 
        <View style={[styles.toolbar, { borderTopColor: colors.borderLight, backgroundColor: colors.surface }]}> 
          <ToolbarBtn onPress={() => applyFormat('heading')} label="H" active={formats.heading} color={colors.textSecondary} activeColor={colors.primary} />
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

      <AppDialog
        visible={dialogConfig !== null}
        title={dialogConfig?.title ?? ''}
        message={dialogConfig?.message ?? ''}
        actions={dialogConfig?.actions ?? [{ label: 'OK', variant: 'primary' }]}
        onClose={closeDialog}
      />
    </View>
  );
}

function ToolbarBtn({
  onPress,
  icon,
  label,
  active,
  color,
  activeColor,
}: {
  onPress: () => void;
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label?: string;
  active: boolean;
  color: string;
  activeColor: string;
}) {
  return (
    <Pressable style={styles.toolbarBtn} onPress={onPress}>
      {label ? (
        <Text style={[styles.toolbarLabel, { color: active ? activeColor : color }]}>{label}</Text>
      ) : (
        <MaterialCommunityIcons name={icon} size={22} color={active ? activeColor : color} />
      )}
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
  editorSurface: {
    flex: 1,
    position: 'relative',
  },
  editorShell: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 30,
    paddingRight: 27,
    paddingBottom: 168,
    paddingLeft: 30,
  },
  editorShellText: {
    fontSize: 16,
    lineHeight: 27,
  },
  editorShellParagraph: {
    marginBottom: 9,
  },
  keyboardBridgeInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0.01,
    left: 0,
    top: 0,
    padding: 0,
    margin: 0,
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
  toolbarLabel: {
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 24,
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
