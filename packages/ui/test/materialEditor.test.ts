// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, Material } from "@chili3d/core";
import { TestDocument } from "@chili3d/core/test-utils";
import { afterEach, expect, rs, test } from "@rstest/core";

rs.mock("../src/property/material/materialEditor.module.css", () => ({
    title: "appearance-title",
    material: "swatch",
    active: "selected",
}));

import { MaterialDataContent } from "../src/property/material/materialDataContent";
import { MaterialEditor } from "../src/property/material/materialEditor";
import { mustQuery } from "./_helpers/domHelpers";

afterEach(() => document.body.replaceChildren());

function editor() {
    const doc = new TestDocument();
    const first = new Material({ document: doc, name: "First", color: 0xdddddd });
    const second = new Material({ document: doc, name: "Second", color: 0x888888 });
    doc.modelManager.materials.push(first, second);
    const part = new FolderNode({ document: doc, name: "Part" }) as FolderNode & { materialId: string };
    part.materialId = first.id;
    doc.modelManager.addNode(part);
    const content = new MaterialDataContent(doc, () => {}, first);
    const view = new MaterialEditor(content);
    document.body.append(view);
    return { view, content, first, doc };
}

test("keyboard buttons select a copied appearance and protect the assigned original", () => {
    const { view, content, first } = editor();
    const remove = mustQuery<HTMLButtonElement>(view, 'button[title="material.deleteUnused"]');
    expect(remove.disabled).toBe(true);
    mustQuery<HTMLButtonElement>(view, 'button[title="common.clone"]').click();
    expect(content.editingMaterial).not.toBe(first);
    expect(content.editingMaterial.name).toBe("First clone");
    expect(remove.disabled).toBe(false);
    expect(view.querySelectorAll("button.swatch").length).toBe(3);
    expect(view.querySelector(".selected")?.getAttribute("title")).toBe("First clone");
    remove.click();
    expect(content.editingMaterial).toBe(first);
    expect(remove.disabled).toBe(true);
    expect(view.querySelectorAll("button.swatch").length).toBe(2);
});

test("editor controls block modeling keys while retaining document undo shortcuts", () => {
    const { view } = editor();
    const shortcut = rs.fn();
    window.addEventListener("keydown", shortcut);
    try {
        const control = mustQuery<HTMLButtonElement>(view, 'button[title="common.clone"]');
        control.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
        expect(shortcut).not.toHaveBeenCalled();
        control.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
        expect(shortcut).toHaveBeenCalledTimes(1);
        mustQuery<HTMLInputElement>(view, "input").dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        expect(view.isConnected).toBe(false);
    } finally {
        window.removeEventListener("keydown", shortcut);
    }
});
