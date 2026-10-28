# Verification record

Latest full verification: 28 October 2026, after the reference editor shell, portable runtime discovery and multi-camera integration. Build passed; 34 unit/integration tests, 17 editor browser checks, 16 landing checks, 8 usability checks and 9 reference-environment/camera checks passed with zero failures. Detailed local reports remain under artifacts/ and are ignored by Git.

Real production-renderer MP4, WebM and GIF exports passed again with camera keyframes in the fixture. Decoded media frames match preview within codec tolerance; audio timing/gain, failure cleanup, cancellation and resource release passed. The environment check confirmed Node 24.20.0, FFmpeg/FFprobe 9.0, an existing Chromium cache and two installed Windows voices. Optional Ollama was offline. Browser launch paths no longer contain a fixed username or Chromium revision.

The nine environment checks cover charcoal/cyan shell structure, visible-card drag and keyboard scene reorder, real image-source tabs, camera geometry/timing, protected starting view, lock/pin outlines, camera duplicate/delete, exact stage pixels against the shared animated renderer, new camera identities on duplicated scenes, download and reload. See editor-environment.md for the REA reference scope.

The earlier 26 October evidence below records the original renderer validation in detail. The latest actual run data, asset hashes, stream metadata and frame comparison metrics are retained in artifacts/renderer-export/report.json.

## Checks completed

- `tsc --noEmit` passed.
- npm test passed: 20 tests, 0 failures, including real installed Windows voice synthesis, localhost API protection, the synthetic-frame encoder plumbing test and actual-browser SVG geometry/pixel checks.
- Production build passed with TypeScript checking.
- Editor browser regression passed 17/17 with zero page errors. It covers arrangement, resizing, undo/redo, multi-selection alignment, strict timeline drag distances, scenes, SVG geometry import/progressive drawing, malicious SVG rejection, embedded fonts, audio editing, portable save/open/reload and mobile controls. Complete report: artifacts/editor-browser/report.json.
- Landing browser regression passed 16/16 with zero page errors or failed requests. It covers live renderer output and pause/resume, actual product screenshot, FAQ, editor CTA, anchor navigation, mobile focus/Escape behavior, reduced motion, privacy/terms/404 and viewport/text overflow at 390/768/1440 pixels. Complete report: artifacts/landing-browser/report.json.
- `tsx tests/render-export.ts` passed against the actual production `dist` renderer. This standalone test starts and closes an owned localhost server and Chromium instance, calls the application's real `window.vibecraftRender` bridge and downloads finished files through the public local API.
- The actual render fixture contains two scenes over four seconds: original path drawings, animated multiline text, an embedded WOFF2 font, an imported SVG, an imported PNG, drawing hands, camera pan, a separate fade-transition variant and two generated known PCM audio signals. The test does not replace the renderer with a synthetic canvas bridge.

## Actual exported media

| File under `artifacts/renderer-export/` | Video | Audio | Decoded video frames | Duration |
| --- | --- | --- | --- | --- |
| `actual-renderer.mp4` | H264, 1920 × 1080, 24 fps | AAC, 48 kHz, mono | 96 | 4.000 s |
| `actual-renderer.gif` | GIF, 854 × 480 | None, as expected | 96 | 4.000 s |
| `actual-renderer.webm` | VP9, 854 × 480, 24 fps | Opus, 48 kHz, mono | 96 | 4.008 s |

All three files were retrieved successfully from `/api/exports/:id/file`, then inspected with the installed FFprobe. Representative decoded PNGs and the portable project fixtures are retained beside the report.

The MP4 was approximately 253 kB, the GIF 2.03 MB and the WebM 126 kB for this fixture. These are observed sample sizes, not general file-size or performance guarantees.

## Preview and export consistency

The renderer returned byte-identical PNGs when sampling the same project at the same time. Frames sampled during partial drawing and after completion differed visibly, confirming drawing progression rather than a static video.

