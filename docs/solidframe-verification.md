# SolidFrame verification

Adapted source baseline: `03a6a542e841a7f1952f67aa729e0658a8096c08`.

Observed locally on 2026-09-23:

- Compatible `npm audit fix --ignore-scripts` updated the lockfile and reported zero remaining advisories (seven at baseline). This is the registry's advisory result, not a security audit of the application.
- Production Rspack app and bundled plugin builds passed. Size warnings remain for the real CAD runtime, font and visual-programming bundle; no engine was stubbed or removed to avoid them.
- A real OpenCascade-WASM regression creates all seven sample parts as solids with positive volume, serializes/restores their native nodes with matching volume, and verifies that changing the base plate width changes its solid volume as expected.
- Focused regressions verify that startup links never call plugin loaders, including `.chiliplugin` through model/file parameters; supported geometry links still work.
- The bundled-plugin deployment regression failed before the fix: query and fragment data were appended to the plugin directory. It now resolves within the deployment subpath without those fields.

- Final `npm test`: **6,128 tests passed across 376 files**, zero failures or skipped tests, Node.js 24.14.0/macOS. The first full run exposed six obsolete expectations for the replaced loading spinner; they were replaced by accessible status and failure-recovery checks, then the entire suite was rerun.
- The CAD workspace now starts with its optional AI panel closed. A regression confirms that the default Completions configuration has no endpoint, model, or credential and cannot start an agent until explicitly configured. Navigation retains its compatibility value while showing the SolidFrame label.
- Final `npm run build`: application and both bundled plugins built successfully; only asset-size warnings remain.
- Independent focused review: **105 tests passed across seven files**, including the native sample and startup/deployment paths. Review identified an upstream swallowed URL-loading error; a failing-before-fix regression now verifies error propagation and a visible recovery message.
- The changed-file Biome check completed with no errors; warnings and suggestions remain in the inherited stylesheet/test conventions. `git diff --check` passed.
- Final npm audit reported zero known advisories. The audit is time-sensitive and should be rerun before later releases.

Browser release QA confirmed that the seven-part fixture renders, its base plate width can be edited from 70 to 90 mm, and saving then reopening it from Recent projects after a page reload preserves the edit. The CAD workspace starts with the AI panel closed. Native file download/reimport and completed exchange-format downloads remain separate checks. Optional AI provider calls and user-supplied executable plugins are outside this verification.
