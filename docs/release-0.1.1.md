# Vibecraft 0.1.1

This Windows portable update addresses all eight confirmed findings in audit-2026-10-30.md. Existing project files and browser saves remain compatible; the package does not contain personal projects or browser data.

## Corrections

- Editor mutations now pass a central admission check before committing or adding undo history. Duplicate, paste, direct canvas creation, scene duplication, timing, labels, geometry and aggregate media limits preserve the last valid project when an edit would exceed supported bounds. Unchanged assets are not repeatedly decoded during pointer movement. Imported files still use full validation. Existing invalid saves remain downloadable through My projects; opening an invalid saved record is refused with an explanatory message.
- Edits preserve unchanged scene, audio and path identities. Scene thumbnails skip unrelated edits, image preparation is shared through a bounded cache, and concurrent font preparation is shared. Audio players are reconciled by track identity/source rather than rebuilt for each project mutation.
- Prepared vector geometry is cached by immutable paths and dimensions, with a bounded set of size variants per path array. Complete frames retain deterministic rendering.
- Scene fades composite the incoming complete frame once, avoiding flashes through overlapping opaque drawings.
- Preview, audio-panel playback and video export use the same effective fade durations after source trimming.
- AI generation reserves its busy slot before asynchronous status checks, releasing it on both success and failure.
- A running portable session must be stopped before changing its port. Its ownership record is preserved, including when its process is alive but temporarily unresponsive.

## Reproduced improvements

On the same test PC, the 25-scene/shared-image fixture changed from 26 image decode calls to 1. Renaming it changed from 26 canvas redraws to 1. Renaming a project with 50 audio tracks changed from 50 new audio players to 0.

The complex-vector fixture (25 elements, 40 paths per element, 100 line segments per path, 1920×1080) changed from a median 73.0 ms to approximately 1.6 ms in the CPU-only headless probe. This is a local CPU measurement, not a claim of interactive FPS on other hardware. The identical-scene fade midpoint now remains black rather than flashing RGB (64,64,64). Actual FFmpeg output and preview sample amplitudes agree within floating-point precision for the short-clip/overlong-fade fixture. The AI race fixture now produces one generation and rejects the concurrent request.

## Verification

The build and 41 unit/integration tests pass. Focused browser regressions cover invalid duplicate/paste/draw attempts, reopening the last valid save, resource reuse and fade pixels. Existing editor, usability, landing and camera workflows are rerun, along with actual MP4/WebM/GIF frame/audio comparisons, cleanup and cancellation. The final portable ZIP is separately extracted and verified, including start/reuse/refused-port-change/stop behavior, editing, save/download, voices and real exports. Detailed generated reports remain under artifacts/.

The update preserves previous release archives. Development packaging/extraction artifacts and completed video output are not automatically deleted; cleanup of existing personal files was outside the requested fixes.

## Installation

Stop the old studio with its Stop-Vibecraft.cmd. Extract the new ZIP into a new writable folder and run Start-Vibecraft.cmd. Keep using the same browser and localhost port for existing browser saves. Before switching PCs, browsers or ports, export each story as a .vibecraft file using Ctrl+Shift+S and import it through My projects on the receiving PC. Do not copy an old .runtime directory into the new package.