Decoded MP4 frames 6, 36, 52 and 84 were compared pixel by pixel with the actual application's PNG preview at the corresponding deterministic frame times. Mean absolute RGB channel error ranged from 0.085 to 0.813 on a 0–255 scale; PSNR ranged from 44.99 to 49.75 dB. These differences include H264 compression and RGB/YUV420 conversion.

A GIF frame during the scene fade transition scored 37.14 dB PSNR, with mean RGB error 2.30, reflecting palette quantization. A decoded WebM frame scored 41.59 dB, with mean RGB error 0.98. The test uses explicit tolerances rather than claiming lossless equality for compressed media.

`mp4-frame-1.png` was also inspected visually: the title, original bulb drawing, subtitle and imported check-mark SVG were legible and placed coherently in the output frame.

## Measured audio behavior

The fixture's first tone is 330 Hz with amplitude 0.25, gain 0.4 and absolute start at 0.25 seconds. It uses source trim 0.2–1.7 seconds and 0.15-second fades. The second tone is 880 Hz, amplitude 0.25, gain 0.5, assigned to scene two with a scene-relative start of 0.4 seconds, giving an absolute start of 2.4 seconds. Its source trim is 0.3–1.5 seconds, with 0.1-second fade-in and 0.2-second fade-out.

Decoded MP4 audio showed:

- RMS exactly zero in the tested pre-start, between-track and post-trim windows.
- Correct 330 Hz tone in the first track's active window, with measured amplitude 0.09997 versus expected 0.1.
- Correct 880 Hz tone in the scene-local active window, with measured amplitude 0.12495 versus expected 0.125.
- Both fade-in and fade-out sample windows below half the corresponding sustained RMS level.
- No unintended gain normalization; the limiter's automatic level boost is disabled.

These measurements verify source trims, absolute and scene-local offsets, gain and fades for the fixture. They are stronger than a check that an audio stream merely exists, but do not establish subjective voice quality or real microphone compatibility.

## Failure and cancellation behavior

An embedded PNG data URL containing undecodable bytes was admitted as a structurally valid project, then failed during image preparation with an explicit decoding error. Its file endpoint returned 404. This verifies a real render failure without a misleading completed download.

A longer export was cancelled after it began feeding frames. A simultaneous export request returned HTTP 409. Cancellation produced `cancelled`, released the active slot, removed any partial output and left no downloadable file. Completed status now becomes visible only after owned browser/audio cleanup and active-slot release.

The test suite also covers unsafe SVG scripts/foreign objects/external references, duplicate identities, missing scene references, nonfinite geometry, duration admission, Origin/Host/content-type checks and resolution limits.

## Fixes established by these checks

- Explicitly allow downloading manager-selected export files inside `.runtime`; Express otherwise treats the owned dot-directory as hidden and returns 404.
- Regenerate audio timestamps from emitted sample counts after applying delay so mixed tracks retain their intended positions.
- Disable limiter automatic gain to preserve user volume settings.
- Set WebM to supported YUV420 pixel format.
- Generate GIF palettes per frame to keep the PNG input streaming rather than holding all frames for a whole-video palette.
- Expose completion after owned render resources are cleaned up and release the single-export slot.

## Limits of this evidence

This verifies the original local implementation. The authenticated VideoScribe editor was not available for direct reference testing, so this is not a claim of identical feature coverage, artwork, rendering algorithms or overall product quality. The [feature matrix](videoscribe-feature-matrix.md) and [REA report](rea-investigation.md) keep those boundaries explicit.

The four-second render fixture is not a maximum-duration or memory stress test. Camera pan and scene fade are sampled, but every animation combination and every supported image/font/audio encoding has not been exhaustively tested. Physical microphone input, subjective drawing-hand/voice quality, hosted services and optional local-model generation require separate evidence.

Any later modification to renderer, font loading, project schema, audio/export pipeline or rebuilt production assets requires rerunning the affected checks. Build success alone does not substitute for these end-to-end media checks.
