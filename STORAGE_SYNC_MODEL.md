# Anote Storage And Sync Model

Last updated: 2026-03-12

This document explains how Anote stores note data locally and remotely. It is intended for a new coding agent who needs a clear mental model of the existing system before changing sync, storage, or desktop support.

## 1. Core rule

The existing mobile app is the source of truth.

A new desktop client should try to stay compatible with the current mobile data model instead of inventing a different one.

That means:

- keep the same `Note` / `Folder` / `NoteTombstone` structure
- keep note content as HTML
- keep inline images embedded in note content
- keep GitHub and WebDAV remote formats compatible

The only thing that needs to differ on desktop is the local storage implementation, because desktop cannot directly use Expo `AsyncStorage` and `SecureStore`.

## 2. Core data types

Defined in:

- [apps/mobile/types/note.ts](F:/A-NOTE-APP/apps/mobile/types/note.ts)

### `Note`

```ts
{
  id: string;
  content: string;       // HTML string
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
  isStarred: boolean;
  isDeleted: boolean;
  folderIds: string[];
  sha?: string;          // sync bookkeeping, mainly GitHub
}
```

### `Folder`

```ts
{
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
}
```

### `NoteTombstone`

```ts
{
  id: string;
  deletedAt: string;
}
```

## 3. Important content rule

`Note.content` is not Markdown and not plain text.

It is HTML.

Examples:

### Plain note

```html
今天吃了火锅
```

### Rich text note

```html
<p><strong>重点</strong> 记得交房租</p>
```

### Note with image

```html
<p>今天的猫</p>
<div class="note-image-block" data-image-width="98" style="width:98%;">
  <img src="data:image/jpeg;base64,/9j/4AAQSk..." />
</div>
```

Important implication:

- images are stored inline inside the note HTML
- images are not currently stored as external files or external URLs

## 4. Local storage on mobile

Implementation:

- [apps/mobile/services/storage.ts](F:/A-NOTE-APP/apps/mobile/services/storage.ts)

Mobile local storage does **not** use one giant JSON file.

Instead, it stores three main JSON payloads separately in `AsyncStorage`:

- `@a_note_notes`
- `@a_note_folders`
- `@a_note_tombstones`

There is also a note backup key:

- `@a_note_notes_backup`

### Mental model

Think of local storage as three drawers:

- drawer 1: all notes
- drawer 2: all folders
- drawer 3: all tombstones

### Actual structure

#### `@a_note_notes`

This key stores a JSON array of `Note[]`.

Example:

```json
[
  {
    "id": "note-a",
    "content": "今天吃了火锅",
    "createdAt": "2026-03-12T10:00:00.000Z",
    "updatedAt": "2026-03-12T10:05:00.000Z",
    "isPinned": false,
    "isStarred": true,
    "isDeleted": false,
    "folderIds": ["folder-daily"]
  },
  {
    "id": "note-b",
    "content": "<p><strong>重点</strong> 记得交房租</p>",
    "createdAt": "2026-03-12T11:00:00.000Z",
    "updatedAt": "2026-03-12T11:05:00.000Z",
    "isPinned": true,
    "isStarred": false,
    "isDeleted": false,
    "folderIds": []
  }
]
```

#### `@a_note_folders`

This key stores a JSON array of `Folder[]`.

Example:

```json
[
  {
    "id": "folder-daily",
    "name": "日常",
    "createdAt": "2026-03-12T09:00:00.000Z",
    "updatedAt": "2026-03-12T09:00:00.000Z"
  }
]
```

#### `@a_note_tombstones`

This key stores a JSON array of `NoteTombstone[]`.

Example:

```json
[
  {
    "id": "note-b",
    "deletedAt": "2026-03-12T13:00:00.000Z"
  }
]
```

### Why local storage is split instead of one big object

This is intentional.

Benefits:

- notes are much larger than folders and tombstones
- note content can contain inline base64 images
- changing a folder should not require rewriting the huge notes payload
- changing a tombstone should not require rewriting the huge notes payload
- notes have their own backup key and size guard

### Size guard

`storage.ts` limits the serialized note payload size:

- `MAX_NOTES_PAYLOAD_BYTES = 5_500_000`

This exists because inline image data can otherwise make local storage unsafe.

## 5. Cloud storage with WebDAV

Implementation:

- [apps/mobile/services/webdav.ts](F:/A-NOTE-APP/apps/mobile/services/webdav.ts)

WebDAV uses a **single remote JSON file**.

Default file name:

- `a-note-sync.json`

The final remote URL is:

- `serverUrl + fileName`

Example:

If the user configures:

- `serverUrl = https://dav.jianguoyun.com/dav/anote_sync/`
- `fileName = a-note-sync.json`

then the remote file is effectively:

```text
https://dav.jianguoyun.com/dav/anote_sync/a-note-sync.json
```

### Remote file shape

WebDAV stores one object containing everything:

