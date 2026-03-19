import { FontAwesome6, Ionicons, MaterialCommunityIcons, MaterialIcons, Octicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { format } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Modal,
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
import { useLocalization } from '../contexts/LocalizationContext';
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
  | { type: 'historyState'; payload: { canUndo: boolean; canRedo: boolean } }
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
    .replace(/<li[^>]*>/gi, '\u2022 ')
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

const INLINE_IMAGE_QUALITY = 0.7;
const MAX_INLINE_IMAGE_BYTES = 1_250_000;
const MAX_INLINE_IMAGE_SHORT_EDGE = 1080;

const WEBVIEW_PASTE_ENHANCER_SCRIPT = `
(function () {
  try {
    var editor = document.getElementById('editor');
    if (!editor) return;
    if (editor.getAttribute('data-anote-paste-enhancer') === '1') return;
    editor.setAttribute('data-anote-paste-enhancer', '1');

    var escapeHtml = function (value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    var plainTextToEditorHtml = function (rawText) {
      var lines = String(rawText || '').replace(/\\r\\n?/g, '\\n').split('\\n');
      return lines
        .map(function (line) {
          if (!line.trim()) return '<div><br></div>';
          return '<div>' + escapeHtml(line) + '</div>';
        })
        .join('');
    };

    var isCenterAlignedElement = function (element) {
      if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
      var align = String(element.getAttribute('align') || '').toLowerCase();
      var style = String(element.getAttribute('style') || '').toLowerCase();
      return align === 'center' || /text-align\\s*:\\s*center/.test(style);
    };

    var sanitizePastedHtml = function (rawHtml) {
      if (!rawHtml || !String(rawHtml).trim()) return '';

      var parsed = null;
      try {
        parsed = new DOMParser().parseFromString(String(rawHtml), 'text/html');
      } catch (error) {
        return '';
      }
      if (!parsed || !parsed.body) return '';

      parsed.querySelectorAll('script,style,meta,link,iframe,object').forEach(function (node) {
        node.remove();
      });

      var doc = parsed;
      var topLevelBlocks = new Set([
        'DIV',
        'P',
        'SECTION',
        'ARTICLE',
        'HEADER',
        'FOOTER',
        'MAIN',
        'ASIDE',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
        'UL',
        'OL',
        'BLOCKQUOTE',
        'PRE',
        'LI',
      ]);

      var hasMeaningfulChildren = function (element) {
        return Boolean(
          (element.textContent || '').trim() ||
            element.querySelector('br,strong,em,ul,ol,li,blockquote,h2')
        );
      };

      var sanitizeInlineInto = function (sourceNode, target) {
        if (!sourceNode) return;
        if (sourceNode.nodeType === Node.TEXT_NODE) {
          target.appendChild(doc.createTextNode(sourceNode.textContent || ''));
          return;
        }
        if (sourceNode.nodeType !== Node.ELEMENT_NODE) return;

        var tag = sourceNode.tagName.toUpperCase();
        if (tag === 'BR') {
          target.appendChild(doc.createElement('br'));
          return;
        }
        if (tag === 'B' || tag === 'STRONG') {
          var strong = doc.createElement('strong');
          Array.from(sourceNode.childNodes).forEach(function (child) {
            sanitizeInlineInto(child, strong);
          });
          target.appendChild(strong);
          return;
        }
        if (tag === 'I' || tag === 'EM') {
          var em = doc.createElement('em');
          Array.from(sourceNode.childNodes).forEach(function (child) {
            sanitizeInlineInto(child, em);
          });
          target.appendChild(em);
          return;
        }

        Array.from(sourceNode.childNodes).forEach(function (child) {
          sanitizeInlineInto(child, target);
        });
      };

      var sanitizeList = function (sourceList) {
        var tag = sourceList.tagName.toUpperCase() === 'OL' ? 'ol' : 'ul';
        var list = doc.createElement(tag);
        if (isCenterAlignedElement(sourceList)) {
          list.style.textAlign = 'center';
        }

        var items = Array.from(sourceList.childNodes).filter(function (child) {
          return child.nodeType === Node.ELEMENT_NODE && child.tagName.toUpperCase() === 'LI';
        });

        items.forEach(function (item) {
          var li = doc.createElement('li');
          Array.from(item.childNodes).forEach(function (child) {
            sanitizeInlineInto(child, li);
          });
          if (hasMeaningfulChildren(li)) {
            list.appendChild(li);
          }
        });

        return hasMeaningfulChildren(list) ? list : null;
      };

      var sanitizeBlock = function (sourceNode) {
        if (!sourceNode) return null;
        if (sourceNode.nodeType === Node.TEXT_NODE) {
          var text = String(sourceNode.textContent || '');
          if (!text.trim()) return null;
          var textDiv = doc.createElement('div');
          textDiv.textContent = text;
          return textDiv;
        }
        if (sourceNode.nodeType !== Node.ELEMENT_NODE) return null;

        var tag = sourceNode.tagName.toUpperCase();
        if (tag === 'UL' || tag === 'OL') {
          return sanitizeList(sourceNode);
        }
        if (tag === 'BLOCKQUOTE') {
          var blockquote = doc.createElement('blockquote');
          Array.from(sourceNode.childNodes).forEach(function (child) {
            sanitizeInlineInto(child, blockquote);
          });
          if (isCenterAlignedElement(sourceNode)) {
            blockquote.style.textAlign = 'center';
          }
          return hasMeaningfulChildren(blockquote) ? blockquote : null;
        }
        if (/^H[1-6]$/.test(tag)) {
          var heading = doc.createElement('h2');
          Array.from(sourceNode.childNodes).forEach(function (child) {
            sanitizeInlineInto(child, heading);
          });
          if (isCenterAlignedElement(sourceNode)) {
            heading.style.textAlign = 'center';
          }
          return hasMeaningfulChildren(heading) ? heading : null;
        }

        var div = doc.createElement('div');
        if (isCenterAlignedElement(sourceNode)) {
          div.style.textAlign = 'center';
        }
        Array.from(sourceNode.childNodes).forEach(function (child) {
          sanitizeInlineInto(child, div);
        });
        if (!hasMeaningfulChildren(div)) {
          div.appendChild(doc.createElement('br'));
        }
        return div;
      };

      var root = doc.createElement('div');
      var inlineBuffer = null;
      var flushInlineBuffer = function () {
        if (!inlineBuffer) return;
        if (hasMeaningfulChildren(inlineBuffer)) {
          root.appendChild(inlineBuffer);
        }
        inlineBuffer = null;
      };

      Array.from(doc.body.childNodes).forEach(function (node) {
        var isBlock =
          node.nodeType === Node.ELEMENT_NODE && topLevelBlocks.has(node.tagName.toUpperCase());
        if (isBlock) {
          flushInlineBuffer();
          var block = sanitizeBlock(node);
          if (block) root.appendChild(block);
          return;
        }

        if (!inlineBuffer) {
          inlineBuffer = doc.createElement('div');
        }
        sanitizeInlineInto(node, inlineBuffer);
      });

      flushInlineBuffer();
      return root.innerHTML;
    };

    window.__anoteInsertPlainText = function (rawText) {
      var normalized = String(rawText || '').replace(/\r\n?/g, '\n');
      if (!normalized) return;
      var lines = normalized.split('\n');
      for (var i = 0; i < lines.length; i += 1) {
        var line = lines[i];
        if (line) {
          try {
            document.execCommand('insertText', false, line);
          } catch (e) {
            // ignore
          }
        }
        if (i < lines.length - 1) {
          var insertedBreak = false;
          try {
            insertedBreak = document.execCommand('insertParagraph', false);
          } catch (e) {
            insertedBreak = false;
          }
          if (!insertedBreak) {
            try {
              document.execCommand('insertHTML', false, '<br>');
            } catch (e) {
              // ignore
            }
          }
        }
      }
      if (window.__snapshot) {
        window.__snapshot();
      }
    };

    window.__anotePasteExternal = function (rawHtml, rawText) {
      var html = sanitizePastedHtml(rawHtml || '');
      if (html && html.trim()) {
        try {
          document.execCommand('insertHTML', false, html);
          if (window.__snapshot) {
            window.__snapshot();
          }
          return;
        } catch (e) {
          // fallback below
        }
      }
      if (window.__anoteInsertPlainText) {
        window.__anoteInsertPlainText(rawText || '');
      }
    };

    editor.addEventListener(
      'paste',
      function (event) {
        try {
          var clipboard = event.clipboardData;
          if (!clipboard) return;

          var rawHtml = clipboard.getData('text/html') || '';
          var rawText = clipboard.getData('text/plain') || '';
          if (!rawHtml && !rawText) return;

          event.preventDefault();

          var didInsert = false;
          var normalizedHtml = sanitizePastedHtml(rawHtml);
          if (normalizedHtml && normalizedHtml.trim()) {
            try {
              didInsert = document.execCommand('insertHTML', false, normalizedHtml);
            } catch (error) {
              didInsert = false;
            }
          }

          if (!didInsert && rawText) {
            var plainHtml = plainTextToEditorHtml(rawText);
            try {
              didInsert = document.execCommand('insertHTML', false, plainHtml);
            } catch (error) {
              didInsert = false;
            }
          }

          if (!didInsert && rawText) {
            try {
              didInsert = document.execCommand('insertText', false, rawText);
            } catch (error) {
              didInsert = false;
            }
          }

          if (window.__snapshot) {
            window.__snapshot();
          }
        } catch (error) {
          // keep editor stable even if paste enhancer fails
        }
      },
      true
    );
  } catch (error) {
    // keep editor stable even if enhancer init fails
  }
})();
true;
`;

function toBase64Bytes(base64: string): number {
  const normalized = base64.replace(/\s+/g, '');
  const padding = normalized.endsWith('==') ? 2 : normalized.endsWith('=') ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

async function buildInlineImage(asset: ImagePicker.ImagePickerAsset): Promise<{
  src: string;
  bytes: number;
}> {
  const sourceUri = String(asset.uri || '').replace(/\\/g, '/');
  if (!sourceUri) {
    throw new Error('Image URI is invalid.');
  }

  const width = Math.max(1, Math.floor(asset.width || 0));
  const height = Math.max(1, Math.floor(asset.height || 0));
  const shortEdge = Math.min(width, height);
  const scale = shortEdge > 0 ? Math.min(1, MAX_INLINE_IMAGE_SHORT_EDGE / shortEdge) : 1;
  const targetWidth = width > 0 ? Math.max(1, Math.round(width * scale)) : undefined;
  const targetHeight = height > 0 ? Math.max(1, Math.round(height * scale)) : undefined;

  const actions =
    targetWidth && targetHeight && (targetWidth !== width || targetHeight !== height)
      ? [{ resize: { width: targetWidth, height: targetHeight } }]
      : [];

  const manipulated = await ImageManipulator.manipulateAsync(sourceUri, actions, {
    compress: INLINE_IMAGE_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  const rawBase64 = String(manipulated.base64 || '').replace(/\s+/g, '');
  if (!rawBase64) {
    throw new Error('Cannot encode image.');
  }

  return {
    src: `data:image/jpeg;base64,${rawBase64}`,
    bytes: toBase64Bytes(rawBase64),
  };
}
function makeEditorDocument(
  initialHtml: string,
  background: string,
  textColor: string,
  hintColor: string,
  fontFaceCss: string,
  fontFamily: string,
  placeholderText: string,
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
    padding: 30px 28px 168px 30px;
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
  #editor:empty:before { content: ${JSON.stringify(placeholderText)}; color: ${hintColor}; }
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
  #editor .note-image-block {
    position: relative !important;
    width: 100%;
    max-width: 100%;
    margin: 10px 0 !important;
    transform: translateX(-3px);
    transition: transform 120ms ease, opacity 120ms ease;
  }
  #editor .note-image-block.is-moving {
    display: none !important;
  }
  #editor img {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    height: auto !important;
    margin: 10px 0 !important;
    border-radius: 7px !important;
    border: 4px solid rgba(255, 255, 255, 0.92) !important;
    box-shadow: 0 2px 10px rgba(28, 22, 18, 0.10), 0 1px 2px rgba(28, 22, 18, 0.06) !important;
    background: rgba(255, 255, 255, 0.16) !important;
  }
  #editor .note-image-block > img {
    margin: 0 !important;
  }
  #editor .note-image-handle {
    position: absolute;
    right: -23px;
    top: 74%;
    width: 35px;
    height: 35px;
    border-radius: 7px;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 1);
    border: 1px solid rgba(255, 255, 255, 0.98);
    box-shadow: 0 2px 8px rgba(28, 22, 18, 0.14);
    pointer-events: auto;
    touch-action: none;
    z-index: 5;
  }
  #editor .note-image-handle::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 10px;
    height: 8px;
    transform: translate(-50%, -50%);
    background-image:
      linear-gradient(rgba(191, 182, 172, 0.62), rgba(191, 182, 172, 0.62)),
      linear-gradient(rgba(191, 182, 172, 0.62), rgba(191, 182, 172, 0.62)),
      linear-gradient(rgba(191, 182, 172, 0.62), rgba(191, 182, 172, 0.62));
    background-size: 10px 1.5px, 10px 1.5px, 10px 1.5px;
    background-position: 0 0, 0 3px, 0 6px;
    background-repeat: no-repeat;
    opacity: 0.72;
    pointer-events: none;
  }
  #editor .note-image-block.is-adjusting .note-image-handle {
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.35), 0 4px 12px rgba(28, 22, 18, 0.20);
  }
  #editor .note-image-bubble {
    position: absolute;
    right: 40px;
    top: 74%;
    transform: translateY(-50%);
    min-width: 52px;
    height: 26px;
    padding: 0 10px;
    border-radius: 13px;
    background: rgba(255, 255, 255, 0.96);
    color: #6a6258;
    font-size: 12px;
    line-height: 26px;
    text-align: center;
    box-shadow: 0 2px 10px rgba(28, 22, 18, 0.14);
    pointer-events: none;
    opacity: 0;
    transition: opacity 120ms ease;
    z-index: 6;
    white-space: nowrap;
  }
  #editor .note-image-block.is-adjusting .note-image-bubble {
    opacity: 1;
  }
  #editor .note-image-drop-line {
    position: absolute;
    left: 0;
    width: 168px;
    height: 2px;
    border-radius: 999px;
    background: rgba(173, 138, 108, 0.75);
    pointer-events: none;
    display: none;
    z-index: 8;
  }
  #editor .note-image-drop-line::before {
    content: '';
    position: absolute;
    left: -8px;
    top: 50%;
    width: 16px;
    height: 16px;
    border-radius: 999px;
    transform: translateY(-50%);
    background: rgba(201, 168, 141, 0.95);
    box-shadow: 0 1px 4px rgba(28, 22, 18, 0.16);
  }
  #editor .note-image-drag-proxy {
    position: absolute;
    right: 24px;
    width: 156px;
    height: 38px;
    border-radius: 19px;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.98);
    box-shadow: 0 3px 12px rgba(28, 22, 18, 0.16);
    pointer-events: none;
    display: none;
    z-index: 10;
  }
  #editor .note-image-drag-proxy::after {
    content: '';
    position: absolute;
    left: 24px;
    right: 24px;
    top: 50%;
    height: 2px;
    transform: translateY(-50%);
    border-radius: 999px;
    background: rgba(210, 198, 186, 0.9);
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
  const IMAGE_BLOCK_SELECTOR = '.note-image-block';
  const IMAGE_HANDLE_SELECTOR = '.note-image-handle';
  const IMAGE_BUBBLE_SELECTOR = '.note-image-bubble';
  const DROP_LINE_SELECTOR = '.note-image-drop-line';
  const DRAG_PROXY_SELECTOR = '.note-image-drag-proxy';
  const MIN_IMAGE_WIDTH_RATIO = 0.38;
  const LONG_PRESS_MS = 260;
  const HISTORY_LIMIT = 30;
  let imageGesture = null;
  let imageGestureEventsBound = false;
  // History entries store both content and caret location for undo/redo.
  let historyStack = [];
  let historyIndex = -1;
  let historyTimer = null;
  let historyRestoring = false;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const getPoint = (event) => {
    if (event.touches && event.touches[0]) {
      return { x: event.touches[0].clientX, y: event.touches[0].clientY };
    }
    if (event.changedTouches && event.changedTouches[0]) {
      return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
    }
    if (typeof event.clientX === 'number' && typeof event.clientY === 'number') {
      return { x: event.clientX, y: event.clientY };
    }
    return null;
  };

  const cleanupEditorUi = (root) => {
    root.querySelectorAll('.note-image-handle, .note-image-bubble, .note-image-drop-line, .note-image-drag-proxy').forEach((node) => {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    root.querySelectorAll(IMAGE_BLOCK_SELECTOR).forEach((block) => {
      block.classList.remove('is-adjusting');
      block.classList.remove('is-moving');
    });
  };

  const getTopLevelBlocks = () =>
    Array.from(editor.childNodes).filter((node) =>
      node && node.nodeType === Node.ELEMENT_NODE && !isBridgeCaretNode(node)
    );

  const readImageWidthRatio = (block) => {
    const raw = Number(block.getAttribute('data-image-width'));
    if (Number.isFinite(raw) && raw > 0) {
      return clamp(raw / 100, MIN_IMAGE_WIDTH_RATIO, 1);
    }
    const blockWidth = block.getBoundingClientRect().width;
    const editorWidth = Math.max(editor.getBoundingClientRect().width, 1);
    return clamp(blockWidth / editorWidth, MIN_IMAGE_WIDTH_RATIO, 1);
  };

  const applyImageWidthRatio = (block, ratio) => {
    const nextRatio = clamp(ratio, MIN_IMAGE_WIDTH_RATIO, 1);
    const pct = Math.round(nextRatio * 1000) / 10;
    block.style.width = pct + '%';
    block.setAttribute('data-image-width', String(pct));
    return nextRatio;
  };

  const ensureImageBubble = (block) => {
    let bubble = block.querySelector(IMAGE_BUBBLE_SELECTOR);
    if (!bubble) {
      bubble = document.createElement('span');
      bubble.className = 'note-image-bubble';
      bubble.setAttribute('contenteditable', 'false');
      bubble.setAttribute('data-editor-ui', '1');
      block.appendChild(bubble);
    }
    return bubble;
  };

  const showImageBubble = (block, text) => {
    const bubble = ensureImageBubble(block);
    bubble.textContent = text;
    block.classList.add('is-adjusting');
  };

  const hideImageBubble = (block) => {
    block.classList.remove('is-adjusting');
  };

  const ensureDropLine = () => {
    let dropLine = editor.querySelector(DROP_LINE_SELECTOR);
    if (!dropLine) {
      dropLine = document.createElement('span');
      dropLine.className = 'note-image-drop-line';
      dropLine.setAttribute('contenteditable', 'false');
      dropLine.setAttribute('data-editor-ui', '1');
      editor.appendChild(dropLine);
    }
    return dropLine;
  };

  const ensureDragProxy = () => {
    let proxy = editor.querySelector(DRAG_PROXY_SELECTOR);
    if (!proxy) {
      proxy = document.createElement('span');
      proxy.className = 'note-image-drag-proxy';
      proxy.setAttribute('contenteditable', 'false');
      proxy.setAttribute('data-editor-ui', '1');
      editor.appendChild(proxy);
    }
    return proxy;
  };

  const hideDragProxy = () => {
    const proxy = editor.querySelector(DRAG_PROXY_SELECTOR);
    if (proxy) {
      proxy.style.display = 'none';
    }
  };

  const showDragProxyAt = (clientY) => {
    const proxy = ensureDragProxy();
    const rect = editor.getBoundingClientRect();
    const maxTop = Math.max(editor.scrollHeight - 20, 20);
    const top = clamp(clientY - rect.top, 20, maxTop);
    proxy.style.top = top + 'px';
    proxy.style.display = 'block';
  };

  const hideDropLine = () => {
    const dropLine = editor.querySelector(DROP_LINE_SELECTOR);
    if (dropLine) {
      dropLine.style.display = 'none';
    }
  };

  const showDropLine = (clientY) => {
    const dropLine = ensureDropLine();
    const rect = editor.getBoundingClientRect();
    const maxTop = Math.max(editor.scrollHeight - 2, 0);
    const top = clamp(clientY - rect.top, 0, maxTop);
    dropLine.style.top = top + 'px';
    dropLine.style.display = 'block';
  };

  const resolveDropTargetByPoint = (block, clientY) => {
    const blocks = getTopLevelBlocks().filter((item) => item !== block);
    if (blocks.length === 0) {
      return {
        beforeNode: null,
        line: 1,
        y: block.getBoundingClientRect().top,
      };
    }

    for (let index = 0; index < blocks.length; index += 1) {
      const item = blocks[index];
      const rect = item.getBoundingClientRect();
      const middle = rect.top + rect.height / 2;
      if (clientY < middle) {
        return {
          beforeNode: item,
          line: index + 1,
          y: rect.top,
        };
      }
    }

    const last = blocks[blocks.length - 1];
    const lastRect = last.getBoundingClientRect();
    return {
      beforeNode: null,
      line: blocks.length + 1,
      y: lastRect.bottom,
    };
  };

  const finishImageGesture = () => {
    if (!imageGesture) return;
    const state = imageGesture;
    imageGesture = null;
    clearTimeout(state.longPressTimer);
    if (state.mode === 'move') {
      if (state.beforeNode && state.beforeNode.parentNode === editor) {
        editor.insertBefore(state.block, state.beforeNode);
      } else {
        editor.appendChild(state.block);
      }
    }
    state.block.classList.remove('is-moving');
    hideImageBubble(state.block);
    hideDropLine();
    hideDragProxy();

    if (state.changed) {
      emit('contentSnapshot', snapshotHtml());
      readState();
      recordHistoryNow();
    }
  };

  const onImageGestureMove = (event) => {
    if (!imageGesture) return;
    const point = getPoint(event);
    if (!point) return;

    if (event.cancelable) event.preventDefault();
    event.stopPropagation();

    const dx = point.x - imageGesture.startX;
    const dy = point.y - imageGesture.startY;

    if (imageGesture.mode === 'pending') {
      if (Math.abs(dx) > 12 && Math.abs(dx) >= Math.abs(dy)) {
        clearTimeout(imageGesture.longPressTimer);
        imageGesture.mode = 'resize';
      } else {
        return;
      }
    }

    if (imageGesture.mode === 'resize') {
      const editorWidth = Math.max(editor.getBoundingClientRect().width, 1);
      const ratio = applyImageWidthRatio(
        imageGesture.block,
        imageGesture.startRatio + dx / editorWidth
      );
      imageGesture.changed = true;
      showImageBubble(imageGesture.block, Math.round(ratio * 100) + '%');
      return;
    }

    if (imageGesture.mode === 'move') {
      const target = resolveDropTargetByPoint(imageGesture.block, point.y);
      imageGesture.beforeNode = target.beforeNode;
      imageGesture.changed = true;
      showDropLine(target.y);
      showDragProxyAt(point.y);
      showImageBubble(imageGesture.block, 'Line ' + target.line);
    }
  };

  const onImageGestureEnd = (event) => {
    if (!imageGesture) return;
    if (event && event.cancelable) event.preventDefault();
    if (event && event.stopPropagation) event.stopPropagation();
    finishImageGesture();
  };

  const ensureImageGestureEvents = () => {
    if (imageGestureEventsBound) return;
    imageGestureEventsBound = true;
    document.addEventListener('touchmove', onImageGestureMove, { passive: false });
    document.addEventListener('mousemove', onImageGestureMove);
    document.addEventListener('touchend', onImageGestureEnd, { passive: false });
    document.addEventListener('mouseup', onImageGestureEnd);
    document.addEventListener('touchcancel', onImageGestureEnd, { passive: false });
  };

  const onImageHandleStart = (block, event) => {
    const point = getPoint(event);
    if (!point) return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();

    clearTimeout(imageGesture && imageGesture.longPressTimer);
    imageGesture = {
      block,
      startX: point.x,
      startY: point.y,
      startRatio: readImageWidthRatio(block),
      mode: 'pending',
      changed: false,
      beforeNode: null,
      longPressTimer: null,
    };

    showImageBubble(block, 'Hold...');
    suppressBridgeCaret();

    imageGesture.longPressTimer = setTimeout(() => {
      if (!imageGesture || imageGesture.block !== block) return;
      imageGesture.mode = 'move';
      imageGesture.block.classList.add('is-moving');
      const target = resolveDropTargetByPoint(block, imageGesture.startY);
      imageGesture.beforeNode = target.beforeNode;
      showDropLine(target.y);
      showDragProxyAt(imageGesture.startY);
      showImageBubble(block, 'Line ' + target.line);
    }, LONG_PRESS_MS);
  };

  const bindImageHandle = (block, handle) => {
    if (handle.getAttribute('data-bound') === '1') return;
    handle.setAttribute('data-bound', '1');
    handle.addEventListener('touchstart', (event) => onImageHandleStart(block, event), { passive: false });
    handle.addEventListener('mousedown', (event) => onImageHandleStart(block, event));
  };

  const ensureImageBlock = (img) => {
    let block = img.closest(IMAGE_BLOCK_SELECTOR);
    if (!block) {
      block = document.createElement('div');
      block.className = 'note-image-block';
      const parent = img.parentNode;
      if (!parent) return null;
      parent.insertBefore(block, img);
      block.appendChild(img);
    }

    if (!block.getAttribute('data-image-width')) {
      block.setAttribute('data-image-width', '98');
    }

    if (!block.style.width) {
      block.style.width = block.getAttribute('data-image-width') + '%';
    }

    let handle = block.querySelector(IMAGE_HANDLE_SELECTOR);
    if (!handle) {
      handle = document.createElement('span');
      handle.className = 'note-image-handle';
      handle.setAttribute('contenteditable', 'false');
      handle.setAttribute('data-editor-ui', '1');
      block.appendChild(handle);
    }

    bindImageHandle(block, handle);
    return block;
  };

  const enhanceImageBlocks = () => {
    Array.from(editor.querySelectorAll('img')).forEach((img) => {
      ensureImageBlock(img);
    });
  };

  const emit = (type, payload) => {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
  };

  const snapshotHtml = () => {
    normalizeTopLevelBlocks();
    const clone = editor.cloneNode(true);
    cleanupEditorUi(clone);
    const caret = clone.querySelector(BRIDGE_CARET_SELECTOR);
    if (caret && caret.parentNode) {
      caret.parentNode.removeChild(caret);
    }
    return clone.innerHTML;
  };

  const nodePathFromRoot = (node, root) => {
    const path = [];
    let current = node;
    while (current && current !== root) {
      const parent = current.parentNode;
      if (!parent) return null;
      const index = Array.prototype.indexOf.call(parent.childNodes, current);
      if (index < 0) return null;
      path.push(index);
      current = parent;
    }
    if (current !== root) return null;
    path.reverse();
    return path;
  };

  const nodeFromPath = (root, path) => {
    let current = root;
    for (let i = 0; i < path.length; i += 1) {
      if (!current || !current.childNodes) return null;
      const next = current.childNodes[path[i]];
      if (!next) return null;
      current = next;
    }
    return current;
  };

  const captureSelectionSnapshot = () => {
    const selection = window.getSelection && window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    if (container !== editor && !editor.contains(container)) return null;
    const path = nodePathFromRoot(container, editor);
    if (!path) return null;
    return {
      path,
      offset: range.startOffset,
    };
  };

  const restoreSelectionSnapshot = (snapshot) => {
    if (!snapshot || !Array.isArray(snapshot.path)) return false;
    const selection = window.getSelection && window.getSelection();
    if (!selection || !document.createRange) return false;

    let targetNode = nodeFromPath(editor, snapshot.path);
    if (!targetNode) {
      // Fallback to nearest existing ancestor path.
      for (let depth = snapshot.path.length - 1; depth >= 0; depth -= 1) {
        const parentNode = nodeFromPath(editor, snapshot.path.slice(0, depth));
        if (parentNode) {
          targetNode = parentNode;
          break;
        }
      }
    }
    if (!targetNode) return false;

    const range = document.createRange();
    const rawOffset = Number(snapshot.offset);
    const safeOffset = Number.isFinite(rawOffset) ? Math.max(0, rawOffset) : 0;

    if (targetNode.nodeType === Node.TEXT_NODE) {
      const max = (targetNode.textContent || '').length;
      range.setStart(targetNode, Math.min(safeOffset, max));
    } else {
      const max = targetNode.childNodes ? targetNode.childNodes.length : 0;
      range.setStart(targetNode, Math.min(safeOffset, max));
    }
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  };

  const emitHistoryState = () => {
    emit('historyState', {
      canUndo: historyIndex > 0,
      canRedo: historyIndex >= 0 && historyIndex < historyStack.length - 1,
    });
  };

  const clearHistoryTimer = () => {
    if (historyTimer) {
      clearTimeout(historyTimer);
      historyTimer = null;
    }
  };

  const recordHistory = () => {
    if (historyRestoring) return;
    const html = snapshotHtml();
    const selection = captureSelectionSnapshot();
    const nextEntry = { html, selection };
    if (historyIndex >= 0 && historyStack[historyIndex] && historyStack[historyIndex].html === html) {
      historyStack[historyIndex].selection = selection;
      emitHistoryState();
      return;
    }
    if (historyIndex >= 0 && historyIndex < historyStack.length - 1) {
      historyStack = historyStack.slice(0, historyIndex + 1);
    }
    historyStack.push(nextEntry);
    if (historyStack.length > HISTORY_LIMIT) {
      historyStack.shift();
    }
    historyIndex = historyStack.length - 1;
    emitHistoryState();
  };

  const scheduleHistoryRecord = () => {
    if (historyRestoring) return;
    clearHistoryTimer();
    historyTimer = setTimeout(() => {
      historyTimer = null;
      recordHistory();
    }, 280);
  };

  const recordHistoryNow = () => {
    clearHistoryTimer();
    recordHistory();
  };

  const restoreFromHistory = (targetIndex) => {
    if (targetIndex < 0 || targetIndex >= historyStack.length) return;
    clearHistoryTimer();
    const entry = historyStack[targetIndex];
    if (!entry || typeof entry.html !== 'string') return;
    historyRestoring = true;
    editor.innerHTML = entry.html || '';
    normalizeTopLevelBlocks();
    ensureImageGestureEvents();
    enhanceImageBlocks();
    historyIndex = targetIndex;
    const restoredSelection = restoreSelectionSnapshot(entry.selection);
    if (!bridgeCaretSuppressed) {
      if (restoredSelection) {
        syncBridgeCaretToSelection();
      } else {
        placeSelectionBeforeBridgeCaret();
      }
    }
    readState();
    emit('contentSnapshot', snapshotHtml());
    historyRestoring = false;
    emitHistoryState();
    try {
      editor.focus({ preventScroll: true });
    } catch (e) {
      editor.focus();
    }
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
    recordHistoryNow();
  };

  editor.addEventListener('input', () => {
    autoFocusCancelled = true;
    enhanceImageBlocks();
    scheduleHistoryRecord();
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
    document.execCommand(
      'insertHTML',
      false,
      '<div class="note-image-block" data-image-width="98" style="width:98%;"><img src="' +
        safeUri +
        '" /></div>'
    );
    enhanceImageBlocks();
    if (!bridgeCaretSuppressed) {
      placeSelectionBeforeBridgeCaret();
    }
    emit('contentSnapshot', snapshotHtml());
    readState();
    recordHistoryNow();
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
    scheduleHistoryRecord();
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
    recordHistoryNow();
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
    scheduleHistoryRecord();
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
    scheduleHistoryRecord();
  };
  window.__undo = () => {
    if (historyIndex <= 0) {
      emitHistoryState();
      return false;
    }
    restoreFromHistory(historyIndex - 1);
    return true;
  };
  window.__redo = () => {
    if (historyIndex < 0 || historyIndex >= historyStack.length - 1) {
      emitHistoryState();
      return false;
    }
    restoreFromHistory(historyIndex + 1);
    return true;
  };

  setTimeout(() => {
    normalizeTopLevelBlocks();
    ensureImageGestureEvents();
    enhanceImageBlocks();
    readState();
    recordHistoryNow();
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
  const { t } = useLocalization();
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
  const initialSnapshotSeenRef = useRef(false);
  const shellHiddenRef = useRef(false);
  const snapshotResolverRef = useRef<((html: string) => void) | null>(null);
  const isLeavingRef = useRef(false);
  const contentRef = useRef(noteContent);
  const loadedNoteIdRef = useRef<string | null>(null);
  const noteIdRef = useRef<string | null>(null);
  const deletingEmptyRef = useRef(false);
  const finalizingInputRef = useRef(false);
  const beforeRemoveInFlightRef = useRef(false);
  const bridgeValueRef = useRef('');
  const bridgeEchoPrefixRef = useRef('');
  const bridgeEchoGuardUntilRef = useRef(0);

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
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
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
        t('editor.startTyping'),
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
      t,
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
    initialSnapshotSeenRef.current = shouldAutoFocusParam;
    shellHiddenRef.current = false;
    setCharCount(getCharCount(noteContent));
    bridgeValueRef.current = '';
    bridgeEchoPrefixRef.current = '';
    bridgeEchoGuardUntilRef.current = 0;
    setBridgeValue('');
    setHistoryState({ canUndo: false, canRedo: false });
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
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  useEffect(() => {
    const shellOpacity = shellOpacityRef.current;
    return () => {
      if (shellHideTimerRef.current) {
        clearTimeout(shellHideTimerRef.current);
        shellHideTimerRef.current = null;
      }
      shellOpacity.stopAnimation();
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

  const goBackToMain = useCallback(() => {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)');
  }, [navigation, router]);

  const saveNow = useCallback(async (options?: { silentUi?: boolean }) => {
    if (!note) return;
    const latestHtml = contentRef.current;
    if (!options?.silentUi) {
      setCharCount(getCharCount(latestHtml));
    }
    if (!hasMeaningfulNoteContent(latestHtml)) {
      return;
    }
    try {
      await updateNote(note.id, latestHtml);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('editor.saveFailedFallback');
      setDialogConfig({
        title: t('editor.saveFailed'),
        message,
      });
    }
  }, [note, t, updateNote]);

  const finalizeInputSession = useCallback(
    async (options?: { dismissKeyboard?: boolean }) => {
      if (finalizingInputRef.current) return;
      finalizingInputRef.current = true;

      try {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }

        await captureContent();
        await saveNow();
        bridgeValueRef.current = '';
        bridgeEchoPrefixRef.current = '';
        bridgeEchoGuardUntilRef.current = 0;
        setBridgeValue('');
        setKeyboardVisible(false);
        setKeyboardHeight(0);
        webviewRef.current?.injectJavaScript('window.__dismissInput && window.__dismissInput(); true;');
        if (options?.dismissKeyboard) {
          Keyboard.dismiss();
        }
      } finally {
        finalizingInputRef.current = false;
      }
    },
    [captureContent, saveNow]
  );

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

  const runLeaveEmptyCheck = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    isLeavingRef.current = true;
    await captureContent();
    if (!noteIdRef.current) return;
    const deleted = await deleteNoteIfEmpty();
    if (!deleted) {
      await saveNow({ silentUi: true });
    }
  }, [captureContent, deleteNoteIfEmpty, saveNow]);

  useEffect(() => {
    const nav = navigation as unknown as {
      addListener: (event: 'beforeRemove', callback: (event: { preventDefault: () => void; data: { action: unknown } }) => void) => () => void;
      dispatch: (action: unknown) => void;
    };

    const unsubscribe = nav.addListener('beforeRemove', (event) => {
      if (beforeRemoveInFlightRef.current) return;
      const actionType = String((event as { data?: { action?: { type?: string } } })?.data?.action?.type ?? '');
      if (actionType !== 'GO_BACK' && actionType !== 'POP' && actionType !== 'POP_TO_TOP') {
        return;
      }

      event.preventDefault();
      beforeRemoveInFlightRef.current = true;
      void (async () => {
        try {
          await runLeaveEmptyCheck();
        } finally {
          beforeRemoveInFlightRef.current = false;
          nav.dispatch(event.data.action);
        }
      })();
    });

    return unsubscribe;
  }, [navigation, runLeaveEmptyCheck]);

  async function handleBack() {
    if (navigation.canGoBack()) {
      router.back();
      return;
    }

    await runLeaveEmptyCheck();
    router.replace('/(tabs)');
  }

  function applyFormat(kind: FormatKind) {
    webviewRef.current?.injectJavaScript(`window.__editorApply('${kind}'); true;`);
    scheduleSave();
  }

  const handleUndo = useCallback(() => {
    if (!historyState.canUndo) return;
    webviewRef.current?.injectJavaScript('window.__undo && window.__undo(); true;');
    scheduleSave();
  }, [historyState.canUndo, scheduleSave]);

  const handleRedo = useCallback(() => {
    if (!historyState.canRedo) return;
    webviewRef.current?.injectJavaScript('window.__redo && window.__redo(); true;');
    scheduleSave();
  }, [historyState.canRedo, scheduleSave]);

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
    bridgeEchoPrefixRef.current = bridgeValueRef.current;
    bridgeEchoGuardUntilRef.current = Date.now() + 1200;
    injectBridgeLineBreak();
    bridgeValueRef.current = '';
    setBridgeValue('');
  }, [injectBridgeLineBreak]);

  const injectBridgePasteFromClipboard = useCallback((html: string, text: string) => {
    const js = `
      (function () {
        var rawHtml = ${JSON.stringify(html || '')};
        var rawText = ${JSON.stringify(text || '')};
        if (window.__focusEditor) window.__focusEditor();
        if (window.__anotePasteExternal) {
          window.__anotePasteExternal(rawHtml, rawText);
        } else if (window.__anoteInsertPlainText) {
          window.__anoteInsertPlainText(rawText);
        } else if (window.__insertText) {
          window.__insertText(rawText);
        }
        if (window.__focusEditor) window.__focusEditor();
      })();
      true;
    `;
    webviewRef.current?.injectJavaScript(js);
  }, []);

  const handleBridgePasteCandidate = useCallback(
    async (candidateText: string) => {
      const normalize = (value: string) => String(value || '').replace(/\r\n?/g, '\n');
      const candidate = normalize(candidateText);
      let plain = '';
      let html = '';

      try {
        plain = await Clipboard.getStringAsync({
          preferredFormat: Clipboard.StringFormat.PLAIN_TEXT,
        });
      } catch {
        plain = '';
      }

      try {
        html = await Clipboard.getStringAsync({
          preferredFormat: Clipboard.StringFormat.HTML,
        });
      } catch {
        html = '';
      }

      const normalizedPlain = normalize(plain);
      const normalizedCandidate = normalize(candidate);
      const matchesClipboard =
        normalizedPlain === normalizedCandidate ||
        normalizedPlain.endsWith(normalizedCandidate) ||
        normalizedCandidate.endsWith(normalizedPlain) ||
        normalizedPlain.includes(normalizedCandidate);

      const hasHtmlTags = /<\/?[a-z][^>]*>/i.test(html || '');

      if (matchesClipboard && hasHtmlTags) {
        injectBridgePasteFromClipboard(html, normalizedCandidate);
        return;
      }

      injectBridgePasteFromClipboard('', normalizedCandidate);
    },
    [injectBridgePasteFromClipboard]
  );

  const handleBridgeTextChange = useCallback((text: string) => {
    const previous = bridgeValueRef.current;
    const rawText = String(text || '');
    const hasLineBreak = /[\r\n]/.test(text);
    let next = text.replace(/[\r\n]/g, '');

    if (bridgeEchoGuardUntilRef.current > 0) {
      const guardActive = Date.now() <= bridgeEchoGuardUntilRef.current;
      const echoPrefix = bridgeEchoPrefixRef.current;

      if (echoPrefix && next.startsWith(echoPrefix)) {
        next = next.slice(echoPrefix.length);
      }

      if (!next && (hasLineBreak || echoPrefix)) {
        bridgeValueRef.current = '';
        setBridgeValue('');
        if (!guardActive) {
          bridgeEchoPrefixRef.current = '';
          bridgeEchoGuardUntilRef.current = 0;
        }
        return;
      }

      if (next || !guardActive) {
        bridgeEchoPrefixRef.current = '';
        bridgeEchoGuardUntilRef.current = 0;
      }
    }

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
    const likelyPaste =
      rawText.length > previous.length + 1 || (hasLineBreak && /[^\r\n]/.test(rawText));
    const normalizedRaw = rawText.replace(/\r\n?/g, '\n');
    const pastedChunk = normalizedRaw.startsWith(previous)
      ? normalizedRaw.slice(previous.length)
      : normalizedRaw;

    if (deletedCount > 0) {
      webviewRef.current?.injectJavaScript(
        `window.__deleteBackwardCount && window.__deleteBackwardCount(${deletedCount}); true;`
      );
    }

    if (likelyPaste && pastedChunk) {
      bridgeValueRef.current = '';
      setBridgeValue('');
      void handleBridgePasteCandidate(pastedChunk);
      return;
    }

    if (insertedText) {
      webviewRef.current?.injectJavaScript(
        `window.__insertText && window.__insertText(${JSON.stringify(insertedText)}); true;`
      );
      webviewRef.current?.injectJavaScript('window.__focusEditor && window.__focusEditor(); true;');
    }

    bridgeValueRef.current = next;
    setBridgeValue(next);
  }, [handleBridgePasteCandidate]);

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
    if (bridgeValueRef.current.length > 0) return;
    webviewRef.current?.injectJavaScript('window.__deleteBackward && window.__deleteBackward(); true;');
  }, [insertBridgeLineBreak]);

  useEffect(() => {
    if (!shouldAutoFocusParam) return;
    shouldAutoFocusRef.current = true;
    triggerAutoFocus();
  }, [shouldAutoFocusParam, triggerAutoFocus]);

  const handleEditorLoadEnd = useCallback(() => {
    webviewLoadedRef.current = true;
    webviewRef.current?.injectJavaScript(WEBVIEW_PASTE_ENHANCER_SCRIPT);
    triggerAutoFocus();
    if (!initialSnapshotSeenRef.current) {
      hideEditorShell(360);
    }
  }, [hideEditorShell, triggerAutoFocus]);

  async function handleInsertImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setDialogConfig({
        title: t('editor.permissionRequired'),
        message: t('editor.allowPhotoAccess'),
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 1,
      base64: false,
      exif: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    let inlineImage: { src: string; bytes: number };
    try {
      inlineImage = await buildInlineImage(asset);
    } catch {
      setDialogConfig({
        title: t('editor.insertFailed'),
        message: t('editor.insertFailedMessage'),
      });
      return;
    }

    if (inlineImage.bytes > MAX_INLINE_IMAGE_BYTES) {
      const mb = (inlineImage.bytes / (1024 * 1024)).toFixed(2);
      setDialogConfig({
        title: t('editor.imageTooLarge'),
        message: t('editor.imageTooLargeMessage', { size: mb }),
      });
      return;
    }

    webviewRef.current?.injectJavaScript(
      `window.__insertImage(${JSON.stringify(inlineImage.src)}); true;`
    );
    scheduleSave();
  }

  async function handleConfirmSave() {
    await finalizeInputSession({ dismissKeyboard: true });
  }

  function onWebMessage(raw: string) {
    try {
      const data = JSON.parse(raw) as WebMessage;

      if (data.type === 'editorFocused' && data.payload) {
        setShareOpen(false);
      }

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

      if (
        data.type === 'historyState' &&
        data.payload &&
        typeof data.payload === 'object' &&
        typeof data.payload.canUndo === 'boolean' &&
        typeof data.payload.canRedo === 'boolean'
      ) {
        if (isLeavingRef.current) return;
        setHistoryState((prev) => {
          if (prev.canUndo === data.payload.canUndo && prev.canRedo === data.payload.canRedo) {
            return prev;
          }
          return { canUndo: data.payload.canUndo, canRedo: data.payload.canRedo };
        });
      }

      if (data.type === 'contentSnapshot' && typeof data.payload === 'string') {
        if (!initialSnapshotSeenRef.current) {
          initialSnapshotSeenRef.current = true;
        }
        const nextContent = data.payload || '';
        const hasChanged = nextContent !== contentRef.current;
        contentRef.current = nextContent;
        if (!isLeavingRef.current) {
          setCharCount(getCharCount(contentRef.current));
          if (hasChanged) {
            scheduleSave();
          }
          if (showEditorShell) {
            hideEditorShell(25);
          }
        }
        if (snapshotResolverRef.current) {
          snapshotResolverRef.current(contentRef.current);
          snapshotResolverRef.current = null;
        }
      }

      if (data.type === 'plainText' && typeof data.payload === 'string') {
        const copied = data.payload || '';
        void Clipboard.setStringAsync(copied, {
          inputFormat: Clipboard.StringFormat.PLAIN_TEXT,
        }).then(() => {
          setDialogConfig({
            title: t('editor.copied'),
            message: t('editor.noteCopied'),
          });
        }).catch(() => {
          Share.share({ message: copied });
        });
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

  async function handleCopy() {
    setShareOpen(false);
    const snapshot = await captureContent();
    const plainText = buildShellText(snapshot || '');
    try {
      await Clipboard.setStringAsync(plainText || '', {
        inputFormat: Clipboard.StringFormat.PLAIN_TEXT,
      });
      setDialogConfig({
        title: t('editor.copied'),
        message: t('editor.noteCopied'),
      });
    } catch {
      await Share.share({ message: plainText || '' });
    }
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
        <Text style={[Typography.body, { color: colors.textSecondary }]}>{t('editor.noteNotFound')}</Text>
      </View>
    );
  }

  const selectedFolders = note.folderIds
    .map((folderId) => folders.find((folder) => folder.id === folderId))
    .filter(Boolean) as { name: string }[];
  const hasFolder = selectedFolders.length > 0;
  const folderDisplayText = (() => {
    if (!hasFolder) return t('editor.addToFolder');
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

        <View style={[styles.navActions, showInputActions && styles.navActionsInput]}>
          {showInputActions ? (
            <>
              <Pressable
                onPress={handleUndo}
                disabled={!historyState.canUndo}
                style={[styles.navActionBtn, !historyState.canUndo && styles.navActionBtnDisabled]}
              >
                <Octicons name="undo" size={20} color={colors.textSecondary} />
              </Pressable>
              <Pressable
                onPress={handleRedo}
                disabled={!historyState.canRedo}
                style={[styles.navActionBtn, !historyState.canRedo && styles.navActionBtnDisabled]}
              >
                <Octicons name="redo" size={20} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={handleInsertImage} style={styles.navActionBtn}>
                <FontAwesome6 name="image" size={20} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={handleConfirmSave} style={styles.navActionBtn}>
                <FontAwesome6 name="check" size={20} color={colors.textSecondary} />
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => setShareOpen((value) => !value)} style={styles.navActionBtn}>
                <FontAwesome6 name="share" size={20} color={colors.textSecondary} />
              </Pressable>
              <Pressable onPress={handleDelete} style={styles.navActionBtn}>
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
                {t('editor.startTyping')}
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
        blurOnSubmit={false}
        returnKeyType="default"
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
            <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>{t('common.copy')}</Text>
          </Pressable>
          <Pressable style={styles.shareItem} onPress={handleGenerateLongImage}>
            <Text style={[Typography.bodySmall, { color: colors.textPrimary }]}>
              {t('editor.generateLongImage')}
            </Text>
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
                placeholder={t('editor.newFolder')}
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
        actions={dialogConfig?.actions ?? [{ label: t('common.ok'), variant: 'primary' }]}
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
  navActionsInput: {
    width: 164,
    gap: Spacing.md,
  },
  navActionBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navActionBtnDisabled: {
    opacity: 0.34,
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
    paddingRight: 28,
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

