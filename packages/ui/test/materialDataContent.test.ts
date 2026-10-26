// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Component, FolderNode, Material, type VisualNode, XYZ } from "@chili3d/core";
import { TestDocument } from "@chili3d/core/test-utils";
import { expect, rs, test } from "@rstest/core";
import { MaterialDataContent } from "../src/property/material/materialDataContent";

function setup() {
    const doc = new TestDocument();
    const first = new Material({ document: doc, name: "First", color: 0xeeeeee });
    const second = new Material({ document: doc, name: "Second", color: 0x888888 });
    doc.modelManager.materials.push(first, second);
    const callback = rs.fn();
    return { doc, first, second, callback, content: new MaterialDataContent(doc, callback, first) };
}

test("used appearances cannot be deleted, including references in a material array", () => {
    const { doc, first, second, content } = setup();
    const part = new FolderNode({ document: doc, name: "Part" }) as FolderNode & { materialId: string[] };
    part.materialId = [second.id, first.id];
    doc.modelManager.addNode(part);
    expect(content.canDeleteMaterial()).toBe(false);
    content.deleteMaterial();
    expect(doc.modelManager.materials.contains(first)).toBe(true);
    expect(part.materialId).toEqual([second.id, first.id]);
});

test("deleting an unused appearance preserves the selection and can be undone", async () => {
    const { doc, first, second, content, callback } = setup();
    expect(content.canDeleteMaterial()).toBe(true);
    content.deleteMaterial();
    expect(doc.modelManager.materials.contains(first)).toBe(false);
    expect(content.editingMaterial).toBe(second);
    expect(callback).not.toHaveBeenCalled();
    await doc.history.undo();
    expect(doc.modelManager.materials.contains(first)).toBe(true);
});

test("adding and copying select the new appearance without assigning it to a part", () => {
    const { doc, first, content, callback } = setup();
    content.copyMaterial();
    expect(content.editingMaterial).not.toBe(first);
    expect(content.editingMaterial.name).toBe("First clone");
    expect(doc.modelManager.materials.contains(content.editingMaterial)).toBe(true);
    const copy = content.editingMaterial;
    content.addMaterial();
    expect(content.editingMaterial).not.toBe(copy);
    expect(doc.modelManager.materials.length).toBe(4);
    expect(callback).not.toHaveBeenCalled();
});

test("appearances used inside imported components cannot be deleted", () => {
    const { doc, first, content } = setup();
    const part = new FolderNode({ document: doc, name: "Imported part" }) as FolderNode & {
        materialId: string;
    };
    part.materialId = first.id;
    doc.modelManager.components.push(
        new Component({
            name: "Imported component",
            nodes: [part as unknown as VisualNode],
            origin: XYZ.zero,
        }),
    );
    expect(content.canDeleteMaterial()).toBe(false);
    content.deleteMaterial();
    expect(doc.modelManager.materials.contains(first)).toBe(true);
});
