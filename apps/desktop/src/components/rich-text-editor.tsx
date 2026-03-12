import {
  type ChangeEvent,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import type { AppLanguage } from '../lib/models';
import { fileToCompressedInlineImage } from '../lib/note-utils';

export type RichTextCommand =
  | 'bold'
  | 'italic'
  | 'center'
  | 'list'
  | 'quote'
  | 'heading'
  | 'undo'
  | 'redo';

export interface RichTextEditorHandle {
  applyCommand: (command: RichTextCommand) => void;
  openImagePicker: () => void;
  focus: () => void;
}

interface RichTextEditorProps {
  noteId: string;
  initialHtml: string;
  language: AppLanguage;
  readOnly?: boolean;
  onChange: (html: string) => void;
  onError: (message: string) => void;
  onFormatChange?: (formats: Record<RichTextCommand, boolean>) => void;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(
  function RichTextEditor({ noteId, initialHtml, language, readOnly = false, onChange, onError, onFormatChange }, ref) {
    const leftEditorRef = useRef<HTMLDivElement | null>(null);
    const rightEditorRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const changeTimerRef = useRef<number | null>(null);
    const lastReceivedHtmlRef = useRef(initialHtml);
    const currentNoteIdRef = useRef(noteId);

    // Track active typing to prevent echo updates
    const isTypingRef = useRef<'left' | 'right' | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const isNewNote = currentNoteIdRef.current !== noteId;
      const isNewHtml = lastReceivedHtmlRef.current !== initialHtml;

      if (isNewNote || isNewHtml) {
        currentNoteIdRef.current = noteId;
        lastReceivedHtmlRef.current = initialHtml;

        if (leftEditorRef.current) {
          leftEditorRef.current.innerHTML = initialHtml;
        }
        if (rightEditorRef.current) {
          rightEditorRef.current.innerHTML = initialHtml;
        }
        
        // Reset scroll on new note
        if (isNewNote) {
            if (leftEditorRef.current) leftEditorRef.current.scrollTop = 0;
            // Next frame sync right scroll
            requestAnimationFrame(() => syncScroll());
        }
      }
    }, [initialHtml, noteId]);

    useEffect(() => {
      // Setup initial scroll offset for right pane
      requestAnimationFrame(() => syncScroll());
      
      const handleResize = () => {
          syncScroll();
      };
      window.addEventListener('resize', handleResize);

      return () => {
        if (changeTimerRef.current) {
          window.clearTimeout(changeTimerRef.current);
        }
        window.removeEventListener('resize', handleResize);
      };
    }, []);

    const syncScroll = () => {
        if (!leftEditorRef.current || !rightEditorRef.current) return;
        const pageHeight = leftEditorRef.current.clientHeight;
        rightEditorRef.current.scrollTop = leftEditorRef.current.scrollTop + pageHeight;
    };

    const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
        if (!leftEditorRef.current || !rightEditorRef.current) return;
        
        const pageHeight = leftEditorRef.current.clientHeight;
        const totalHeight = leftEditorRef.current.scrollHeight;
        
        // Maximum scroll allowed for the left pane so the right pane doesn't overshoot the bottom
        const maxScroll = Math.max(0, totalHeight - 2 * pageHeight);
        
        // If content is less than 2 pages, don't allow ANY scrolling
        if (maxScroll <= 0) {
             e.preventDefault();
             leftEditorRef.current.scrollTop = 0;
             rightEditorRef.current.scrollTop = pageHeight;
             return;
        }

        // Calculate new scroll position
        const currentScroll = leftEditorRef.current.scrollTop;
        let newScroll = currentScroll + e.deltaY;

        // Clamp to strict boundaries
        if (newScroll < 0) newScroll = 0;
        if (newScroll > maxScroll) newScroll = maxScroll;

        // Only prevent default if we actually need to clamp or scroll ourselves perfectly
        // Actually, to guarantee perfect sync without browser lag/overshoot, we always prevent default
        // and manually apply the scroll.
        if (newScroll !== currentScroll) {
            leftEditorRef.current.scrollTop = newScroll;
            syncScroll();
        }
    };

    const commitHtml = (nextHtml: string) => {
      lastReceivedHtmlRef.current = nextHtml;
      if (changeTimerRef.current) {
        window.clearTimeout(changeTimerRef.current);
      }
      changeTimerRef.current = window.setTimeout(() => {
        onChange(nextHtml);
      }, 180);
    };

    const readFormatState = () => {
      if (!onFormatChange) return;
      const formatBlock = (document.queryCommandValue('formatBlock') || '').toString().toLowerCase();
      onFormatChange({
        heading: formatBlock === 'h2',
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        center: document.queryCommandState('justifyCenter'),
        list: document.queryCommandState('insertUnorderedList'),
        quote: formatBlock === 'blockquote',
        undo: false,
        redo: false,
      });
    };

    const checkRightPaneVisibility = () => {
        if (!leftEditorRef.current || !rightEditorRef.current) return;
        const pageHeight = leftEditorRef.current.clientHeight;
        const totalHeight = leftEditorRef.current.scrollHeight;
        
        // If content doesn't even fill one page, hide the right pane visually
        if (totalHeight <= pageHeight) {
            rightEditorRef.current.style.opacity = '0';
            rightEditorRef.current.style.pointerEvents = 'none';
        } else {
            rightEditorRef.current.style.opacity = '1';
            rightEditorRef.current.style.pointerEvents = 'auto';
        }
    };

    // Update visibility and scroll on input
    const handleInput = (source: 'left' | 'right') => {
        const sourceRef = source === 'left' ? leftEditorRef : rightEditorRef;
        const targetRef = source === 'left' ? rightEditorRef : leftEditorRef;

        const nextHtml = sourceRef.current?.innerHTML ?? '';
        
        // Sync to the other pane (without stealing focus/cursor)
        if (targetRef.current && targetRef.current.innerHTML !== nextHtml) {
            targetRef.current.innerHTML = nextHtml;
        }

        commitHtml(nextHtml);
        readFormatState();
        
        // Adjust scroll of right pane in case content height changed drastically
        syncScroll();
        checkRightPaneVisibility();
    };

    const applyCommand = (command: RichTextCommand) => {
      const activeRef = document.activeElement === rightEditorRef.current ? rightEditorRef.current : leftEditorRef.current;
      if (!activeRef || readOnly) return;
      
      activeRef.focus();

      if (command === 'heading') {
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
      } else if (command === 'bold') {
        document.execCommand('bold', false);
      } else if (command === 'italic') {
        document.execCommand('italic', false);
      } else if (command === 'center') {
        if (document.queryCommandState('justifyCenter')) {
          document.execCommand('justifyLeft', false);
        } else {
          document.execCommand('justifyCenter', false);
        }
      } else if (command === 'list') {
        document.execCommand('insertUnorderedList', false);
      } else if (command === 'quote') {
        const block = (document.queryCommandValue('formatBlock') || '').toString().toLowerCase();
        if (block === 'blockquote') {
          document.execCommand('formatBlock', false, 'div');
        } else {
          document.execCommand('formatBlock', false, 'blockquote');
        }
      } else if (command === 'undo') {
        document.execCommand('undo');
      } else if (command === 'redo') {
        document.execCommand('redo');
      }

      handleInput(activeRef === rightEditorRef.current ? 'right' : 'left');
    };

    const insertImageAtSelection = (imageHtml: string, source: 'left' | 'right') => {
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (range) {
        range.deleteContents();
        const fragment = range.createContextualFragment(imageHtml);
        range.insertNode(fragment);
      } else {
        document.execCommand('insertHTML', false, imageHtml);
      }
      handleInput(source);
    };

    const handleImageInsert = async (event: ChangeEvent<HTMLInputElement>) => {
      if (readOnly) return;
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const image = await fileToCompressedInlineImage(file);
        const htmlBlock = `<div class="note-image-block" data-image-width="98" style="width:98%;"><img src="${image.src}" alt="" /></div><p></p>`;
        
        const activeRef = document.activeElement === rightEditorRef.current ? rightEditorRef.current : leftEditorRef.current;
        if (activeRef) activeRef.focus();
        
        insertImageAtSelection(htmlBlock, activeRef === rightEditorRef.current ? 'right' : 'left');
      } catch (error) {
        const message =
          error instanceof Error && error.message === 'IMAGE_TOO_LARGE'
            ? language === 'zh'
              ? '图片压缩后仍然太大，请换一张更小的。'
              : 'This image is still too large after compression.'

            : language === 'zh'
              ? '图片插入失败。'
              : 'Image insert failed.';
        onError(message);
      } finally {
        event.target.value = '';
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        applyCommand,
        openImagePicker: () => {
          if (!readOnly) {
            fileInputRef.current?.click();
          }
        },
        focus: () => leftEditorRef.current?.focus(),
      }),
      [readOnly]
    );

    return (
      <div className="editor-shell">
        <div className="editor-dual-view" ref={containerRef} onWheel={handleWheel}>
            <div
              ref={leftEditorRef}
              className={`editor-surface ${readOnly ? 'read-only' : ''}`}
              contentEditable={!readOnly}
              suppressContentEditableWarning
              data-placeholder={readOnly ? '' : language === 'zh' ? '开始输入...' : 'Start typing...'}
              onInput={() => handleInput('left')}
              onBlur={() => handleInput('left')}
              onFocus={readFormatState}
              onMouseUp={() => setTimeout(readFormatState, 0)}
              onKeyUp={() => setTimeout(readFormatState, 0)}
              style={{ overflowY: 'hidden' }}
            />
            
            <div
              ref={rightEditorRef}
              className={`editor-surface ${readOnly ? 'read-only' : ''}`}
              contentEditable={!readOnly}
              suppressContentEditableWarning
              data-placeholder={readOnly ? '' : language === 'zh' ? '开始输入...' : 'Start typing...'}
              onInput={() => handleInput('right')}
              onBlur={() => handleInput('right')}
              onFocus={readFormatState}
              onMouseUp={() => setTimeout(readFormatState, 0)}
              onKeyUp={() => setTimeout(readFormatState, 0)}
              style={{ overflowY: 'hidden', transition: 'opacity 0.2s ease' }}
            />
        </div>

        <input
          ref={fileInputRef}
          className="editor-image-input"
          type="file"
          accept="image/*"
          onChange={handleImageInsert}
        />
      </div>
    );
  }
);
