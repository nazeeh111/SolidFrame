// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { I18n, type IDocument, type INode, Material, Observable, Transaction } from "@chili3d/core";

let count = 1;

export class MaterialDataContent extends Observable {
    get editingMaterial(): Material {
        return this.getPrivateValue("editingMaterial");
    }
    set editingMaterial(value: Material) {
        this.setProperty("editingMaterial", value);
    }

    constructor(
        readonly document: IDocument,
        readonly callback: (material: Material) => void,
        editingMaterial: Material,
    ) {
        super();
        this.setPrivateValue("editingMaterial", editingMaterial);
    }

    canDeleteMaterial(): boolean {
        const manager = this.document.modelManager;
        const id = this.editingMaterial.id;
        const usesMaterial = (node: INode) => {
            const reference = (node as INode & { materialId?: string | string[] }).materialId;
            return Array.isArray(reference) ? reference.includes(id) : reference === id;
        };
        return (
            manager.materials.length > 1 &&
            !manager.findNode(usesMaterial) &&
            !manager.components.items().some((component) => component.nodes.some(usesMaterial))
        );
    }

    deleteMaterial() {
        if (!this.canDeleteMaterial()) return;
        const material = this.editingMaterial;
        const replacement = this.document.modelManager.materials.find((item) => item !== material);
        if (!replacement) return;
        this.editingMaterial = replacement;
        Transaction.execute(this.document, "Delete appearance", () => {
            this.document.modelManager.materials.remove(material);
        });
    }

    addMaterial() {
        this.addAppearance(
            new Material({
                document: this.document,
                name: `${I18n.translate("common.material")} ${count++}`,
                color: 0xdddddd,
            }),
        );
    }

    copyMaterial() {
        this.addAppearance(this.editingMaterial.clone());
    }

    private addAppearance(material: Material) {
        Transaction.execute(this.document, "Add appearance", () => {
            this.document.modelManager.materials.push(material);
        });
        this.editingMaterial = material;
    }
}
