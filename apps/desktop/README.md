# Desktop App

Desktop client shell for Anote.

Current state:
- React + Vite renderer for the desktop-first UI
- Electron shell for running the app as a native desktop window
- Windows packaging via `electron-builder`

Useful commands:
- `npm run dev:web`: open the UI in a browser
- `npm run dev:electron`: run the UI inside Electron during development
- `npm run build:web`: build the renderer into `dist`
- `npm run package:win`: build a Windows installer into `artifacts-win`
- `npm run package:dir`: build an unpacked app into `artifacts-dir`

Planned direction:
- reuse sync logic from `packages/sync-core`
- reuse shared data contracts from `packages/shared-types`
- replace mock data with live note storage and sync adapters
