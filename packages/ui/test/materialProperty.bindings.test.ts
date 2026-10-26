// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Material, ObservableCollection, type Property } from "@chili3d/core";
import { createMockDocument } from "@chili3d/core/test-utils";
import { expect, rs, test } from "@rstest/core";

rs.mock("../src/property/propertyBase.module.css", () => ({ panel: "panel" }));
rs.mock("../src/property/materialProperty.module.css", () => ({
    material: "material",
    materialSwatch: "material-swatch",
    materialLabel: "material-label",
}));

import { MaterialProperty } from "../src/property/materialProperty";

test("appearance name and swatch stay current while editing the assigned appearance", () => {
    const materials = new ObservableCollection<Material>();
    const doc = createMockDocument({ modelManager: { materials } });
    const material = new Material({ document: doc, name: "Light gray", color: 0xdedede });
    materials.push(material);
    const property = new MaterialProperty(doc, [{ materialId: material.id }], {
        name: "materialId",
        type: "materialId",
        display: "common.material",
    } as Property);
    document.body.append(property);
    const button = property.querySelector("button");
    const label = property.querySelector(".material-label");
    const swatch = property.querySelector<HTMLElement>(".material-swatch");
    expect(button).not.toBeNull();
    expect(label).not.toBeNull();
    expect(swatch).not.toBeNull();
    expect(label?.textContent).toBe("Light gray");
    expect(button?.title).toBe("Light gray");
    expect(swatch?.style.backgroundColor).toBe("#dedede");

    material.name = "Blue finish";
    material.color = 0x2255aa;

    expect(label?.textContent).toBe("Blue finish");
    expect(button?.title).toBe("Blue finish");
    expect(swatch?.style.backgroundColor).toBe("#2255aa");
    expect(button?.style.backgroundColor).toBe("");
    property.remove();
});
