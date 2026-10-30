# Vibecraft

A local whiteboard animation studio and a responsive dark landing page for content creators. The main action opens the editor without signup or payment.

Public source repository: [adib-cyber007/Vibecraft](https://github.com/adib-cyber007/Vibecraft).

Version 0.1.1 fixes invalid autosaves, repeated media work, vector preparation costs, scene/audio fades, concurrent AI requests and portable port ownership. See [release notes and measurements](docs/release-0.1.1.md).

## Share with another PC

The Windows x64 portable ZIP contains the built app, Node, the rendering browser, FFmpeg/FFprobe, production dependencies, source and runtime notices. Copy it to a Windows 10/11 64-bit computer, extract the entire ZIP into a writable folder, and double-click Start-Vibecraft.cmd. No developer tools, installation or internet connection are needed for editing and video export. Stop-Vibecraft.cmd closes only the session started from that folder. Check-Vibecraft.cmd checks the bundled runtimes.

To transfer saved stories, download each as an editable .vibecraft file with Ctrl+Shift+S on the original PC. On the receiving PC, open My projects and import the file. Embedded media/fonts travel with the file. Browser saves and personal files are excluded from the app package. Installed narration voices can differ on the receiving PC, and optional Ollama still needs its own installation/model.

To build a package on this Windows x64 development PC, run npm run package:windows after npm ci. The packaging script verifies Node against its official release checksum, copies the installed documented runtimes, retains notices, includes only allow-listed project source and production dependencies, and writes a fresh ZIP, SHA-256 checksum and file manifest under artifacts/releases/. See [packaging and verification](docs/portable-package.md) and the included START-HERE.txt.

## Open it

Double-click Start-Vibecraft.cmd, or run:

    npm ci
    npm run build
    npm start

- Landing page: http://127.0.0.1:4310/
- Editor: http://127.0.0.1:4310/studio
- Development server: npm run dev

Requires Node.js 24.11+ within the 24.x line, or Node 26+, FFmpeg/FFprobe on PATH for video export, and Chromium/Chrome/Edge/Brave for local rendering. Node 24.20.0 is the tested runtime pinned in .nvmrc. The server binds only to this computer. The launcher reuses an existing healthy local studio and opens the landing page.

## Environment setup

After npm ci, run npm run check:environment. It checks the Node runtime, FFmpeg, FFprobe and browser availability without installing anything. It also reports installed Windows narration voices and optional local Ollama models. Missing optional voices or Ollama do not prevent normal editing or audio import.

Browser resolution is shared by exports, REA capture and browser tests. It checks VIBECRAFT_BROWSER_EXECUTABLE first, then the installed Playwright browser, existing Playwright caches and known system browser locations. An invalid explicit override fails with an actionable error rather than silently launching a different browser.

If no browser is available, use an existing Chromium-family executable through VIBECRAFT_BROWSER_EXECUTABLE, or explicitly install the matching test browser with npx playwright install chromium. No browser or system package is downloaded automatically by the app.

On another Windows computer, add FFmpeg's bin folder to PATH before launching the studio. macOS/Linux can use their installed FFmpeg and a supported browser, but Windows voice generation is Windows-only and the complete application workflow has so far been verified on Windows. Other hosts still need their own end-to-end validation.

## Create a story

The getting-started guide walks through adding content, setting animation and previewing. It can be dismissed and restored from Help. New users start with the Simple timeline; switch to Advanced for precise timing. Double-click text on the canvas to edit it directly in properties.

Start from one of three original editable templates or create a blank landscape, square or portrait project. Add drawings, text, shapes, images or a bar chart. Drag to arrange, drag handles to resize/rotate, Shift-select multiple elements and use the properties panel to align them.

The timeline supports seeking, dragging animation start times and resizing entrance/hold/exit stages. Change drawing hands, pen styles, skin tones, entrances, emphasis and exits in Animation properties. Scenes live in the left navigator: add, duplicate, delete, drag to reorder, or focus a scene and press Alt + Up/Down. Scene transitions support cut/fade/pan; roaming mode retains earlier drawings in world space.

Open Camera to add independent views with position, size, zoom, start, duration, pause and motion easing. Lock a view to protect its geometry; pin it to retain its outline. The starting view stays at 0s. Advanced timeline markers seek to each move. Camera playback and exports use the same sampler, and existing single-camera projects remain compatible.

Import SVG, PNG, JPEG, WebP and GIF files. Supported SVG paths and primitives retain drawing geometry and paint. Safe unsupported SVG appearance uses an image reveal. Imported GIFs currently use a still frame. Custom TTF, OTF, WOFF and WOFF2 fonts can be embedded into projects.

Add imported audio, record microphone narration, generate narration with an installed Windows voice, or add the original procedural soundtrack. Audio tracks support project/scene scope, start time, source trimming, splitting, volume and fades. Optional AI storyboard generation uses an installed local Ollama text model. No hosted AI or image generation service is bundled.

Preview and export share the same deterministic drawing renderer. Export MP4, WebM or GIF, with progress and cancellation; MP4/WebM mix project and scene audio. The export dialog retains the current job across closing/reopening in the same browser session.

## Keep your work

Projects autosave to IndexedDB in this browser on this computer. Export an editable .vibecraft file for backup, transfer or recovery. Uploaded media and custom fonts are embedded. Clearing browser storage removes local saves.

The editor keeps up to 70 undo states. Ctrl+S saves locally; Ctrl+Shift+S downloads a project. Help lists the keyboard shortcuts. Canvas PNG export is available from Help.

Local video output and diagnostic artifacts live under .runtime/ and artifacts/. They are ignored by Git. Completed export jobs are listed only while the local server is running; download the output you want to keep.

## Validation

    npm run build
    npm test
    npm run test:browser
    npm run test:landing
    npm run test:export
    npm run test:friendly
    npm run test:environment
    npm run test:fixes
    npm run test:portable

Browser scripts use isolated contexts. The editor and landing browser scripts expect the local server at port 4310; set VIBECRAFT_URL to change it. The render-export script starts its own temporary production server against dist/. Native processes, localhost listeners and Windows voices require their operating-system permissions.

See [verification evidence](docs/verification.md), [feature matrix](docs/videoscribe-feature-matrix.md), [REA investigation](docs/rea-investigation.md) and [remaining gaps](docs/implementation-status.md).

## Provenance and limits

The installed REA repository supplied the investigation workflow. Actual REA analysis captured VideoScribe's public login surface and official help-page demonstrations. The editor shell follows those observed references: charcoal panels, cyan controls, left scene navigation, a white canvas and right properties. See [editor environment and evidence](docs/editor-environment.md). Authenticated editor observation remains pending. This is an original implementation, not recovered VideoScribe source or a verified complete equivalent. No licensed VideoScribe artwork, hands, templates, music or hosted services are bundled.

The requested landing-page-design skill is installed at skills/landing-page-design/SKILL.md and preserved verbatim as Skill.md. Its source is [elayadesign/ai-design-skills](https://github.com/elayadesign/ai-design-skills). Landing choices and copy are recorded in docs/landing-page-plan.md. This build is local and marked noindex; it has not been publicly deployed.
