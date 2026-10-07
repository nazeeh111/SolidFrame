# SolidFrame

Browser CAD with editable solids, parametric sketches, and local project files.

SolidFrame is a CAD application developed and maintained by **Nazeeh Abdul-Hadi**. It brings solid modeling, parametric sketches, feature history, geometry exchange, and local document storage into a focused browser workspace. Nazeeh’s work includes an editable mechanical part builder, the project hub and workholding fixture, workspace styling, keyboard-accessible modeling controls, startup safeguards, and deployment improvements.

[Open SolidFrame](https://nazeeh111.github.io/SolidFrame/) · [Source and license](LICENSE)

## Design a drilled part

The mechanical part builder creates a rectangular mounting plate or a sharp right-angle bracket from dimensions in millimetres. Set the stock dimensions and centered round through-hole grids; brackets have separate horizontal and vertical flange layouts. The editor checks the complete configuration before rebuilding the native solid, including hole spacing, edge clearance and the inside corner of a bracket.

Edit the saved part through the dedicated part editor. Apply commits the configuration together, and undo/redo restores parameter changes. Invalid or cancelled edits keep the previous valid part. Native `.cd` documents retain the dimensions and hole layouts; STEP and STL exports contain geometry rather than the editable builder settings.

This workflow models ideal geometry. It does not calculate sheet-metal bend allowance, thread or fastener standards, structural strength, or fabrication approval. See [mechanical parts](docs/mechanical-parts.md) for the controls, supported ranges and verification.

## Start with real geometry

Choose **Open editable sample** on the home screen. The workholding fixture contains seven native, editable solids: a base plate, two jaws, a workpiece, two locator pins, and a reference boss. It is an illustrative CAD exercise, not a fabrication-approved fixture.

1. Select **01 · Base plate** in the model tree.
2. Change its width, depth, or height in Properties. The geometry is rebuilt by OpenCascade, not approximated by a display mesh.
3. Use the modeling ribbon to add a primitive, boolean operation, fillet, transform, or measurement. The Parametric tab provides constrained sketches and feature operations.
4. Use **Save** to retain the project in this browser. Use **Save to file** to download an editable `.cd` document.
5. Use **Export** for STEP, IGES, BREP, STL, OBJ, or PLY; import STEP, IGES, BREP, or STL through the existing file controls. Native `.cd` documents preserve the editing structure that exchange formats may discard.

The fixture's parts have independent dimensions; changing one part does not automatically constrain the others. The full sketch-constraint system remains available for your own parametric models.

## Run locally

Requires Node.js 22 or later and npm. The included WebAssembly binaries mean a C++ toolchain is not needed for the standard app build.

```sh
npm ci
npm run dev
```

Open the address printed by Rspack, normally `http://localhost:8080`.

```sh
npm run build
npm run preview
```

The production site is in `dist/`. Serve it through HTTP, rather than opening its HTML with `file://`. Asset URLs work at the origin root or a trailing-slash subpath such as `/SolidFrame/`. The compiled geometry binary is approximately **9.99 MiB**, plus a **571 KiB** sketch solver before HTTP compression and caching. JavaScript and bundled plugin assets add to the first-load size. The distribution also includes a CJK font asset of about 9.33 MiB; its presence in the bundle is not a measurement of a particular browser session’s network transfer. First startup may be slower on a mobile device or slow connection. A browser with WebAssembly and WebGL support is required.

## Local storage and privacy

- CAD calculations run in your browser. No cloud account is required.
- Save uses the `solidframe-db` browser database; preferences use `solidframe-config`. These are separate from upstream Chili3D data on the same origin. Existing upstream data is not deleted or migrated; open a downloaded `.cd` file to transfer a project.
- Browser storage is not a backup. Clearing site data or using private browsing may remove saved projects; another device/browser/origin does not share them. Keep downloaded native documents for durable backups.
- Upstream Microsoft Clarity tracking and promotional media feeds have been removed from the active interface.
- Startup `?plugin=` links are ignored. `?url=` and `?model=` accept supported model/document files over HTTP(S); they cannot load executable `.chiliplugin` files. Intentional plugin imports remain available, and imported plugin code must be trusted.
- The optional AI panel starts closed. Opening it explicitly presents a generic Completions API configuration with no endpoint, model, or key filled in. An explicit HTTP(S) endpoint, model, and session key are required before sending; provider-specific presets remain available by choice. These tools are not required or configured for the normal CAD workflow. No billed API is used by the sample, build, or verification workflow.

## Project development

- Original drilled-plate and right-angle-bracket builder with coupled hole-layout validation, atomic parameter editing and native-document persistence.
- SolidFrame project hub, matching light/dark workspace palettes, original mark and fixture illustration, branded loading and recoverable startup errors.
- A compact modeling ribbon with distinct command/menu targets, visible keyboard focus, and keyboard navigation through tool menus.
- One-click native fixture with editable Box/Cylinder nodes, serialization support, and one undoable creation transaction.
- No URL-authorized plugin execution, including the model-file alias path; signed model URLs now retain a correct filename.
- Query/fragment-safe bundled plugin paths and subpath-compatible production assets.
- Separate local storage and preference namespaces; readable new-document names.
- Compatible dependency updates resolving the seven advisories reported by the initial npm audit.

## Verification

```sh
npm test
npm run build
npm run check
```

`npm run check` is the upstream Biome command and **writes formatting fixes**. The test suite uses Rstest and Happy-DOM; geometry integration tests load the real local OpenCascade WASM. Added regressions exercise the editable sample's solid geometry, serialization and parameter updates, startup plugin restrictions, and deployment paths. Passing tests are bounded evidence, not a guarantee for every model, browser, or exchange file. See [verification](docs/solidframe-verification.md) for the exact observed checks and limits.

## Source and licensing

SolidFrame builds on [Chili3D](https://github.com/xiangechen/chili3d) by 仙阁 (Xiange Chen) and its contributors, using source baseline [`03a6a542`](https://github.com/xiangechen/chili3d/commit/03a6a542e841a7f1952f67aa729e0658a8096c08). Their source headers and copyright notices are preserved.

Application code is licensed under [AGPL-3.0](LICENSE); the C++/WASM component carries [its existing LGPL notice](cpp/LICENSE-chili-wasm.txt). Third-party dependencies retain their own licenses. The running app links to corresponding source and license notices from **About & licenses**. See [upstream documentation](UPSTREAM_README.md) for architecture and C++ development details, and [NOTICE](NOTICE) for attribution.
