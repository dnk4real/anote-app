# Anote Handoff

Last updated: 2026-03-12

This document is meant to help a new coding agent take over the repository without replaying the full chat history. It focuses on the current architecture, completed work, important constraints, known issues, and the safest next steps.

## 1. Repository shape

The repository was recently reorganized into an app-style monorepo, but it is not using npm workspaces right now.

Current top-level intent:

- `apps/mobile`: the real Expo mobile app
- `apps/desktop`: the new desktop-first client shell
- `packages/shared-types`: placeholder shared type package
- `packages/sync-core`: placeholder shared sync package

Important caveat:

- The repo root still contains legacy files and directories from before the split, including a root `app.json`, `.expo`, `node_modules`, `dist`, and other generated folders.
- Treat `apps/mobile` as the real mobile project root.
- Treat `apps/desktop` as the real desktop project root.
- Do not assume the root Expo files are authoritative.

Root wrapper commands are in `package.json` and simply forward into the app folders.

## 2. High-level product status

### Mobile

The mobile app is the primary product and is far along. It already has:

- Smartisan Notes-inspired visual design
- Main notes list with folders, starred view, trash view
- Swipe-to-delete on notes and folders
- Folder management
- Rich text editor based on a WebView HTML editor
- Formatting toolbar
- Image insertion
- Image move and resize handle inside the editor
- Long image export with light and dark themes
- GitHub sync
- WebDAV sync
- Downloadable fonts
- Chinese and English localization
- App update check against GitHub Releases
- OTA configuration via Expo Updates

### Desktop

The desktop app is currently a shell, not a full product yet. It now has:

- React + Vite renderer
- Desktop-first layout and visual direction aligned with mobile
- Electron wrapper for running as a native desktop window
- Successful unpacked Windows build output after fixing packaged asset paths

It does not yet have:

- Real note storage
- Real sync integration
- Real editor
- Shared model integration with mobile

## 3. Root commands

From the repository root:

```bash
npm run mobile:start
npm run mobile:android
npm run mobile:web
npm run mobile:lint

npm run desktop:web
npm run desktop:electron
npm run desktop:build
npm run desktop:preview
npm run desktop:package:dir
npm run desktop:package
```

## 4. Mobile app structure

Main directories under `apps/mobile`:

- `app`: Expo Router screens
- `components`: reusable UI pieces
- `constants`: theme tokens
- `contexts`: core app state and cross-cutting concerns
- `services`: storage and sync implementation
- `types`: note/folder/sync config types
- `utils`: helper logic such as long-image rendering
- `assets`: icons and app assets

Main mobile routes:

- `app/(tabs)/index.tsx`: main notes screen
- `app/(tabs)/settings.tsx`: settings screen
- `app/editor.tsx`: editor screen
- `app/long-image-preview.tsx`: long image preview and save
- `app/github-sync-guide.tsx`: GitHub sync guide
- `app/webdav-sync-guide.tsx`: WebDAV sync guide

Important state providers:

- `contexts/NotesContext.tsx`
- `contexts/FontContext.tsx`
- `contexts/LocalizationContext.tsx`

Core services:

- `services/storage.ts`
- `services/github.ts`
- `services/webdav.ts`

Theme source:

- `constants/theme.ts`

## 5. Mobile data model

Core types are in `apps/mobile/types/note.ts`.

Current model:

- `Folder`
  - `id`
  - `name`
  - `createdAt`
  - `updatedAt`
- `Note`
  - `id`
  - `content` (HTML string, not Markdown)
  - `createdAt`
  - `updatedAt`
  - `isPinned`
  - `isStarred`
  - `isDeleted`
  - `folderIds`
  - optional `sha` for remote sync bookkeeping
- `GitHubConfig`
  - `token`
  - `repo`
  - `branch`
- `WebDAVConfig`
  - `serverUrl`
  - `username`
  - `password`
  - `fileName`
