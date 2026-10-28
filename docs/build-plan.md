# Vibecraft build plan

Target confirmed by the user: current VideoScribe at https://www.videoscribe.co/. Reviewed 26 October 2026. The local project is an independent implementation with original artwork.

## Investigation

Use the existing REA checkout at `C:/Users/moham/Documents/Codex/2026-10-13/is-using-reverse-engineering-anything-repository/work/rea`, commit `1b6c899b031421dcf2d725a63e67d99375028d6e`, and its matching 6.4.0 runtime. The checkout contains source and workflow instructions but no compiled runtime or dependencies. Keep acquired runtime packages inside this workspace. Inspect the publicly delivered app and preserve complete REA evidence, scope, and limitations. Authenticated editor operations remain unknown unless accessible in an authorized session.

## Product and design

A focused animation workbench: an ink-green toolbar, pale blue-gray editing surface, white paper stage, narrow asset rail, right properties panel, and a stage-colored multitrack timeline. Palette: forest #246451, deep ink #25364a, paper #ffffff, worktop #edf1f4, line #d8e0e5, highlight #f1ba55. Manrope for application controls, DM Sans for readable story text, and Kalam for drawn notes. The stage is the visual focus; chrome stays quiet. The first project is a complete editable original three-scene explainer.

## Implementation order

1. Versioned editable project model; deterministic timeline and drawing renderer; original vector library.
2. Local project browser, templates, canvas selection and transforms, inspector, layer ordering, scenes, camera controls, timeline and keyboard editing.
3. Safe image, SVG, font and audio imports; microphone narration; trim/split/fades; local speech synthesis; optional real local AI script provider.
4. Shared renderer for preview and deterministic MP4/WebM/GIF exports with mixed audio, progress and cancellation; portable projects and local autosave.
5. Type check, meaningful model/validation tests, browser editing and persistence checks, actual media exports inspected with FFprobe and sampled frames. Record gaps against `videoscribe-feature-matrix.md`.

## Evidence required

Document the difference between public feature documentation, REA observations, independently implemented choices, browser-tested behavior and physically unverified microphone/subjective quality. Do not call a finite original vector collection a replacement for a licensed multi-million-item library. Hosted accounts, shared preview links, cloud sync, commercial templates and AI image/voice services require their own implementations or providers. Quality parity requires comparative reference projects and cannot be assumed from a successful build.
