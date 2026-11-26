<div align="center">
  <img src="https://github.com/user-attachments/assets/7fc99343-a9d7-4e14-b2c8-67dd20eea33f" width="160" alt="Calidraw App Icon" />
  <h1>Calidraw</h1>
  <p><strong>An Android whiteboard built on Excalidraw, with workspaces, offline storage and real-time collaboration.</strong></p>
</div>
Calidraw wraps the [Excalidraw](https://excalidraw.com) editor in a native Kotlin Android app. The editor runs inside a `WebView` from bundled local assets, and a small JavaScript bridge gives it access to Android file storage, the Downloads folder and the system browser.
 
> This is an unofficial Android port and is not affiliated with Excalidraw.
 
---
 
## Features
 
- **Full Excalidraw editor:** shapes, freehand, arrows, text, libraries, image export and dark mode.
- **Workspaces:** create named workspaces on launch and pick them again later. Each workspace is a folder of drawings.
- **Drawing Explorer:** create, open, rename and delete drawings from a file-explorer-style panel inside the editor.
- **Auto-save:** changes are saved about 0.8 s after you stop drawing, and again when the app goes to the background or you switch drawings. Writes are atomic (temp file, then rename).
- **Real-time collaboration:** share an encrypted room link and draw together using a Socket.IO room server. Room IDs and encryption keys are generated on the device.
- **Import and export:** open `.excalidraw` files through the Android file picker. Export drawings and images straight to `Downloads/`.
- **Offline-first:** everything is bundled in the APK. Only collaboration needs a network connection.
## Download
 
1. Open the [Releases](https://github.com/Anxhul10/calidraw-apk/releases) page and download the latest `.apk`. The current version is **1.1.0** ([release](https://github.com/Anxhul10/calidraw-apk/releases/tag/1.1.0)).
2. Open it on your device and allow installation from unknown sources if prompted.
3. Install and launch Calidraw.
**Requirements:** Android 13 (API 33) or newer.
 
---
 
## How it works
 
```
┌──────────────────────────── Android app (Kotlin + Jetpack Compose) ───────────────────────────┐
│                                                                                                │
│  MainActivity ──► WorkspaceScreen (Compose)        pick / create a workspace                   │
│       │                                                                                        │
│       └──► WebView  ◄── WebViewAssetLoader ── assets/web-build/  (bundled React + Excalidraw)  │
│                │                                                                               │
│                └── window.Android  ◄──► FileBridge.kt   files, Downloads, external URLs        │
│                                                                                                │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
                                         │  (collaboration only)
                                         ▼
                          Socket.IO room server  (excalidraw-room)
```
 
1. **Workspace screen.** A Compose screen where the user creates or chooses a workspace. Workspace names are kept in `SharedPreferences` (`workspace_prefs`).
2. **WebView host.** `MainActivity` loads `https://appassets.androidplatform.net/assets/web-build/index.html` through `WebViewAssetLoader`, so the web app runs from local assets with a proper origin. This also keeps the Web Crypto API available for collaboration.
3. **JS bridge.** `FileBridge` is exposed to the page as `window.Android`. The web app's storage layer (`web/src/storage.js`) uses it when present and falls back to `localStorage` when running in a normal browser, so the web app can be developed without a device.
4. **Collaboration.** `CollaborationController` connects over Socket.IO and syncs scene updates and cursors. Messages are encrypted with a key that lives only in the room link's `#room=<id>,<key>` fragment, so the server cannot read drawings.
### Storage layout
 
Drawings are plain Excalidraw JSON files in the app's private storage:
 
```
<app files dir>/workspaces/<workspace name>/<drawing name>.excalidraw
```
 
Names are sanitised (anything other than letters, digits, `_`, `.`, `-` and space becomes `_`).
 
### JavaScript bridge API (`window.Android`)
 
| Method | Purpose |
|---|---|
| `getWorkspaceName()` | Name of the active workspace |
| `listFiles()` | JSON array of drawing names in the workspace |
| `createFile(name)` | Create an empty drawing, returns `false` if it already exists |
| `readFile(name)` / `writeFile(name, json)` | Read or atomically write a drawing |
| `renameFile(old, new)` / `deleteFile(name)` | Rename or delete a drawing |
| `saveFile(name, mimeType, base64)` | Save an export to `Downloads/` via `MediaStore` |
| `openExternalUrl(url)` | Open a link in the device browser |
 
---
 
## Tech stack
 
| Layer | Technology |
|---|---|
| Android app | Kotlin 2.2, Jetpack Compose (Material 3), AndroidX WebKit, Core SplashScreen |
| Build | Gradle (Kotlin DSL), Android Gradle Plugin 9.4, version catalog (`gradle/libs.versions.toml`) |
| Web app | React 19, Vite, [`@excalidraw/excalidraw`](https://www.npmjs.com/package/@excalidraw/excalidraw) 0.18 |
| Collaboration | `socket.io-client`, Web Crypto (AES key in the room link), `excalidraw-room` server |
| Tooling | Dependabot (Gradle and npm), issue labeler, GitHub Actions |
 
SDK levels: `minSdk 33`, `targetSdk 37`, `compileSdk 37`. App ID: `com.anxhul10.calidraw`.
 
---
 
## Project structure
 
```
calidraw-apk/
├── app/                              Android application module
│   └── src/main/
│       ├── java/com/anxhul10/calidraw/
│       │   ├── MainActivity.kt           WebView host, file chooser, asset loader
│       │   ├── utils/FileBridge.kt       JS ↔ Android bridge (files, Downloads, URLs)
│       │   └── workspace/WorkspaceScreen.kt   Compose workspace picker
│       ├── assets/web-build/             Built web app (output of `vite build`)
│       └── res/                          Icons, themes (day/night), splash screen
├── web/                              React + Vite source for the editor UI
│   ├── src/
│   │   ├── App.jsx                       Explorer + editor shell, touch fixes for WebView
│   │   ├── components/DrawingEditor.jsx  Excalidraw instance, debounced auto-save
│   │   ├── components/Explorer.jsx       Drawing explorer panel
│   │   ├── storage.js                    Android bridge or localStorage backend
│   │   └── collab/                       Room links, crypto, Socket.IO controller
│   └── server/excalidraw-room            Collaboration server (git submodule)
├── gradle/                           Version catalog and wrapper
└── .github/                          CI, Dependabot, issue labeler
```
 
---
 
## Build from source
 
### Android app
 
Prerequisites: Android Studio (recent stable) with the Android 37 SDK. The Gradle daemon toolchain is JDK 25, which Gradle can download automatically.
 
```bash
git clone https://github.com/Anxhul10/calidraw-apk.git
cd calidraw-apk
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```
 
Or open the project in Android Studio and press **Run**.
 
### Web app
 
The Android app loads the prebuilt web app from `app/src/main/assets/web-build/`. To change the editor UI:
 
```bash
cd web
yarn install
yarn dev            # run in a normal browser, storage falls back to localStorage
yarn build          # production build into web/dist
```
 
Then copy the contents of `web/dist/` into `app/src/main/assets/web-build/` and rebuild the APK. (Vite is configured with `base: "./"` so the build works from local assets.)
 
### Collaboration server (optional, for local testing)
 
Collaboration needs a room server. By default the app uses the hosted server at `https://calidraw-room.onrender.com`. To run your own:
 
```bash
git submodule update --init web/server/excalidraw-room
cd web
yarn dev:collab-server        # starts the room server on http://localhost:3002
```
 
Configure the web app with `web/.env` (see `web/.env.example`):
 
| Variable | Meaning |
|---|---|
| `VITE_COLLAB_SERVER_URL` | URL of the Socket.IO room server (`http://localhost:3002` for local use) |
| `VITE_APP_PUBLIC_URL` | Public URL used to build shareable room links |
 
---
 
## Roadmap
 
- [ ] **AI-assisted diagram analysis (planned):** select part of a drawing, ask a question, and send the selected elements (structured Excalidraw JSON plus optional image) to an LLM for feedback on structure, missing steps and logic.
- [ ] Image support inside collaboration rooms
- [ ] Migrate the file chooser to the Activity Result API
## Contributing
 
Bug reports, feature ideas and pull requests are welcome. Open an [issue](https://github.com/Anxhul10/calidraw-apk/issues) or a PR. Commit and PR titles starting with `feat:`, `bug:`, `chore:` or `refactor:` are labeled automatically.
 
## Acknowledgements and references
 
- [Excalidraw](https://github.com/excalidraw/excalidraw) and its [API docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/)
- [Android `WebViewCompat`](https://developer.android.com/reference/androidx/webkit/WebViewCompat)
- [Load local content in a WebView](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)
- [Android WebView documentation](https://developer.android.com/develop/ui/views/layout/webapps/webview)
- [WebViewBridgeDemo](https://github.com/RandhirGupta/WebViewBridgeDemo)
- [Next-level Android WebView](https://github.com/abdelaliichou/Next-level-android-webview)
