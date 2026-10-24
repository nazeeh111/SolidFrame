// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { DeepObserver, type DeepPropertyChangedHandler, Material } from "@chili3d/core";
import { createMockVisual, TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, rs, test } from "@rstest/core";
import { Scene } from "three";
import { ThreeVisualContext } from "../src/threeVisualContext";

function release(context: ThreeVisualContext, material: Material): void {
    // Also clean up the intentionally failing original implementation's registration.
    const callback = (context as unknown as { onMaterialPropertyChanged: DeepPropertyChangedHandler })
        .onMaterialPropertyChanged;
    DeepObserver.removeDeepPropertyChangedHandler(material, callback);
    context.dispose();
}

function createDocument() {
    const document = new TestDocument();
    document.history.disabled = true;
    const material = new Material({ document, name: "Surface", color: 0x123456 });
    return { document, material };
}

function createContext(document: TestDocument) {
    return new ThreeVisualContext(createMockVisual({ document }), new Scene());
}

describe("visual context material observer lifetime", () => {
    test("disposed context stops reading nested texture changes", () => {
        const { document, material } = createDocument();
        const texture = material.map;
        const rotation = rs.spyOn(texture, "rotation", "get");
        texture.rotation = 0.25;
        const unobservedReads = rotation.mock.calls.length;
        const context = createContext(document);
        document.modelManager.materials.push(material);
        expect(context.materialMap.has(material.id)).toBe(true);
        context.dispose();
        expect(context.materialMap.size).toBe(0);
        rotation.mockClear();

        try {
            texture.rotation = 0.5;
            expect(rotation.mock.calls.length).toBe(unobservedReads);
            expect(texture.rotation).toBe(0.5);
        } finally {
            release(context, material);
            rotation.mockRestore();
        }
    });

    test("disposing one context preserves another context's material updates", () => {
        const { document, material } = createDocument();
        const first = createContext(document);
        const second = createContext(document);
        document.modelManager.materials.push(material);
        try {
            material.opacity = 0.5;
            expect(second.getMaterial(material.id)).toHaveProperty("opacity", 0.5);
            first.dispose();
            material.opacity = 0.25;
            expect(second.getMaterial(material.id)).toHaveProperty("opacity", 0.25);
            expect(first.materialMap.size).toBe(0);
        } finally {
            release(first, material);
            release(second, material);
        }
    });

    test("material removal already stops nested observations before context disposal", () => {
        const { document, material } = createDocument();
        const texture = material.map;
        const rotation = rs.spyOn(texture, "rotation", "get");
        texture.rotation = 0.25;
        const unobservedReads = rotation.mock.calls.length;
        const context = createContext(document);
        document.modelManager.materials.push(material);
        document.modelManager.materials.remove(material);
        expect(context.materialMap.has(material.id)).toBe(false);
        rotation.mockClear();
        try {
            texture.rotation = 0.5;
            expect(rotation.mock.calls.length).toBe(unobservedReads);
            context.dispose();
            rotation.mockClear();
            texture.rotation = 0.75;
            expect(rotation.mock.calls.length).toBe(unobservedReads);
        } finally {
            release(context, material);
            rotation.mockRestore();
        }
    });
});
