// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode } from "../src";
import { createPlainNode, TestDocument } from "../test-utils";

for (const action of ["remove", "transfer"] as const) {
    describe(`${action} history order`, () => {
        test.each(
            [["b"], ["b", "c"], ["c", "b"], ["c", "a"], ["d", "b"], ["a", "b", "c", "d"]].map((names) => ({
                names,
            })),
        )("restores original sibling order and links after detaching %j", ({ names }) => {
            const doc = new TestDocument();
            const root = new FolderNode({ document: doc, name: "root" });
            const nodes = ["a", "b", "c", "d"].map((name) => createPlainNode(name));
            doc.history.disabled = true;
            root.add(...nodes);
            doc.history.disabled = false;
            const detached = names.map((name) => nodes.find((node) => node.name === name)!);
            root[action](...detached);

            for (let cycle = 0; cycle < 2; cycle++) {
                doc.history.undo();
                expect(root.children()).toEqual(nodes);
                expect(root.count).toBe(nodes.length);
                expect(root.firstChild).toBe(nodes[0]);
                expect(root.lastChild).toBe(nodes.at(-1));
                nodes.forEach((node, index) => {
                    expect(node.parent).toBe(root);
                    expect(node.previousSibling).toBe(nodes[index - 1]);
                    expect(node.nextSibling).toBe(nodes[index + 1]);
                });
                doc.history.redo();
                expect(root.children()).toEqual(nodes.filter((node) => !detached.includes(node)));
            }
        });

        test("falls back to the first position when an anchor was removed outside history", () => {
            const doc = new TestDocument();
            const root = new FolderNode({ document: doc, name: "root" });
            const [a, b, c] = ["a", "b", "c"].map((name) => createPlainNode(name));
            doc.history.disabled = true;
            root.add(a, b, c);
            doc.history.disabled = false;
            root[action](b);
            doc.history.disabled = true;
            root.remove(a);
            doc.history.disabled = false;
            doc.history.undo();
            expect(root.children()).toEqual([b, c]);
            expect(b.previousSibling).toBeUndefined();
            expect(b.nextSibling).toBe(c);
            expect(c.previousSibling).toBe(b);
        });
    });
}
