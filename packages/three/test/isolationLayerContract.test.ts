// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CameraType, ViewMode } from "@chili3d/core";
import { TestDocument } from "@chili3d/core/test-utils";
import { Mesh } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { buildViewTools } from "../../ai/src/tools/viewTools";
import { ThreeGeometry } from "../src/threeGeometry";
import { createTestGeometryNode, createThreeMockVisualContext } from "./mocks";
import { TestView } from "./testView";

const modes: ViewMode[] = ["wireframe", "solid", "solidAndWireframe"];
// Existing policy enables all layers, then excludes the unwanted geometry channel.
const masks: Record<ViewMode, number> = { wireframe: -5, solid: -3, solidAndWireframe: -1 };

function fixture(hidden = false) {
    const doc = new TestDocument();
    const context = createThreeMockVisualContext();
    const nodes = [
        createTestGeometryNode({ hasVertexs: false, visible: !hidden }),
        createTestGeometryNode({ hasVertexs: false, parentVisible: !hidden }),
    ];
    nodes.forEach((node, index) => Object.defineProperty(node, "id", { value: `node-${index}` }));
    const geometries = nodes.map((node) => new ThreeGeometry(node, context));
    context.visualShapes.add(...geometries);
    context.getVisual = (node) => geometries[nodes.indexOf(node as (typeof nodes)[number])];
    rs.spyOn(doc.modelManager, "findNodes").mockImplementation((predicate) =>
        nodes.filter((node) => !predicate || predicate(node)),
    );
    const view = new TestView(doc, context);
    return { nodes, geometries, view };
}

afterEach(() => {
    rs.unstubAllGlobals();
    rs.restoreAllMocks();
});

test.each(
    (["perspective", "orthographic"] as CameraType[]).flatMap((camera) =>
        modes.flatMap((initial) => modes.map((final) => ({ camera, initial, final }))),
    ),
)("clear uses current mode and current camera: %j", ({ camera, initial, final }) => {
    const { nodes, geometries, view } = fixture();
    try {
        view.mode = initial;
        view.isolate([nodes[0]]);
        expect(view.camera.layers.mask).toBe(1073741825); // Default + Isolation only.
        view.mode = final;
        view.cameraController.cameraType = camera;
        view.unisolate();
        expect(view.mode).toBe(final);
        expect(view.cameraController.cameraType).toBe(camera);
        expect(view.camera.layers.mask).toBe(masks[final]);
        expect(geometries[0].layers.mask).toBe(1);
        for (const child of geometries[0].children) {
            expect(child.layers.mask).toBe(child instanceof LineSegments2 ? 2 : 4);
        }
        // A second clear does nothing, including to unrelated layers.
        view.camera.layers.disable(12);
        const mask = view.camera.layers.mask;
        view.unisolate();
        expect(view.camera.layers.mask).toBe(mask);
    } finally {
        view.dispose();
        geometries.forEach((geometry) => geometry.dispose());
    }
});

test("clear preserves hidden nodes, mesh identity, materials and resource ownership", () => {
    const { nodes, geometries, view } = fixture(true);
    const children = geometries.map((geometry) => [...geometry.children]);
    const disposals = children.flat().map((child) => rs.spyOn((child as Mesh).geometry, "dispose"));
    const materials = children.flat().map((child) => (child as Mesh).material);
    try {
        view.mode = "solid";
        view.isolate([nodes[0]]);
        view.isolate([nodes[1]]); // The public view method accumulates isolation.
        view.unisolate();
        expect(view.camera.layers.mask).toBe(-3);
        expect(nodes[0].visible).toBe(false);
        expect(nodes[1].parentVisible).toBe(false);
        geometries.forEach((geometry, i) => {
            expect(geometry.layers.mask).toBe(1);
            expect(geometry.children).toHaveLength(children[i].length);
            geometry.children.forEach((child, j) => expect(child).toBe(children[i][j]));
            expect(geometry.visible).toBe(false);
        });
        expect(children.flat().map((child) => (child as Mesh).material)).toEqual(materials);
        disposals.forEach((dispose) => expect(dispose).not.toHaveBeenCalled());
    } finally {
        view.dispose();
        geometries.forEach((geometry) => geometry.dispose());
    }
});

test("actual tool retains validation, replacement and empty-clear responses", async () => {
    const { nodes, geometries, view } = fixture();
    rs.stubGlobal("app", { activeView: view });
    const tool = buildViewTools().find((entry) => entry.name === "isolate_view");
    expect(tool).toBeDefined();
    const invoke = async (ids: unknown) => {
        const response = await tool!.handler({ ids });
        return JSON.parse(typeof response === "string" ? response : response.content);
    };
    try {
        view.mode = "wireframe";
        await invoke([nodes[0].id]);
        const mask = view.camera.layers.mask;
        expect(await invoke("bad")).toEqual({ error: "ids must be an array of node ids" });
        expect(await invoke(["absent"])).toEqual({ error: "nodes not found: absent" });
        expect(view.camera.layers.mask).toBe(mask);
        expect(geometries[0].layers.mask).toBe(1073741824);
        expect(await invoke([nodes[1].id])).toEqual({ ok: true, isolated: [nodes[1].id] });
        expect(geometries[0].layers.mask).toBe(1);
        expect(geometries[1].layers.mask).toBe(1073741824);
        expect(await invoke([])).toEqual({ ok: true, isolated: [] });
        expect(view.camera.layers.mask).toBe(-5);
        // Empty isolation still enters isolation at the public view API level.
        view.isolate([]);
        expect(view.camera.layers.mask).toBe(1073741825);
        view.unisolate();
        expect(view.camera.layers.mask).toBe(-5);
    } finally {
        view.dispose();
        geometries.forEach((geometry) => geometry.dispose());
    }
});
