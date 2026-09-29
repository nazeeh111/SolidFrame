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

## Browser storage commit handling (2026-09-27)

Save and delete now wait for the IndexedDB transaction's `complete` event. A successful request can still be followed by a transaction abort; an aborted transaction rejects the operation instead of reporting success. Six new regressions failed on the prior implementation and passed after the change. A save-command regression confirms that a rejected save does not publish the saved toast.

The local full suite passed 6,135 tests across 376 files with no skipped tests on Node.js 24.14.0/macOS. Four additional request-error and synchronous-exception cases then passed in the focused 27-test storage suite. The production application and both bundled plugins built successfully; bundle-size warnings remain. The storage fixture separates request success from transaction completion and abort; it does not simulate browser isolation or rollback. This change does not combine the document and Recent-project entry into one transaction or make browser storage a backup.

Reference: [IndexedDB transaction completion](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event).

## Modeling controls (2026-09-29)

The ribbon retains its commands and compact height, with softer tool surfaces, clearer group labels, and copper hover, focus and selected feedback in both themes. Existing push buttons now expose button semantics and activate with Enter or Space. Held keys do not repeat command dispatch; disabled controls reject pointer and keyboard activation. Split buttons and dropdown command behavior are unchanged.

The focused ribbon, dropdown and viewport checks passed **54 tests across six files**. The three new activation and disabled tests failed before implementation. Production application and bundled-plugin builds passed with the existing three bundle-size warnings. `npm run check` passed without applying fixes; inherited warnings and suggestions remain. `git diff --check` passed.

Actual browser checks created a box, selected and edited the fixture base from 100 to 110 mm, launched Move using Enter and completed a two-point transform. Save reported success; a page reload and Recent-project reopen retained the new box, edited length and transform. The primitive dropdown opened and closed with Escape; the End snap checkbox switched off and on. Both themes were inspected in the running workspace. These checks cover the exercised controls and local-project workflow, not every CAD operation or exchange format.