- `NoteTombstone`
  - `id`
  - `deletedAt`

Important note:

- Note content is rich-text HTML.
- Inline images are embedded inside that HTML as base64 JPEG data URLs after compression.

## 6. Mobile local persistence

Storage implementation lives in `apps/mobile/services/storage.ts`.

Current storage behavior:

- Notes, folders, and tombstones are stored in AsyncStorage.
- Notes are also backed up to a secondary AsyncStorage key.
- Notes are sorted before writing.
- There is a payload size guard:
  - `MAX_NOTES_PAYLOAD_BYTES = 5_500_000`
- If the primary notes payload fails to parse, the backup payload can be restored.

This payload guard matters because large inline images can otherwise blow up AsyncStorage and effectively corrupt the note list.

## 7. Notes context and app state

The main orchestration layer is `apps/mobile/contexts/NotesContext.tsx`.

It owns:

- current notes list
- current folders list
- GitHub config
- WebDAV config
- sync provider selection
- sync state
- note CRUD
- folder CRUD
- soft delete and permanent delete
- sync execution

Important current behavior:

- Sync provider is persisted separately with AsyncStorage.
- `createNote('', folderId?)` is used when creating a blank note from the main screen.
- Empty-note auto-cleanup is intentionally handled on editor leave, not on every save event.

## 8. Main screen behavior

The main notes screen is `apps/mobile/app/(tabs)/index.tsx`.

Implemented behavior:

- top bar with settings, folder switcher, new note
- title changes with folder
- Chinese "全部" title has a small manual X-offset adjustment
- note search
- starred / all / trash / folder filtering
- pull-to-sync from the main list
- in-place sync success / failure notice, no system alert popup
- note card swipe left to reveal delete action
- folder menu with left-swipe delete
- delete confirmation uses custom in-app dialog styling
- new note creates a blank note and opens editor immediately

Preview behavior:

- note cards do not use titles
- only the first line preview is shown
- preview length is intentionally truncated
- truncation avoids splitting an English word when possible

## 9. Editor architecture

The editor is the single trickiest part of the app.

File:

- `apps/mobile/app/editor.tsx`

The editor is not a plain native TextInput editor. It is a WebView-based rich text editor with a custom HTML document injected at runtime.

Why this matters:

- Rich text formatting is implemented in the WebView DOM, not as Markdown
- caret handling, keyboard behavior, undo/redo, image gestures, and save events all cross a React Native <-> WebView bridge
- this area is easy to break with "small cleanup" changes

### Current formatting features

Toolbar supports:

- bold
- italic
- centered paragraph
- list
- quote
- title
- undo
- redo
- image insert
- save/check action while keyboard is visible

Title behavior:

- the title button is a formatting mode inside the HTML editor
- it means "larger text + bold"
- it was explicitly fixed so the title action now also reliably applies bold
- long-image export is expected to reflect title formatting too

Undo/redo:

- history limit is 30 states
- history stores both content and caret location

### Editor shell and focus bridge

The editor uses a native "shell text" layer while the WebView is spinning up, so the transition from main list into editor feels faster.

There is also a hidden native TextInput bridge used to make "new note -> immediate keyboard -> immediate typing" work.

This is a historically fragile area.

Relevant concepts visible in `editor.tsx`:

- `buildShellText`
- `splitShellParagraphs`
- `keyboardBridgeInputRef`
- `bridgeCaret`
- `showEditorShell`
- `autoFocusOnLoad`

Important warning:

- If this bridge logic is changed casually, two old bugs tend to come back:
  - keyboard opens then immediately closes
  - no visible caret / broken backspace / duplicated text on first input

Current state:

- new note should auto-enter typing mode
- keyboard should appear automatically
- typing should work immediately
- bridge caret logic was repeatedly tuned to avoid broken first-input behavior

### Empty note deletion rule

This was intentionally changed late in development.

Current rule:

