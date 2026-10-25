// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Mesh, MeshNode, type MeshType } from "@chili3d/core";
import { TestDocument } from "@chili3d/core/test-utils";
import { afterEach, expect, test } from "@rstest/core";
import { MeshBasicMaterial } from "three";
import type { ThreeVisualContext } from "../src/threeVisualContext";
import { ThreeMeshObject } from "../src/threeVisualObject";

const cleanups: (() => void)[] = [];
afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
});

function mesh(meshType: MeshType, color: number) {
    return new Mesh({
        meshType,
        color,
        position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
    });
}
function fixture(kind: MeshType) {
    const doc = new TestDocument();
    const borrowed = new MeshBasicMaterial({ color: 0x123456 });
    const context = { getMaterial: () => borrowed } as unknown as ThreeVisualContext;
    const node = new MeshNode({ document: doc, name: "mesh", mesh: mesh(kind, 0xff0000) });
    const visual = new ThreeMeshObject(context, node);
    cleanups.push(() => {
        visual.unhighlight();
        visual.dispose();
        borrowed.dispose();
        doc.dispose();
    });
    return { node, visual };
}

test.each([
    ["linesegments", "linesegments"],
    ["linesegments", "surface"],
    ["surface", "linesegments"],
    ["surface", "surface"],
] as const)("%s to %s replacement removes the old child and restores the current material", (from, to) => {
    const { node, visual } = fixture(from);
    const previous = visual.mesh;
    let disposed = 0;
    previous.geometry.addEventListener("dispose", () => {
        disposed++;
    });
    node.mesh = mesh(to, 0x0000ff);
    const replacement = visual.mesh;
    const currentMaterial = replacement.material;
    expect(replacement).not.toBe(previous);
    expect(disposed).toBe(1);
    expect(visual.children).toHaveLength(1);
    expect(visual.children[0]).toBe(replacement);
    visual.highlight();
    expect(replacement.material).not.toBe(currentMaterial);
    visual.unhighlight();
    expect(replacement.material).toBe(currentMaterial);
    expect(visual.wholeVisual()).toHaveLength(1);
    expect(visual.wholeVisual()[0]).toBe(replacement);
});

test("repeated line replacements do not accumulate children or restore an old color", () => {
    const { node, visual } = fixture("linesegments");
    for (const color of [0x00ff00, 0x0000ff]) {
        node.mesh = mesh("linesegments", color);
        const current = visual.mesh.material;
        visual.highlight();
        visual.unhighlight();
        expect(visual.mesh.material).toBe(current);
        expect(visual.children).toHaveLength(1);
        expect(visual.children[0]).toBe(visual.mesh);
    }
});

test.each(["surface", "linesegments"] as const)("unchanged %s still restores its material", (kind) => {
    const { visual } = fixture(kind);
    const original = visual.mesh.material;
    visual.highlight();
    visual.unhighlight();
    expect(visual.mesh.material).toBe(original);
    expect(visual.children).toHaveLength(1);
    expect(visual.children[0]).toBe(visual.mesh);
});
