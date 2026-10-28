# Friendlier editor

The editor keeps the light drawing-workbench appearance, while the public landing page retains the user's dark premium direction. The design follows the documented VideoScribe pattern of asset tools, contextual properties, scenes and a simple/advanced timeline. The authenticated reference editor was not available; this is an independent usability improvement, not a verified pixel or usability equivalent.

## Changes

- Readable 14px inputs and primary controls, 12px desktop supporting labels, stronger contrast, larger click targets and clearer selected states.
- Explicit My projects action, labeled Simple/Advanced timeline choices and remembered timeline preference.
- A first-use three-step guide with working Add content, Set animation and Preview actions. It can be dismissed, stays dismissed on reload and can be restored from Help.
- A simple element storyboard by default. Advanced timing remains available with an entrance/hold/exit color legend and direct manipulation instructions.
- Double-clicking canvas text opens Style and focuses/selects the text field. Rotation, resize, keyboard and property editing remain available.
- A useful blank canvas with actual Add illustration and Add text actions.
- Canvas fit uses the work area's available width and height, preserving the project's aspect ratio even on short laptop windows. It no longer squeezes a landscape scene vertically to fit a smaller area.
- Larger library labels, clearer scene thumbnails, contextual help and mobile-accessible dismiss controls.

## Verification

- Eight focused browser checks pass: first visit, guide actions, text focus, guide dismissal/restoration, timeline persistence, desktop/laptop canvas geometry, blank-project actions and mobile layout.
- Existing 17 editor workflow checks pass, including timeline dragging, image/font imports, audio, persistence and mobile controls.
- Existing 20 model/validation/native integration checks pass.
- Reports and screenshots: artifacts/friendly-editor/report.json and artifacts/editor-browser/report.json.

No renderer, export or project-format changes were required. Existing media verification remains separately recorded in verification.md. Subjective ease of use still benefits from real creator feedback.