```json
{
  "notes": [
    {
      "id": "note-a",
      "content": "今天吃了火锅",
      "createdAt": "2026-03-12T10:00:00.000Z",
      "updatedAt": "2026-03-12T10:05:00.000Z",
      "isPinned": false,
      "isStarred": true,
      "isDeleted": false,
      "folderIds": ["folder-daily"]
    },
    {
      "id": "note-cat",
      "content": "<p>今天的猫</p><div class=\"note-image-block\"><img src=\"data:image/jpeg;base64,/9j/4AAQSk...\" /></div>",
      "createdAt": "2026-03-12T12:00:00.000Z",
      "updatedAt": "2026-03-12T12:10:00.000Z",
      "isPinned": false,
      "isStarred": false,
      "isDeleted": false,
      "folderIds": []
    }
  ],
  "folders": [
    {
      "id": "folder-daily",
      "name": "日常",
      "createdAt": "2026-03-12T09:00:00.000Z",
      "updatedAt": "2026-03-12T09:00:00.000Z"
    }
  ],
  "tombstones": [
    {
      "id": "note-b",
      "deletedAt": "2026-03-12T13:00:00.000Z"
    }
  ]
}
```

### WebDAV summary

WebDAV is:

- one remote file
- one big JSON object
- easier to reason about as a remote file store

## 6. Cloud storage with GitHub

Implementation:

- [apps/mobile/services/github.ts](F:/A-NOTE-APP/apps/mobile/services/github.ts)

GitHub does **not** use one giant file.

It uses a small file tree:

```text
notes/
  note-a.json
  note-b.json
  note-cat.json

sync/
  folders.json
  tombstones.json
```

There may also be `.gitkeep` files to initialize empty directories.

### `notes/<id>.json`

Each note is stored as its own JSON file.

Example `notes/note-a.json`:

```json
{
  "id": "note-a",
  "content": "今天吃了火锅",
  "createdAt": "2026-03-12T10:00:00.000Z",
  "updatedAt": "2026-03-12T10:05:00.000Z",
  "isPinned": false,
  "isStarred": true,
  "isDeleted": false,
  "folderIds": ["folder-daily"]
}
```

Example `notes/note-cat.json`:

```json
{
  "id": "note-cat",
  "content": "<p>今天的猫</p><div class=\"note-image-block\"><img src=\"data:image/jpeg;base64,/9j/4AAQSk...\" /></div>",
  "createdAt": "2026-03-12T12:00:00.000Z",
  "updatedAt": "2026-03-12T12:10:00.000Z",
  "isPinned": false,
  "isStarred": false,
  "isDeleted": false,
  "folderIds": []
}
```

### `sync/folders.json`

```json
[
  {
    "id": "folder-daily",
    "name": "日常",
    "createdAt": "2026-03-12T09:00:00.000Z",
    "updatedAt": "2026-03-12T09:00:00.000Z"
  }
]
```

### `sync/tombstones.json`

```json
[
  {
    "id": "note-b",
    "deletedAt": "2026-03-12T13:00:00.000Z"
  }
]
```

### GitHub summary

GitHub is:

- one file per note
- one file for folders
- one file for tombstones
- more natural for repository-style storage and smaller diffs per note

## 7. Why WebDAV and GitHub are different

They intentionally use different remote layouts.

### WebDAV

WebDAV is treated like a remote file drive.

Most natural approach:

- read one file
- merge
- write one file

### GitHub

GitHub is treated like a repository content API.

Most natural approach:

- read one note file at a time
- update only changed note files
- keep folders and tombstones separate

This makes GitHub sync more granular and avoids rewriting one giant note blob on every small note change.

## 8. Desktop recommendation

The future desktop app should stay compatible with the current mobile model.

Recommended desktop local storage shape:

- `notes.json`
- `folders.json`
- `tombstones.json`

This is not identical to mobile implementation, but it is logically equivalent.

Why this is a good fit:

- desktop cannot directly use Expo `AsyncStorage`
- desktop still benefits from split storage for the same reason mobile does
- this keeps local semantics close to mobile
- this keeps sync compatibility simple

### Recommended desktop rule

Keep these the same as mobile:

- note shape
- folder shape
- tombstone shape
- note HTML format
- inline image format
- GitHub remote layout
- WebDAV remote layout

Only replace:

- the local storage backend

## 9. Most important constraints for new work

1. Do not change `Note.content` away from HTML unless there is a deliberate migration plan.
2. Do not switch inline images to external URLs unless there is a deliberate migration plan.
3. Do not silently change GitHub remote layout.
4. Do not silently change WebDAV remote layout.
5. If desktop is added, make it read and write the same logical note model.

## 10. Key source files

- Local storage:
  - [apps/mobile/services/storage.ts](F:/A-NOTE-APP/apps/mobile/services/storage.ts)
- GitHub sync:
  - [apps/mobile/services/github.ts](F:/A-NOTE-APP/apps/mobile/services/github.ts)
- WebDAV sync:
  - [apps/mobile/services/webdav.ts](F:/A-NOTE-APP/apps/mobile/services/webdav.ts)
- Core types:
  - [apps/mobile/types/note.ts](F:/A-NOTE-APP/apps/mobile/types/note.ts)

