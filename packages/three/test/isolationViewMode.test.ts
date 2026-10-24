// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { ViewMode } from "@chili3d/core";
import { TestDocument } from "@chili3d/core/test-utils";
import { buildViewTools } from "../../ai/src/tools/viewTools";
import { Constants } from "../src/constants";
import { ThreeGeometry } from "../src/threeGeometry";
import { createTestGeometryNode, createThreeMockVisualContext } from "./mocks";
import { TestView } from "./testView";

test.each([
    { initial: "wireframe", final: "wireframe", solid: false, edges: true },
    { initial: "solid", final: "solid", solid: true, edges: false },
    { initial: "solidAndWireframe", final: "solidAndWireframe", solid: true, edges: true },
    { initial: "wireframe", final: "solid", solid: true, edges: false },
] as {
    initial: ViewMode;
    final: ViewMode;
    solid: boolean;
    edges: boolean;
}[])("isolation clear restores the current view mode: %j", async ({ initial, final, solid, edges }) => {
    const doc = new TestDocument();
    const context = createThreeMockVisualContext();
    const node = createTestGeometryNode({ hasVertexs: false });
    const geometry = new ThreeGeometry(node, context);
    context.visualShapes.add(geometry);
    context.getVisual = () => geometry;
    rs.spyOn(doc.modelManager, "findNodes").mockImplementation((predicate) =>
        !predicate || predicate(node) ? [node] : [],
    );
    const view = new TestView(doc, context);
    rs.stubGlobal("app", { activeView: view });
    try {
        const tool = buildViewTools().find((entry) => entry.name === "isolate_view");
        expect(tool).toBeDefined();
        view.mode = initial;
        const isolated = await tool!.handler({ ids: [node.id] });
        expect(JSON.parse(typeof isolated === "string" ? isolated : isolated.content)).toEqual({
            ok: true,
            isolated: [node.id],
        });
        view.mode = final;
        const cleared = await tool!.handler({ ids: [] });
        expect(JSON.parse(typeof cleared === "string" ? cleared : cleared.content)).toEqual({
            ok: true,
            isolated: [],
        });
        expect(view.mode).toBe(final);
        expect(view.camera.layers.isEnabled(Constants.Layers.Solid)).toBe(solid);
        expect(view.camera.layers.isEnabled(Constants.Layers.Wireframe)).toBe(edges);
        expect(node.visible).toBe(true);
        expect(node.parentVisible).toBe(true);
    } finally {
        rs.unstubAllGlobals();
        rs.restoreAllMocks();
        view.dispose();
        geometry.dispose();
    }
});
