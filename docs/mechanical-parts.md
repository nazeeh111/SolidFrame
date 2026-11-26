# Mechanical parts

SolidFrame’s mechanical part builder creates one editable native solid from a compact set of dimensions. It adds a focused part-design workflow to the existing modeling workspace.

## Create and revise

1. Choose **Create mechanical part** on the home screen or in the modeling ribbon.
2. Choose a plate or bracket, then enter stock dimensions and hole layouts. For a bracket, configure the horizontal and vertical flanges separately.
3. Choose **Create part** to add one part. Opening or cancelling the editor does not create a document.
4. Select the part and choose **Edit mechanical part** to revise the complete configuration. Use **Apply changes**, then the document’s **Undo** and **Redo** controls as needed.
5. Save the project in this browser or download a native `.cd` file. Reopen a saved project from Recent projects to continue editing.

Defaults are a 100 × 80 × 6 mm plate with four Ø8 mm holes at 60 × 40 mm pitch. The bracket adds a 60 mm total height and four vertical-flange Ø8 mm holes at 60 × 30 mm pitch. These are starting dimensions, not a standardized or approved part.

## Try the drilled bracket

1. [Open the bracket in SolidFrame](https://nazeeh111.github.io/SolidFrame/?model=https://raw.githubusercontent.com/nazeeh111/SolidFrame/refs/heads/main/docs/presentation/drilled-bracket.cd). To open it from disk, view [the native bracket file](presentation/drilled-bracket.cd), use **Download raw file** in GitHub’s toolbar and choose **Open document** in SolidFrame.
2. Select **Mechanical part1** in the tree, then choose **Edit mechanical part**. The two flange drawings share a scale. The shaded strip marks the adjoining flange, and the elevation places it below the holes.
3. Change **Width** from 100 to 120 mm and apply the edit. The two hole grids retain their pitches and stay centered. Undo returns the width to 100 mm.

The [illustrated bracket](presentation/bracket.png) uses the dimensions and hole grids in that native file. Its 6 mm stock has two Ø8 mm hole grids, pitched 60 × 40 mm on the horizontal flange and 60 × 30 mm on the vertical flange. Both orthographic drawings use the same scale. The 3D view is an isometric technical illustration of the saved parameters. The actual solid is rebuilt by OpenCascade when the file opens. [Figure source and file identities](presentation/bracket-manifest.json).

## Geometry

A plate is rectangular stock with a centered grid of round through holes. A bracket is an ideal sharp right-angle solid with separate hole grids on its horizontal and vertical flanges. The bracket height includes the base thickness. Grids are centered in the usable flange area, clear of the inside corner.

Stock dimensions, hole diameter and pitch use millimetres. Rows and columns are integer counts. The complete configuration is validated before a native geometry operation: dimensions must be finite and positive, holes must not overlap or touch stock edges, and bracket holes must clear the adjoining flange. Stock and residual web must be at least 0.5 mm; dimensions are limited to 2,000 mm. A part may have at most 32 holes across its enabled grids. These limits bound work in the browser; they are not material or manufacturing requirements.

## Editing and files

The editor applies the whole configuration together. It builds candidate geometry before replacing the current valid parameters. A rejected edit leaves the old part intact. Creation and accepted edits participate in document undo/redo. No construction cylinders appear as additional project nodes.

The native `.cd` document stores the builder parameters. Reopening it reconstructs the part with the same editable values. STEP and STL use the existing export commands and preserve geometry, not these builder settings.

The part has parameter editing and document undo history. It does not expose separate blank/cut rows in the inherited parametric feature timeline. General sketch-based feature history remains available for other models.

## Limits

Supported shapes are rectangular plates and sharp right-angle brackets with regular round through-hole grids. There are no countersinks, threads, slots, corner fillets or arbitrary picked-face hole placement in this builder.

A sharp bracket is an ideal geometric model. It is not a sheet-metal flat pattern and does not calculate bend radius, bend allowance, material properties, strength or manufacturing tolerances. Validate a design separately before fabrication.

The implementation reuses Chili3D’s node, transaction, serialization, selection and export infrastructure and the existing OpenCascade geometry kernel. The part configuration, validation, construction workflow and dedicated editor are the new SolidFrame contribution.