- blank notes are not deleted when keyboard hides
- blank notes are not deleted when pressing the check button
- blank notes are only checked when leaving the editor back to the main list
- if the note has no meaningful content at that moment, it is deleted

Meaningful content check is based on:

- non-empty text after stripping HTML whitespace
- or media elements such as `<img>`

This logic is in `editor.tsx` and uses:

- `hasMeaningfulNoteContent`
- `deleteNoteIfEmpty`
- `runLeaveEmptyCheck`

This specifically fixed the earlier bug where a brand-new note containing only an inserted image could be deleted incorrectly.

### Editor images

Image insertion is implemented in `editor.tsx`.

Pipeline:

- user picks image with `expo-image-picker`
- image is compressed with `expo-image-manipulator`
- image is stored inline as a base64 JPEG data URL in note HTML

Current image compression constants:

- `INLINE_IMAGE_QUALITY = 0.7`
- `MAX_INLINE_IMAGE_SHORT_EDGE = 1080`
- `MAX_INLINE_IMAGE_BYTES = 1_250_000`

Reason for this design:

- user explicitly wanted images saved inside notes, not external URLs
- earlier full-resolution inline images could break note storage badly
- current compression is a compromise between quality and storage safety

Current image presentation:

- light border
- soft shadow
- small corner radius
- default width is 98%
- max width is effectively 100%
- min width ratio is 0.38

Image handle behavior:

- a handle is attached near the right edge of each image block
- horizontal drag resizes
- long press enters vertical move mode
- move mode shows a drag bubble and drop line
- image block temporarily vacates its original slot during move

This feature is implemented entirely inside the editor WebView DOM logic.

### Share and long image

Editor share menu supports:

- copy content
- generate long image

Long image flow:

- editor pushes to `/long-image-preview`
- preview screen builds the export HTML
- preview can switch light/dark theme
- preview can save to Photos using `expo-media-library`

Long image implementation files:

- `apps/mobile/app/long-image-preview.tsx`
- `apps/mobile/utils/long-image`

Current long-image design decisions:

- export is正文-only oriented, closer to Smartisan Notes style
- font should follow current app font selection
- typography was tuned to warm paper-like presentation

## 10. Sync implementation

### GitHub sync

Implementation file:

- `apps/mobile/services/github.ts`

Current behavior:

- token is persisted with SecureStore when available
- repo and branch metadata are stored separately
- token validation checks:
  - `/user`
  - repo existence
  - branch existence
- remote note content is stored in a GitHub repo structure
- folders and tombstones are also synced
- sync merges local and remote state and pushes updates back

Known user-facing gotchas:

- repo must be exactly `owner/repo`
- trailing spaces in repo value break validation
- branch must already exist

### WebDAV sync

Implementation file:

- `apps/mobile/services/webdav.ts`

Current behavior:

- username/password stored like GitHub credentials, with SecureStore usage
- sync writes a single remote JSON file
- config validation uses WebDAV requests and accepted statuses include 200/204/207

Important Jianguoyun-specific note:

- Jianguoyun should not use the WebDAV root directly
- user must create a subfolder such as `anote_sync`
- example server URL should be like:
  - `https://dav.jianguoyun.com/dav/anote_sync/`

This needs to stay clearly documented in the in-app WebDAV guide.

### Sync provider switching

Sync provider can be either:

- `github`
- `webdav`

Provider selection lives in NotesContext and is configurable in Settings.

## 11. Fonts

Font logic lives in `apps/mobile/contexts/FontContext.tsx`.

Current app font presets:

- `system`
- `sarasa_gothic` -> user-facing label "更纱黑体"
- `source_han_serif` -> user-facing label "思源宋体"
- `glow_sans` -> user-facing label "未来荧黑"

Important architectural choice:

- these fonts are no longer bundled into the APK
- they are downloaded on demand from GitHub Releases
- downloaded font files are stored under the app document directory
- the editor WebView receives matching `@font-face` CSS so editor typography also changes

