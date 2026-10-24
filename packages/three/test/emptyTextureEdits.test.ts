// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { DeepObserver, type DeepPropertyChangedHandler, Material, XY } from "@chili3d/core";
import { createMockVisual, TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, rs, test } from "@rstest/core";
import { type MeshLambertMaterial, Scene, Texture as ThreeTexture } from "three";
import { ThreeVisualContext } from "../src/threeVisualContext";

function fixture() {
    const document = new TestDocument();
    document.history.disabled = true;
    const errors = rs.spyOn(console, "error").mockImplementation(() => {});
    const context = new ThreeVisualContext(createMockVisual({ document }), new Scene());
    const material = new Material({ document, name: "Surface", color: 0x123456 });
    document.modelManager.materials.push(material);
    const rendered = context.getMaterial(material.id) as MeshLambertMaterial;
    return {
        material,
        rendered,
        errors,
        cleanup: () => {
            const callback = (context as unknown as { onMaterialPropertyChanged: DeepPropertyChangedHandler })
                .onMaterialPropertyChanged;
            DeepObserver.removeDeepPropertyChangedHandler(material, callback);
            context.dispose();
            errors.mockRestore();
        },
    };
}

describe("material edits with no loaded image", () => {
    test("retains rotation on the model when its rendered map is null", () => {
        const { material, rendered, errors, cleanup } = fixture();
        try {
            expect(rendered.map).toBeNull();
            material.map.rotation = 45;
            expect(material.map.rotation).toBe(45);
            expect(rendered.map).toBeNull();
            expect(errors).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    test("retains repeat on the model when its rendered map is null", () => {
        const { material, rendered, errors, cleanup } = fixture();
        try {
            expect(rendered.map).toBeNull();
            material.map.repeat = new XY({ x: 2, y: 3 });
            expect(material.map.repeat.x).toBe(2);
            expect(material.map.repeat.y).toBe(3);
            expect(rendered.map).toBeNull();
            expect(errors).not.toHaveBeenCalled();
        } finally {
            cleanup();
        }
    });

    test("still updates an existing rendered texture", () => {
        const { material, rendered, errors, cleanup } = fixture();
        const map = new ThreeTexture();
        rendered.map = map;
        try {
            material.map.repeat = new XY({ x: 4, y: 5 });
            expect(rendered.map).toBe(map);
            expect(map.repeat.x).toBe(4);
            expect(map.repeat.y).toBe(5);
            expect(errors).not.toHaveBeenCalled();
        } finally {
            cleanup();
            map.dispose();
        }
    });
});
