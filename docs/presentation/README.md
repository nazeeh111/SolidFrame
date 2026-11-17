# A sketch, its feature and an exchange solid

This is a completed synthetic CAD example, made with the existing sketch and feature tools. It supplements the editable fixture and mechanical-part builder; it does not define the application's entire capability or certify fabrication.

## Open the actual files

Download [rectangle-extrusion.cd](rectangle-extrusion.cd), then choose **Open document** in [SolidFrame](https://nazeeh111.github.io/SolidFrame/). The native file contains:

- `Sketch1`: four line entities, four coincident connections, two horizontal and two vertical constraints, an origin connection and a horizontal driving dimension of **90 mm**. Its saved current height is **40 mm**. These ten recorded constraints are not a claim that every degree of freedom is constrained.
- `Parametric Body1`: one stored `extrude` feature with depth **12 mm**, a link to `Sketch1`, and its four selected profile edges.

The native file was downloaded after the completed sketch/dimension/extrusion run. Undo removed the new body; redo restored it. The file then reopened with the sketch and extrusion retained. The original run's typed-first rectangle started at 80×40 mm before the width was driven to 90 mm. These are historical executed steps, not an instruction to trust an unverified saved solver claim.

For a separate exchange check, download [rectangle-extrusion.step](rectangle-extrusion.step), create a new document and choose **Model → Import**. Use **Fit Content**. The native model and independently imported STEP both have geometry bounds from approximately `(0,0,0)` to `(90,40,12)` mm. The negligible negative x minimum, about −5.3×10⁻¹⁷ mm, remains in the raw records. STEP contains exchange geometry, not the native sketch/feature history.

The actual public application at source `7986c79725cf7429d7ec816d647805947ce434bf` reopened both provided files in separate documents. [Native capture](native-reopened.png) · [Separate STEP capture](step-reopened.png) · [Raw public-browser records](replay.json). The earlier authoring workflow used the same application source plus the typed-coordinate repair now published at that revision. No supplied document contains private user data.

## How the illustration is derived

[The original standard-library renderer](render.py) reads the delivered `.cd` file, its four actual sketch lines, the driving-width constraint and the linked extrusion. [case.json](case.json) retains all those source values, profile edges, projection rows and bounds. The wide/narrow SVGs retain the same geometry and values.

The plan view uses the same scale in x and y. The solid view uses two orthonormal isometric camera rows and one uniform screen scale; it has no perspective scaling. Values below 10⁻¹² are drawn at zero, while both original files and raw records are unchanged. Filled faces illustrate this saved rectangular extrusion. They are a source-derived technical diagram, not a kernel-rendered screenshot or an independently measured part. PNGs are actual browser renders of the corresponding SVGs. [Input and figure identities](figure-manifest.json).

The [separate seven-part fixture capture](fixture-width85.png) comes from the actual deployed edit 70→85 mm, undo 70 mm, redo 85 mm journey. The parts remain independently dimensioned; the image does not establish assembly constraints or structural validation.

## Meaning and limits

The example demonstrates this saved sketch/feature, actual native reopening and matching imported geometry bounds. It does not establish every topological identity, arbitrary exchange round-trip, physical accuracy, material behavior, sheet-metal bend allowance, multibody assembly constraints or manufacturing approval. The application's inherited CAD tools and parametric system remain available beyond this example. Corresponding application source and its existing AGPL/LGPL/third-party notices remain unchanged.
