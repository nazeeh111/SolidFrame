// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    command,
    type IApplication,
    type ICommand,
    type IDocument,
    type ParameterShapeNode,
    Plane,
    Transaction,
    XYZ,
} from "@chili3d/core";
import { BoxNode } from "../../bodys/box";
import { CylinderNode } from "../../bodys/cylinder";

/** A millimetre-scale fixture assembled from native, serializable parametric solids. */
export function fixtureNodes(document: IDocument): ParameterShapeNode[] {
    const point = (x: number, y: number, z: number) => new XYZ({ x, y, z });
    const box = (name: string, x: number, y: number, z: number, dx: number, dy: number, dz: number) => {
        const node = new BoxNode({ document, plane: Plane.XY.translateTo(point(x, y, z)), dx, dy, dz });
        node.name = name;
        return node;
    };
    const cylinder = (name: string, x: number, y: number, z: number, radius: number, dz: number) => {
        const node = new CylinderNode({ document, normal: XYZ.unitZ, center: point(x, y, z), radius, dz });
        node.name = name;
        return node;
    };
    return [
        box("01 · Base plate", -50, -35, 0, 100, 70, 8),
        box("02 · Fixed jaw", -42, 16, 8, 84, 12, 24),
        box("03 · Moving jaw", -32, -22, 8, 64, 12, 24),
        box("04 · Workpiece", -22, -8, 8, 44, 22, 18),
        cylinder("05 · Locator pin L", -40, -23, 8, 4, 16),
        cylinder("06 · Locator pin R", 40, -23, 8, 4, 16),
        cylinder("07 · Reference boss", 0, 22, 32, 5, 8),
    ];
}

@command({ key: "doc.sample", icon: "icon-box", isApplicationCommand: true })
export class SampleDocument implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const document = await app.newDocument("Workholding fixture");
        const nodes = fixtureNodes(document);
        try {
            for (const node of nodes) {
                if (!node.shape.isOk) throw new Error(node.shape.error);
            }
            Transaction.execute(document, "Create sample fixture", () => {
                nodes.forEach((node, index) => {
                    const material = document.modelManager.materials.at(index === 3 ? 1 : 0);
                    if (material) node.materialId = material.id;
                    document.modelManager.addNode(node);
                });
            });
        } catch (error) {
            nodes.forEach((node) => node.dispose());
            throw error;
        }
        document.visual.update();
        app.activeView?.cameraController.fitContent();
    }
}
