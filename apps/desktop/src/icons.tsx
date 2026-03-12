import type { CSSProperties, ReactNode, SVGProps } from 'react';
import {
  mdiFormatAlignCenter,
  mdiFormatBold,
  mdiFormatItalic,
  mdiFormatListBulleted,
  mdiFormatQuoteClose,
} from '@mdi/js';
import { RedoIcon, UndoIcon } from '@primer/octicons-react';
import type { IconType } from 'react-icons';
import { FiDownload, FiEdit3, FiSettings } from 'react-icons/fi';
import { FaCheck, FaImage as FaImageSolid, FaRegImage, FaRegTrashCan, FaShare } from 'react-icons/fa6';
import {
  IoAdd,
  IoAlertCircleOutline,
  IoArchiveOutline,
  IoCalendarOutline,
  IoCheckmark,
  IoCheckmarkCircle,
  IoCheckmarkCircleOutline,
  IoChevronBack,
  IoChevronDown,
  IoChevronForward,
  IoCloudOutline,
  IoCloseCircle,
  IoCloseCircleOutline,
  IoCopyOutline,
  IoDownloadOutline,
  IoDocumentTextOutline,
  IoFolderOutline,
  IoHelpCircleOutline,
  IoLanguageOutline,
  IoLogoGithub,
  IoSearch,
  IoSearchOutline,
  IoStarOutline,
  IoSyncOutline,
  IoTextOutline,
  IoTimeOutline,
  IoTrashOutline,
} from 'react-icons/io5';
import { MdPushPin, MdStar } from 'react-icons/md';

export type IconName =
  | 'settings'
  | 'edit'
  | 'search'
  | 'time_outline'
  | 'calendar_outline'
  | 'text_outline'
  | 'checkmark_circle'
  | 'close_circle'
  | 'trash_outline'
  | 'language_outline'
  | 'sync_outline'
  | 'chevron_down'
  | 'github'
  | 'cloud_outline'
  | 'help_circle_outline'
  | 'chevron_forward'
  | 'download'
  | 'download_outline'
  | 'archive_outline'
  | 'checkmark'
  | 'chevron_back'
  | 'undo'
  | 'redo'
  | 'image'
  | 'image_solid'
  | 'save_check'
  | 'share'
  | 'trash'
  | 'star'
  | 'star_outline'
  | 'pin'
  | 'format_bold'
  | 'format_italic'
  | 'align_center'
  | 'list_bullets'
  | 'quote_mark'
  | 'document_outline'
  | 'folder_outline'
  | 'sync_success_outline'
  | 'sync_error_outline'
  | 'add'
  | 'search_outline'
  | 'copy'
  | 'window_minimize'
  | 'window_maximize'
  | 'window_restore'
  | 'window_close';

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

type CustomIconName =
  | 'undo'
  | 'redo'
  | 'format_bold'
  | 'format_italic'
  | 'align_center'
  | 'list_bullets'
  | 'quote_mark'
  | 'window_minimize'
  | 'window_maximize'
  | 'window_restore'
  | 'window_close';

const ICON_MAP: Record<Exclude<IconName, CustomIconName>, IconType> = {
  settings: FiSettings,
  edit: FiEdit3,
  search: IoSearch,
  time_outline: IoTimeOutline,
  calendar_outline: IoCalendarOutline,
  text_outline: IoTextOutline,
  checkmark_circle: IoCheckmarkCircle,
  close_circle: IoCloseCircle,
  trash_outline: IoTrashOutline,
  language_outline: IoLanguageOutline,
  sync_outline: IoSyncOutline,
  chevron_down: IoChevronDown,
  github: IoLogoGithub,
  cloud_outline: IoCloudOutline,
  help_circle_outline: IoHelpCircleOutline,
  chevron_forward: IoChevronForward,
  download: FiDownload,
  download_outline: IoDownloadOutline,
  archive_outline: IoArchiveOutline,
  checkmark: IoCheckmark,
  chevron_back: IoChevronBack,
  image: FaRegImage,
  image_solid: FaImageSolid,
  save_check: FaCheck,
  share: FaShare,
  trash: FaRegTrashCan,
  star: MdStar,
  star_outline: IoStarOutline,
  pin: MdPushPin,
  document_outline: IoDocumentTextOutline,
  folder_outline: IoFolderOutline,
  sync_success_outline: IoCheckmarkCircleOutline,
  sync_error_outline: IoAlertCircleOutline,
  add: IoAdd,
  search_outline: IoSearchOutline,
  copy: IoCopyOutline,
};

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

function FilledPathIcon({
  path,
  size,
  style,
  className,
}: {
  path: string;
  size: number;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      stroke="none"
      style={style}
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

function OcticonWrapper({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span className={className} style={{ display: 'inline-flex', lineHeight: 0, ...style }}>
      {children}
    </span>
  );
}

export function Icon({ name, size = 18, strokeWidth = 1.8, style, className }: IconProps) {
  switch (name) {
    case 'undo':
      return (
        <OcticonWrapper style={style} className={className}>
          <UndoIcon size={size} fill="currentColor" />
        </OcticonWrapper>
      );
    case 'redo':
      return (
        <OcticonWrapper style={style} className={className}>
          <RedoIcon size={size} fill="currentColor" />
        </OcticonWrapper>
      );
    case 'format_bold':
      return <FilledPathIcon path={mdiFormatBold} size={size} style={style} className={className} />;
    case 'format_italic':
      return <FilledPathIcon path={mdiFormatItalic} size={size} style={style} className={className} />;
    case 'align_center':
      return <FilledPathIcon path={mdiFormatAlignCenter} size={size} style={style} className={className} />;
    case 'list_bullets':
      return <FilledPathIcon path={mdiFormatListBulleted} size={size} style={style} className={className} />;
    case 'quote_mark':
      return <FilledPathIcon path={mdiFormatQuoteClose} size={size} style={style} className={className} />;
    case 'window_minimize':
      return (
        <Svg width={size} height={size} strokeWidth={strokeWidth} style={style} className={className}>
          <path d="M5 12.5h14" />
        </Svg>
      );
    case 'window_maximize':
      return (
        <Svg width={size} height={size} strokeWidth={strokeWidth} style={style} className={className}>
          <rect x="5" y="5" width="14" height="14" rx="0.5" />
        </Svg>
      );
    case 'window_restore':
      return (
        <Svg width={size} height={size} strokeWidth={strokeWidth} style={style} className={className}>
          <path d="M5 9h10v10H5z" />
          <path d="M19 15V5H9" />
        </Svg>
      );
    case 'window_close':
      return (
        <Svg width={size} height={size} strokeWidth={strokeWidth} style={style} className={className}>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </Svg>
      );
    default: {
      const Component = ICON_MAP[name];
      return <Component size={size} style={style} className={className} />;
    }
  }
}
