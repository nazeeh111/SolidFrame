// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { expect, test } from "@rstest/core";
import { FolderNode, Transaction } from "../src";
import { createPlainNode, TestDocument } from "../test-utils";

function tree() {
    const document = new TestDocument();
    const folder = new FolderNode({ document, name: "folder" });
    const nodes = [createPlainNode("a"), createPlainNode("b"), createPlainNode("c")];
    document.history.disabled = true;
    folder.add(...nodes);
    document.history.disabled = false;
    return { document, folder, nodes };
}

test("failed removal rolls back without adding a new undo step", () => {
    const { document, folder, nodes } = tree();
    const failure = new Error("operation refused");
    try {
        expect(() =>
            Transaction.execute(document, "rejected", () => {
                folder.remove(nodes[1]);
                throw failure;
            }),
        ).toThrow(failure);
        expect(folder.children()).toContain(nodes[1]);
        expect(document.history.undoCount()).toBe(0);
        document.history.undo();
        expect(folder.children()).toContain(nodes[1]);
    } finally {
        folder.dispose();
        document.dispose();
    }
});

test("rollback preserves the pre-existing redo branch", () => {
    const { document, folder, nodes } = tree();
    try {
        folder.name = "renamed";
        document.history.undo();
        expect(document.history.redoCount()).toBe(1);
        expect(() =>
            Transaction.execute(document, "rejected", () => {
                folder.remove(nodes[1]);
                throw new Error("operation refused");
            }),
        ).toThrow("operation refused");
        expect(document.history.undoCount()).toBe(0);
        expect(document.history.redoCount()).toBe(1);
        document.history.redo();
        expect(folder.name).toBe("renamed");
    } finally {
        folder.dispose();
        document.dispose();
    }
});

test.each([
    false,
    true,
])("rollback restores the caller's history-disabled state after an error (%s)", (disabled) => {
    const document = new TestDocument();
    const transaction = new Transaction(document, "throwing rollback");
    let disabledDuringUndo: boolean | undefined;
    const failure = new Error("undo refused");
    transaction.start();
    Transaction.add(document, {
        name: "fixture",
        dispose() {},
        redo() {},
        undo() {
            disabledDuringUndo = document.history.disabled;
            throw failure;
        },
    });
    document.history.disabled = disabled;
    try {
        expect(() => transaction.rollback()).toThrow(failure);
        expect(disabledDuringUndo).toBe(true);
        expect(document.history.disabled).toBe(disabled);
        // The failed transaction has been removed even if its undo throws.
        expect(() => transaction.commit()).toThrow("Transaction has not started");
    } finally {
        document.dispose();
    }
});
