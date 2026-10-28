# REA investigation and evidence boundaries

Target identified by the user: [VideoScribe](https://www.videoscribe.co/). Investigation date: 26 October 2026. The app-building goal is an original local whiteboard animation editor. **The authenticated VideoScribe editor was not inspected, and these results do not establish complete feature or quality parity.**

## Method and scope

The existing REA repository was located at `C:\Users\moham\Documents\Codex\2026-10-13\is-using-reverse-engineering-anything-repository\work\rea`, revision `1b6c899b031421dcf2d725a63e67d99375028d6e`. Its investigation skill supplied the workflow. The local task uses the installed `rea-agents@6.4.0` CLI for actual analysis.

`scripts/inspect-videoscribe.mjs` launches an owned headless Chromium instance with a loopback CDP endpoint, navigates to `https://www.videoscribe.co/app/`, and runs the public REA commands `list-browser-targets`, `inspect-web-page` and `analyze-web-bundle`. The requested `/app/` address redirected to `https://www.videoscribe.co/login/`. Browser automation performed the navigation; REA passively observed the resulting page and statically analyzed its captured scripts. No login, signup, purchase, authenticated editor interaction or target code reuse was performed.

The initial full JSON, HTML and screenshot artifacts were retained under `artifacts/rea-videoscribe/pre-zod-override/` before the post-fix rerun. Current evidence is in `artifacts/rea-videoscribe/`. `public-page.html`, `public-page.png` and `page-summary.json` supplement the REA records; they are browser capture artifacts rather than independently generated REA Evidence.

## Current evidence ledger

| Operation | File | REA Evidence ID | SHA-256 of complete JSON file |
| --- | --- | --- | --- |
| Target discovery | `artifacts/rea-videoscribe/targets.json` | `ev_8c20a6156ed1ccc4d49b0fc2325e8436e7de3c3ec17ad0032e8db8f62d5b5f7e` | `9a0bfc6127720c828580fb36528a11eba7fd04fc6727eeb8760186202d50b2a2` |
| Passive page capture | `artifacts/rea-videoscribe/page-evidence.json` | `ev_8bec09d07123ecd882b12bf2d17ed688203f6070e44e42b6a02e0fd67bc4d67d` | `aee54c28dd57cbf99541e8d3e1f440b98d88db84b72f4aee5c706530167b5e3f` |
| Static captured-bundle analysis | `artifacts/rea-videoscribe/bundle-evidence.json` | `ev_c846d7730ac82a986da79145516c3db1f2df1a013323ddd449b3f305b9db326e` | `9810069f6a51dd8640a0015ac8cc2c2181797e60695adcdfb7664d3b1130c310` |

Current passive page capture started at `2026-10-26T10:43:52.761Z` and ended at `2026-10-26T10:43:54.217Z`, with `observation_ms: 1000`. Its provider is `rea-cdp-browser`, version `2`.

## Findings by evidence type

### Observed

- REA target discovery selected the public login page titled “Log in to your VideoScribe account.” The retained browser summary records email/password fields, Google login, forgotten-password and signup links. This establishes an authentication boundary, not editor functionality.
- The current captured-bundle analysis observed and analyzed 47 scripts, with 47 parsed scripts, zero parse failures, 47 chunk nodes and 208 static import edges. The 47 source artifact descriptors total 629,503 bytes. These figures describe captured public-page JavaScript only.
- Static analysis returned two route candidates and seven endpoint/call candidates. The route candidates are `/`; some endpoint candidates are generic library method/property strings rather than actual network endpoints. None establishes that an authenticated editor API was exercised.
- Source maps were not requested. No WebMCP declarations were reported in the captured set.
- An example retained source is `https://www.videoscribe.co/_astro/videoscribe-react-ui.DZwTeguZ.js`, 12,605 bytes, SHA-256 `1076eb925ab6c7a4797566c1203cf462ce2c2e93d8d72c57e916230d53482f24`. Its presence on the login page does not prove the editor renderer was captured.

### Inferred

REA returned a medium-confidence React vendor fingerprint based on its `react-runtime` detector. The source artifact SHA-256 for that inference is `20c8d46446b0a45b123d2de4b67a5031adfce9b555fd733b0de888b5c565552e`. The public-page use of React does not determine the authenticated editor's complete architecture or export pipeline.

The `_astro` URL layout and captured authentication-related imports suggest a separately bundled public site/login surface. This is an architectural inference, not a recovered implementation specification for the animation editor.

### Documented separately

The [feature matrix](videoscribe-feature-matrix.md) records current official help documentation for scenes, cameras, animation stages, timeline, assets, text, audio, AI tools and publishing. Those claims are explicitly documentation-derived. They are not promoted to runtime observations merely because a REA capture also exists.

The local project's scene model, renderer, timeline, save format, UI, asset collection and local export/server implementation are independent design choices. They can be tested for their own behavior, but tests of the replacement do not establish equivalence to an unobserved VideoScribe implementation.

## Coverage and unresolved questions

- Page capture reports `policy_filtered` completeness and attach-limited coverage. The observation excludes prior activity. Console text, JSON body shapes, WebSocket shapes, storage keys/fingerprints and script sources were not requested in the page capture; origin/scope filtering also excluded some resources.
- Bundle analysis reports `complete` for parsing its selected captured scripts. This does **not** mean complete product coverage. Its empty tool-generated `unknowns` array does not answer the larger product questions below.
- No executable artifact identity was available for the remote page. Browser host platform and architecture were not established by the provider; a user-agent string is not equivalent to observing host identity.
- Native project format, editor rendering algorithms, draw ordering, exact easing, camera semantics, font shaping, backend rendering, AI models/providers, account synchronization, asset licenses and authenticated service behavior remain unresolved.
- Proprietary illustration/hand/music catalogs and hosted services are independent content/service dependencies. Public-page script inspection cannot supply their rights, scale or operational quality.
- Full parity requires authorized authenticated observations or supplied app artifacts, representative reference projects/outputs, visual comparisons and explicit acceptance criteria. The current local build should be described as a working independent implementation with documented gaps.

## Preserved initial evidence

The initial run had 46 parsed scripts, zero failures and 208 import edges; the post-fix run had 47 scripts. A changing public-page capture is not a controlled application-version comparison, so the one-script difference is not attributed to the dependency override.

| Preserved file under `artifacts/rea-videoscribe/pre-zod-override/` | REA Evidence ID | SHA-256 |
| --- | --- | --- |
| `targets.json` | `ev_3884fdd9460bcd9c2bce14c7b602a80c9d04a9ecce8ed9ad17d033ecab41818a` | `72a64a38291631fb967898ceb3949810dc1e125af6b72cc9eab8f9a10736e266` |
| `page-evidence.json` | `ev_745de23755a1ebb385db13ed896fb9c596e711e341e6d7d253af6bebffac1787` | `e3a3fc01021d8157e792d898817c96b48ca8055c61d5068f2ca4c23b8ba69349` |
| `bundle-evidence.json` | `ev_6dfb4bedf2f78bb412c1ac1f4eb4d973bd2ad81471266e24045a766a54fd415d` | `55af6f1e64a8fd383744012272c8aa5aa1ee00c8f4d9c07106f7295681f64b7e` |

## Dependency advisory and bounded remediation

A fresh `npm audit --json` initially reported two high-severity package entries from one underlying advisory: [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), “Zod can exhaust memory while validating oversized constrained collections,” affecting Zod versions below `4.6.6`.

Dependency inspection found:

- The app's direct Zod was already `4.6.7`.
- Development tool `rea-agents@6.4.0` had a nested `zod@4.4.3`.
- Before remediation, `npm audit --omit=dev --json` reported zero production advisories. The affected route was the development analysis tool, not the app's project validator.
- npm offered no automatic fix. The authorized bounded change added `overrides.rea-agents.zod: "4.6.7"` and refreshed the lockfile with `npm install --ignore-scripts`; no REA version upgrade or unrelated package upgrade was requested.
- After the change, `npm ls zod --all` shows REA and the application resolving to `4.6.7`, and a fresh full `npm audit --json` reports zero known vulnerabilities.
- `node scripts/inspect-videoscribe.mjs` succeeded after the override, producing the current target discovery, page capture and static bundle Evidence above. This validates the used REA workflow with the override; it is not blanket verification of every REA capability.

The audit required authorized network access because sandbox DNS could not resolve the npm registry. The successful audit is a point-in-time advisory check, not a claim that dependencies are free of all defects.