Release source currently hardcoded in FontContext:

- `https://github.com/dnk4real/anote-app/releases/download/fonts-2026-03-10`

Current downloadable asset mapping:

- Sarasa:
  - `SarasaMonoSC-Regular.ttf`
  - `SarasaMonoSC-Bold.ttf`
- Source Han Serif:
  - `SourceHanSerifCN-Regular.otf`
  - `SourceHanSerifCN-Bold.otf`
- Glow Sans:
  - `GlowSansSC-Normal-Book.otf`
  - `GlowSansSC-Normal-ExtraBold.otf`

Important note:

- the code and naming were intentionally adjusted so "更纱黑体" really maps to Sarasa, not to system fallback
- editor font application had been broken before and was later fixed

## 12. Localization

Localization is in `apps/mobile/contexts/LocalizationContext.tsx`.

Current languages:

- system
- English
- Chinese

This context provides:

- language preference
- effective app language
- translation helper `t()`

Recent wording choices that were explicitly requested:

- Chinese "All Notes" is currently translated as `全部`
- Chinese "Starred" is `收藏`
- editor "Add to Folder" is translated as "添加到文件夹"

This file is also where guide text, update check text, sync text, dialog text, and folder labels live.

## 13. Settings screen

Main file:

- `apps/mobile/app/(tabs)/settings.tsx`

Current capabilities:

- language picker
- font picker
- sync provider picker
- GitHub config form
- WebDAV config form
- sync now button
- sync guide entry
- check for latest release on GitHub
- open latest APK download link
- custom app dialogs instead of raw alerts

Design note:

- a lot of system-style alerts were replaced with the app's own visual style using `AppDialog`
- if new dialogs are added, try to use the same component and not raw `Alert.alert`

## 14. OTA and build config

Mobile config:

- file: `apps/mobile/app.json`
- Expo project owner: `dnk4real`
- EAS project id: `b4492a9b-3c48-45aa-9762-b62009f6a93c`
- app version: `1.1.0`
- runtimeVersion policy: `appVersion`
- updates URL already configured
- package name: `com.dnk4real.anoteapp`
- scheme: `anote`

Important implication:

- OTA is configured, but only works for compatible runtime versions
- bumping app version changes runtime version under the current policy

## 15. Splash and icon notes

There was a lot of confusion around Android splash behavior.

The key point:

- the white rounded rectangle seen on Android splash is not coming from the adaptive icon foreground image
- it comes from the Expo-generated splash logo background based on the `expo-splash-screen` plugin config

Current mobile splash config:

- light background color: `#ffffff`
- dark background color: `#000000`
- dark image is explicitly set too

Do not assume adaptive icon settings control the splash icon container appearance.

## 16. Desktop app structure

Desktop app root:

- `apps/desktop`

Important files:

- `src/App.tsx`
- `src/data.ts`
- `src/styles.css`
- `electron/main.cjs`
- `electron/preload.cjs`
- `package.json`

Current state:

- desktop UI is mock-data driven
- layout and visual language intentionally follow the mobile app's warm paper-inspired style
- renderer is React + Vite
- shell is Electron

Desktop commands:

- `npm run desktop:web`
- `npm run desktop:electron`
- `npm run desktop:build`
- `npm run desktop:preview`
- `npm run desktop:package:dir`
- `npm run desktop:package`

Verified output:

- `npm run desktop:build` works
- unpacked Windows app build works when rebuilt from the current config
- expected exe path:
  - `apps/desktop/artifacts-dir/win-unpacked/Anote.exe`

Important desktop packaging caveat:

- older unpacked builds could white-screen because Vite emitted `/assets/...` absolute paths that fail under Electron `file://` loading
- this was fixed by switching the desktop Vite build base to relative paths (`./`) in:
  - `apps/desktop/vite.config.ts`
  - `apps/desktop/vite.config.js`
