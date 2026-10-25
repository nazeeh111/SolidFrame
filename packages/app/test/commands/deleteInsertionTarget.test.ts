// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, type INode, type NodeRecord } from "@chili3d/core";
import { createHandlerMockView, createMockApplication, TestDocument } from "@chili3d/core/test-utils";
import { afterEach, expect, test } from "@rstest/core";
import { Tree } from "../../../ui/src/project/tree/tree";
import { Delete } from "../../src/commands/delete";
import { NewFolder } from "../../src/commands/folder";
import { Redo } from "../../src/commands/redo";
import { Undo } from "../../src/commands/undo";
import { SelectionManager } from "../../src/selectionManager";

const cleanups: (() => void)[] = [];
afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
});

function fixture() {
    const app = createMockApplication();
    const doc = new TestDocument({ application: app });
    doc.selection = new SelectionManager(doc);
    const view = createHandlerMockView({ document: doc });
    app.activeView = view;
    doc.history.disabled = true;
    const outer = new FolderNode({ document: doc, name: "outer" });
    const inner = new FolderNode({ document: doc, name: "inner" });
    const sibling = new FolderNode({ document: doc, name: "sibling" });
    doc.modelManager.rootNode.add(outer, sibling);
    outer.add(inner);
    doc.history.disabled = false;
    // Use the real selection and insertion-target delegates from Tree.onClick.
    // Happy-DOM's virtual appendChild dispatch cannot construct the native TreeGroup layout.
    const treeContext = { document: doc } as unknown as Tree;
    cleanups.push(() => {
        doc.history.dispose();
        doc.dispose();
    });
    function click(node: FolderNode, ctrlKey = false) {
        doc.selection.setSelectedNodes([node], ctrlKey);
        // biome-ignore lint/complexity/useLiteralKeys: Exercise the private tree delegate without constructing Happy-DOM TreeGroup.
        Tree.prototype["handleLastClickItem"].call(treeContext, node);
    }
    return { app, doc, outer, inner, sibling, click };
}

test.each([1, 2])("deleting an ancestor cannot strand an insertion folder at depth %i", async (depth) => {
    const f = fixture();
    let active = f.inner;
    if (depth === 2) {
        f.doc.history.disabled = true;
        active = new FolderNode({ document: f.doc, name: "deep" });
        f.inner.add(active);
        f.doc.history.disabled = false;
    }
    f.click(f.outer);
    f.click(active, true);
    f.click(active, true);
    expect(f.doc.selection.getSelectedNodes()).toEqual([f.outer]);
    expect(f.doc.modelManager.currentNode).toBe(active);
    await new Delete().execute(f.app);
    expect(f.outer.parent).toBeUndefined();
    const inserted: INode[] = [];
    const capture = (records: NodeRecord[]) => {
        inserted.push(...records.filter((record) => record.action === "add").map((record) => record.node));
    };
    f.doc.modelManager.addNodeObserver(capture);
    try {
        await new NewFolder().execute(f.app);
    } finally {
        f.doc.modelManager.removeNodeObserver(capture);
    }
    expect(inserted).toHaveLength(1);
    const created = inserted[0];
    const serialized = f.doc.modelManager.serialize();
    const saved = serialized.nodes.find(({ id }) => id === created.id);
    expect(saved).toMatchObject({ id: created.id, parentId: f.doc.modelManager.rootNode.id });
    expect(f.doc.modelManager.findNode((node) => node === created)).toBe(created);
    expect(created.parent).toBe(f.doc.modelManager.rootNode);
    expect(active.children()).toEqual([]);
    expect(f.doc.modelManager.currentNode).toBe(f.doc.modelManager.rootNode);
});

test("deletion undo and redo retain the ancestor subtree and keep insertion reachable", async () => {
    const f = fixture();
    f.doc.modelManager.currentNode = f.inner;
    f.doc.selection.setSelectedNodes([f.outer], false);
    await new Delete().execute(f.app);
    expect(f.doc.history.undoCount()).toBe(1);
    await new Undo().execute(f.app);
    expect(f.doc.modelManager.findNodes((node) => node.parent === f.doc.modelManager.rootNode)).toEqual([
        f.outer,
        f.sibling,
    ]);
    expect(f.outer.children()).toEqual([f.inner]);
    expect(f.doc.modelManager.currentNode).toBe(f.doc.modelManager.rootNode);
    await new Redo().execute(f.app);
    expect(f.doc.modelManager.findNodes((node) => node.parent === f.doc.modelManager.rootNode)).toEqual([
        f.sibling,
    ]);
    expect(f.inner.parent).toBe(f.outer);
    expect(f.doc.modelManager.currentNode).toBe(f.doc.modelManager.rootNode);
});

test("deleting the current folder retains the existing root fallback", async () => {
    const f = fixture();
    f.doc.modelManager.currentNode = f.inner;
    f.doc.selection.setSelectedNodes([f.inner], false);
    await new Delete().execute(f.app);
    expect(f.doc.modelManager.currentNode).toBe(f.doc.modelManager.rootNode);
    expect(f.outer.children()).toEqual([]);
    expect(f.doc.history.undoCount()).toBe(1);
});

test("deleting an unrelated folder preserves the current insertion folder", async () => {
    const f = fixture();
    f.doc.modelManager.currentNode = f.inner;
    f.doc.selection.setSelectedNodes([f.sibling], false);
    await new Delete().execute(f.app);
    expect(f.doc.modelManager.currentNode).toBe(f.inner);
    await new NewFolder().execute(f.app);
    expect(f.inner.children()).toHaveLength(1);
    expect(f.doc.modelManager.findNode((n) => n === f.inner.firstChild)).toBe(f.inner.firstChild);
});

test("deleting a child preserves its surviving current parent", async () => {
    const f = fixture();
    f.doc.modelManager.currentNode = f.outer;
    f.doc.selection.setSelectedNodes([f.inner], false);
    await new Delete().execute(f.app);
    expect(f.doc.modelManager.currentNode).toBe(f.outer);
    await new NewFolder().execute(f.app);
    expect(f.outer.children()).toHaveLength(1);
    expect(f.doc.modelManager.findNode((n) => n === f.outer.firstChild)).toBe(f.outer.firstChild);
});

test("cancelling deletion with no selected nodes preserves the insertion target", async () => {
    const f = fixture();
    f.doc.modelManager.currentNode = f.inner;
    f.doc.picker.pickNode = async (_prompt, controller) => {
        controller.cancel();
        return [];
    };
    expect(f.doc.selection.getSelectedNodes()).toEqual([]);
    await new Delete().execute(f.app);
    expect(f.doc.modelManager.currentNode).toBe(f.inner);
    expect(f.doc.modelManager.findNodes()).toEqual([f.outer, f.inner, f.sibling]);
    expect(f.doc.history.undoCount()).toBe(0);
});
