import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons';
import { buildLongImage } from '../lib/long-image';
import type { AppLanguage, LongImageTheme } from '../lib/models';
import { buildNotePreview } from '../lib/note-utils';

interface LongImageModalProps {
  open: boolean;
  noteHtml: string;
  language: AppLanguage;
  fontFaceCss: string;
  fontFamily: string;
  exporting: boolean;
  onClose: () => void;
  onExport: (payload: ReturnType<typeof buildLongImage>, theme: LongImageTheme) => Promise<void>;
}

export function LongImageModal({
  open,
  noteHtml,
  language,
  fontFaceCss,
  fontFamily,
  exporting,
  onClose,
  onExport,
}: LongImageModalProps) {
  const [theme, setTheme] = useState<LongImageTheme>('light');

  useEffect(() => {
    if (!open) return;
    setTheme('light');
  }, [open]);

  const image = useMemo(
    () =>
      buildLongImage({
        html: noteHtml,
        theme,
        fontFaceCss,
        fontFamily,
      }),
    [fontFaceCss, fontFamily, noteHtml, theme]
  );

  const title = language === 'zh' ? '长图导出' : 'Long Image Export';
  const subtitle = buildNotePreview(noteHtml, language);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="long-image-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <p className="modal-overline">{title}</p>
            <h3 className="modal-title">{subtitle}</h3>
          </div>

          <div className="modal-actions">
            <div className="segmented">
              <button className={theme === 'light' ? 'active' : ''} type="button" onClick={() => setTheme('light')}>
                {language === 'zh' ? '浅色' : 'Light'}
              </button>
              <button className={theme === 'dark' ? 'active' : ''} type="button" onClick={() => setTheme('dark')}>
                {language === 'zh' ? '深色' : 'Dark'}
              </button>
            </div>
            <button className="primary-pill" type="button" disabled={exporting} onClick={() => void onExport(image, theme)}>
              <Icon name="download" size={15} strokeWidth={1.9} />
              <span>{exporting ? (language === 'zh' ? '导出中...' : 'Exporting...') : language === 'zh' ? '导出 PNG' : 'Export PNG'}</span>
            </button>
            <button className="paper-action modal-back-button" type="button" onClick={onClose}>
              <Icon name="chevron_back" size={16} strokeWidth={2} />
              <span>{language === 'zh' ? '返回' : 'Back'}</span>
            </button>
          </div>
        </header>

        <div className="long-image-preview-frame">
          <iframe className="long-image-preview" srcDoc={image.html} title={title} />
        </div>
      </section>
    </div>
  );
}
