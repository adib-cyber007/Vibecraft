# Sharing Vibecraft with another PC

The portable package targets Windows 10/11 x64. Extract it completely into a writable folder. Start-Vibecraft.cmd uses its own Node executable to start the compiled production server and open the local landing page. Node, npm, Git, FFmpeg and browser installation are not required on the receiving machine. Windows voices and optional Ollama models remain machine-specific.

## Contents and build

Run npm run package:windows on the Windows x64 development computer. It first checks TypeScript and builds the frontend, then compiles the production server, copies its installed dependency closure, bundles the installed runtime files and writes an archive. A supported Node runtime, the documented Gyan FFmpeg distribution with its LICENSE/README and a Playwright Chromium distribution must be available when building. The Node binary must match the official release's SHA-256 checksum. The build can fetch Node's official checksum/license if they are not already cached.

- dist/: built landing page/editor, bundled fonts, original images and font notices.
- server/: compiled production server and Windows narration helper.
- node_modules/: the installed production server dependency closure, including package licenses.
- runtime/: Node, the rendering browser, FFmpeg and FFprobe. No personal browser profile.
- scripts/portable-launcher.mjs and Start/Stop/Check launchers.
- source/: allow-listed current source, documentation, package lock, tests and design skill.
- licenses/: runtime notices, Chromium credits, browser terms, FFmpeg configuration/source references and Node notices/checksum.
- package-manifest.json: build identity, runtime/package versions and SHA-256 for every included file.

Each build creates a new timestamped directory under artifacts/releases/. A sibling .sha256 file hashes the final ZIP. Existing builds are preserved. Development caches, Git internals, .env files, runtime state, downloaded videos, recordings, captures, saved projects, user browser profiles and credentials are excluded.

## Launch and stop behavior

The server listens only on 127.0.0.1. The launcher gives its child a random session identifier and stop token, stores ownership in .runtime/portable-session.json and checks the live session before reusing or stopping it. The token is never returned by health. Shutdown keeps localhost Origin/Host/content-type protections and requires the owning token. Normal source/development sessions do not expose the shutdown route.

Closing the browser does not stop the server or an export. Stop-Vibecraft.cmd closes the owned server and its export resources. A port occupied by another app/session produces an actionable error. Use Start-Vibecraft.cmd --port 4311 when necessary; browser saves are specific to the chosen port. No process-name kills or machine-wide environment changes are used.

## Transfer stories

On the original PC, open each project and use Ctrl+Shift+S to download a .vibecraft file. On the receiving PC, choose My projects and open it. The project contains its embedded images, audio and custom fonts. Copying the application ZIP alone does not copy IndexedDB saves. Export and keep project files as backups, especially before changing browsers, ports or PCs.

## Validation boundaries

Packaging validation extracts the actual ZIP to a different path containing spaces, verifies its file hashes, starts it with a minimal PATH and isolated browser-cache locations, and exercises the built application and exports. It verifies that the archive uses its own runtime files rather than the developer installation. This is same-PC relocation testing; a separate physical PC and different CPU/GPU/Windows configuration still need receiving-machine validation.
