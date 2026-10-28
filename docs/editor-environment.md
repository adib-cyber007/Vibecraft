# Editor environment and visual reference

Updated 28 October 2026. The editor has been rebuilt around the layout visible in official VideoScribe help demonstrations. The landing page retains the previously selected dark premium design.

## Evidence

REA 6.4.0 captured these official public pages and screenshots through an owned Chromium instance. The embedded editor images and timeline animations supplied visual references. They are documentation demonstrations, not observations inside a signed-in account.

| Source | Observed details | Implemented locally |
| --- | --- | --- |
| [Finding images](https://help.videoscribe.co/knowledge/finding-images-in-our-library) | Charcoal tool rail and panels, cyan selection, white thumbnail tiles, Image library / Your files / Recently used | Matching panel structure and colors, working tabs, local original artwork and recent-item history |
| [Timeline](https://help.videoscribe.co/knowledge/using-the-timeline) | Vertical scene navigation, compact transport, simple and advanced editing surfaces | Scene thumbnails at left, drag and keyboard reorder, simple cards, advanced timing bars, camera markers |
| [Cameras](https://help.videoscribe.co/knowledge/controlling-cameras) | Independent camera views, time, duration, pause, size and position, easing, locking and pinning | Portable camera keyframes, shared playback/export sampling, geometry/timing controls, lock, pin outlines, duplicate/delete |

The original page/screenshot records, image references and hashes are retained locally in artifacts/reference-20261028/rea-ledger.json. Captured proprietary media and page bundles are ignored by Git and are not application assets.

| REA passive page record | Evidence ID | SHA-256 of complete local record |
| --- | --- | --- |
| Image library | ev_6906c29828f447946a97016de52e927bedade343273c6ec831e2b5aa34fafd40 | 56ace400126837ab8d1ba6ef9ed7234c94afac9e0ae630ed0f88aa073401ba3a |
| Timeline | ev_d464d4eb395caa66e8171a73ea1971a98dfd03b6c60b5a9f0e91a18feff958df | 71f20ed2b5b6d09496a9aa1f90236c9b23e300a89639621fdaac3119aef8d2e9 |
| Cameras | ev_c373aee32f383dcc972313b92bdec81b0be50df44f195931c152c56ce5916ca6 | 3dc8320b90a6bcdf93f3e9ee756826aa8b9a111d2367717cb63039db9c56a78c |

Run node scripts/capture-editor-reference.mjs to repeat public-document capture with the installed REA CLI. It uses a fresh browser, loopback debugging port 9334 and artifacts/editor-reference/. It closes its owned browser and does not read a personal profile. The page can change, so repeated evidence hashes are not expected to match.

## Camera behavior

Version 1 projects can optionally carry scene.cameras. Existing projects without it keep their original scene.camera behavior. The first camera remains at time zero; subsequent destinations have absolute scene-local start, duration, pause and none/linear/ease-out motion. A move that interrupts another begins from its current interpolated view. Camera time extends scene duration and following scene/audio offsets.

Selecting a camera shows its destination for editing. Preview samples the animated path. Pin keeps an outline visible while editing; lock disables geometry changes. The Advanced timeline exposes each camera's time. Drawings retain explicit timing; a camera pause does not automatically shift drawings. Duplicating a scene regenerates camera identities. Saving, importing and exporting retain keyframes.

## Environment reproduction

The repository contains the application source, package lock, tested Node version, shared browser discovery, read-only environment diagnostics and Windows launcher. See README.md for setup. Node, browsers, FFmpeg, installed voices and optional Ollama remain external runtimes rather than copied binaries. No accounts, cookies or credentials are uploaded.

## Coverage boundary

The public editor demonstrations are smaller than the local desktop viewport. The implementation follows their visual structure and colors while preserving readable controls and first-use guidance. It does not establish pixel identity across all screens. The current VideoScribe tab still requires login; menus, services, asset collections and output quality behind that boundary remain unverified. See implementation-status.md for the feature ledger.
