// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { rs } from "@rstest/core";
import { ShapeFactory } from "../../wasm/src/factory";
import "../../wasm/test/setup";
import { buildCapabilityTools } from "../src/tools/capabilityEngine";

test("native edge update arguments survive dispatcher ref replay", async () => {
    const nodes: any[] = [];
    const doc = createMockDocument();
    (doc.modelManager as any).addNode = (node: any) => {
        nodes.push(node);
        node.parent = { remove: () => nodes.splice(nodes.indexOf(node), 1) };
    };
    (doc.modelManager as any).findNodes = (predicate: any) => nodes.filter(predicate);
    const app = createMockApplication({ shapeProvider: { factory: new ShapeFactory() } });
    (app as any).activeView = { document: doc };
    rs.stubGlobal("app", app);
    try {
        const tool = buildCapabilityTools()[0];
        const initial = JSON.parse(
            (await tool.handler({
                ops: [
                    {
                        id: "e",
                        method: "line",
                        args: { start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } },
                    },
                    { id: "c", method: "edge.curve", target: "e" },
                    { id: "t", method: "trimmedCurve.setTrim", target: "c", args: { u1: 0, u2: 4 } },
                    { id: "u", method: "edge.update", target: "e", args: { curve: "c" } },
                ],
            })) as string,
        );
        expect(initial.results.u).toBeNull();
        for (let replay = 0; replay < 3; replay++) {
            const result = JSON.parse(
                (await tool.handler({
                    ops: [{ id: "length", method: "edge.length", target: "e" }],
                })) as string,
            );
            expect(Number.isFinite(result.results.length)).toBe(true);
        }
    } finally {
        rs.unstubAllGlobals();
        for (const node of nodes) node.shape.value.dispose();
    }
});
