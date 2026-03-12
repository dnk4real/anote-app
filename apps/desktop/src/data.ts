export interface FolderItem {
  id: string;
  name: string;
  count: number;
}

export interface DesktopNote {
  id: string;
  preview: string;
  updatedAt: string;
  wordCount: number;
  isPinned: boolean;
  isStarred: boolean;
  folderId?: string;
  html: string;
}

export const folders: FolderItem[] = [
  { id: 'daily', name: '日常', count: 3 },
  { id: 'reading', name: '阅读摘录', count: 2 },
  { id: 'ideas', name: '灵感', count: 4 },
];

export const desktopNotes: DesktopNote[] = [
  {
    id: 'note-1',
    preview: 'This is a simple, open-source note app inspired by Smartisan Notes.',
    updatedAt: '2026/03/11 23:14',
    wordCount: 124,
    isPinned: true,
    isStarred: true,
    folderId: 'ideas',
    html: `<p><strong>This is a simple, open-source note app</strong> inspired by Smartisan Notes.</p>
<p>It keeps the warm paper texture and the slightly skeptical visual tone, while letting us scale into a real desktop workspace.</p>
<blockquote>Desktop should feel calm, spacious, and useful at a glance.</blockquote>`,
  },
  {
    id: 'note-2',
    preview: 'Minimal yet elegant design. 简洁而优雅的设计。',
    updatedAt: '2026/03/11 18:40',
    wordCount: 62,
    isPinned: false,
    isStarred: true,
    folderId: 'reading',
    html: `<p><strong>Minimal yet elegant design.</strong> 简洁而优雅的设计。</p>
<p>The sidebar stays compact, and the canvas keeps enough breathing room for long-form writing.</p>`,
  },
  {
    id: 'note-3',
    preview: '所有数据都存储在你自己的设备里，之后再通过同步策略去汇合。',
    updatedAt: '2026/03/10 09:32',
    wordCount: 91,
    isPinned: false,
    isStarred: false,
    folderId: 'daily',
    html: `<p>所有数据都存储在你自己的设备里，之后再通过 GitHub 或 WebDAV 去汇合。</p>
<p>这让桌面版和手机版可以共享同一套同步结构，而不是彼此硬绑定。</p>`,
  },
  {
    id: 'note-4',
    preview: '留给未来桌面版的一个空白入口，也许会从这里开始写下今天。',
    updatedAt: '2026/03/09 22:08',
    wordCount: 47,
    isPinned: false,
    isStarred: false,
    html: `<p>留给未来桌面版的一个空白入口。</p>
<p>如果右侧什么都没选中，就让空态也看起来像是经过设计的，而不是程序的默认占位。</p>`,
  },
];
