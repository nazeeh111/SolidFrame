// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Serializer, ShapeTypes } from "@chili3d/core";
import { TestDocument } from "@chili3d/core/test-utils";
import { ShapeFactory } from "@chili3d/wasm";
import { afterEach, beforeEach, expect, rs, test } from "@rstest/core";
import "../../../../wasm/test/setup";
import type { BoxNode } from "../../../src/bodys/box";
import { fixtureNodes } from "../../../src/commands/application/sampleDocument";

beforeEach(() => {
    rs.stubGlobal("shapeFactory", new ShapeFactory());
});
afterEach(() => {
    rs.unstubAllGlobals();
});

test("the sample contains editable solids that survive serialization and parameter edits", () => {
    const document = new TestDocument();
    const nodes = fixtureNodes(document);
    expect(nodes).toHaveLength(7);
    for (const node of nodes) {
        expect(node.shape.isOk).toBe(true);
        expect(node.shape.value.shapeType).toBe(ShapeTypes.solid);
        expect(node.shape.value.volume()).toBeGreaterThan(0);
        const restored = Serializer.deserializeObject(
            document,
            Serializer.serializeObject(node),
        ) as typeof node;
        expect(restored.name).toBe(node.name);
        expect(restored.shape.value.volume()).toBeCloseTo(node.shape.value.volume(), 6);
        restored.dispose();
    }
    const plate = nodes[0] as BoxNode;
    const initialVolume = plate.shape.value.volume();
    plate.dx *= 1.5;
    expect(plate.shape.value.volume()).toBeCloseTo(initialVolume * 1.5, 6);
    nodes.forEach((node) => node.dispose());
});