- after pulling current code, rebuild the desktop app before trusting any previously generated `Anote.exe`
- unpacked directory build succeeds from the fixed config
- if `artifacts-dir` is locked, first suspect a still-running old `Anote.exe` holding files open
- NSIS installer build is still network-sensitive because electron-builder downloads extra NSIS resources from GitHub/CDN
- code-side packaging config is in place, but installer generation may fail if those external downloads time out

Desktop build choices made to avoid Windows pain:

- reuse local `node_modules/electron/dist` via `electronDist`
- disable `signAndEditExecutable` so packaging does not require the troublesome Windows code-signing helper path

## 17. Shared packages

### `packages/shared-types`

Current status:

- placeholder only
- contains only minimal sync-related types

### `packages/sync-core`

Current status:

- placeholder only
- returns an unimplemented sync client

These packages are not yet the real source of truth for app models or sync logic.

## 18. Known rough edges and warnings for the next agent

### A. Do not casually refactor `editor.tsx`

This file is over 2,000 lines and contains several hard-won fixes around:

- keyboard focus
- bridge caret
- first-input behavior
- enter/newline behavior
- auto-open keyboard for new notes
- image gestures
- undo/redo state sync
- empty note deletion timing

If a change touches this file, test:

- create new note
- keyboard auto-opens
- first character input
- first backspace
- first enter/newline
- hide keyboard
- tap back into editor
- insert image
- drag image horizontally and vertically
- leave editor with blank note

### B. The working tree is not clean

There are generated and legacy files around the repo, especially in desktop artifacts and some top-level leftover folders.

Do not do large destructive cleanup unless explicitly asked.

### C. Desktop mock data has mojibake

`apps/desktop/src/data.ts` contains some broken Chinese sample strings from encoding issues. This is not a production data problem, only placeholder mock content.

### D. Old desktop artifacts may be misleading

Previously generated desktop artifacts may not reflect the current code.

Important example:

- older packaged builds could white-screen because their renderer asset URLs were baked as `/assets/...`
- if a packaged `Anote.exe` opens as a blank white window, rebuild first before assuming the current Electron code is broken
- a locked `artifacts-dir` usually means a previously launched `Anote.exe` is still running

### E. Desktop installer build may fail even when code is correct

If `npm run desktop:package` fails, first suspect network/download issues for Electron Builder resources, not the renderer or Electron entry code.

### F. Root README is outdated

The root `README.md` is still minimal and does not explain the full current system.

## 19. Suggested next steps

If a new agent continues from here, the safest sequence is:

1. Keep mobile stable and avoid broad refactors.
2. If touching editor behavior, test the full "new blank note" keyboard flow before and after.
3. Move desktop from mock data to real shared data contracts.
4. Decide whether desktop should read the same synced note format directly or get its own local cache layer.
5. Promote real shared note types into `packages/shared-types`.
6. Move shared sync logic into `packages/sync-core` once both apps need it.
7. Clean repo root only after the app roots are fully stable.

## 20. Safe assumptions for a new agent

- Mobile is the source of truth today.
- Desktop is a prototype shell, not feature-complete.
- Sync correctness matters more than perfect elegance.
- User cares a lot about visual polish and interaction detail.
- User is sensitive to vague or incorrect technical explanations, especially on Android/Expo behavior.
- Do not write secrets into the repo.

## 21. Secrets and credentials

Do not commit any of the following:

- GitHub personal access token
- WebDAV username/password
- Expo credentials
- release signing credentials

Current sync config is designed to store secrets locally on device using SecureStore where available.

## 22. If something seems weird

Before assuming the code is broken, check whether the issue is actually one of these:

- stale generated desktop artifacts
- desktop artifacts generated before the relative-asset-path fix
- legacy root files being mistaken for active app roots
- WebView/editor bridge behavior
- external download failure during Electron Builder installer generation
- trailing spaces or invalid format in GitHub repo configuration
- WebDAV URL pointing to Jianguoyun root instead of a dedicated subfolder
