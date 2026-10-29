// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Binding,
    type I18nKeys,
    type IConverter,
    Localize,
    type Material,
    PathBinding,
    type Property,
    PropertyUtils,
    PubSub,
    Result,
    Texture,
} from "@chili3d/core";
import { button, ColorConverter, collection, div, span, svg, UrlStringConverter } from "@chili3d/element";
import { propertyControl } from "../complexPropertyUtils";
import type { MaterialDataContent } from "./materialDataContent";
import style from "./materialEditor.module.css";

class ActiveStyleConverter implements IConverter<Material> {
    constructor(readonly material: Material) {}

    convert(value: Material): Result<string> {
        return Result.ok(this.material === value ? `${style.material} ${style.active}` : style.material);
    }
}

export class MaterialEditor extends HTMLElement {
    private readonly editingControl: HTMLElement;
    private readonly colorConverter = new ColorConverter();
    private deleteButton?: HTMLButtonElement;

    constructor(readonly dataContent: MaterialDataContent) {
        super();
        this.editingControl = div({ className: style.properties });
        this.initEditingControl(dataContent.editingMaterial);
        this.append(this.createEditorUI());
        this.updateDeleteButton();
        this.addEventListener("keydown", (event) => {
            const documentShortcut =
                (event.ctrlKey || event.metaKey) && ["z", "y", "s"].includes(event.key.toLowerCase());
            if (!documentShortcut) event.stopPropagation();
        });
        this.addEventListener(
            "keydown",
            (event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                this.remove();
            },
            true,
        );
    }

    private createEditorUI() {
        return div(
            { className: style.root },
            this.titleSection(),
            div({ className: style.hint, textContent: new Localize("material.liveEdits") }),
            this.materialsCollection(),
            this.editingControl,
            this.buttons(),
        );
    }

    private titleSection() {
        this.deleteButton = this.iconButton("icon-trash", "material.deleteUnused", () => {
            this.dataContent.deleteMaterial();
        });
        return div(
            { className: style.title },
            span({ textContent: new Localize("common.material") }),
            this.iconButton("icon-plus", "material.add", () => this.dataContent.addMaterial()),
            this.iconButton("icon-clone", "common.clone", () => this.dataContent.copyMaterial()),
            this.deleteButton,
        );
    }

    private iconButton(icon: string, title: I18nKeys, onclick: () => void) {
        return button({ type: "button", title: new Localize(title), onclick }, svg({ icon }));
    }

    private updateDeleteButton() {
        if (this.deleteButton) this.deleteButton.disabled = !this.dataContent.canDeleteMaterial();
    }

    private readonly handleMaterialsChanged = () => {
        const materials = this.dataContent.document.modelManager.materials;
        if (!materials.contains(this.dataContent.editingMaterial)) {
            const fallback = materials.at(0);
            if (fallback) this.dataContent.editingMaterial = fallback;
            else this.remove();
        }
        this.updateDeleteButton();
    };

    private materialsCollection() {
        return collection({
            className: style.materials,
            sources: this.dataContent.document.modelManager.materials,
            template: (material: Material) => this.material(material),
        });
    }

    private material(material: Material) {
        return button({
            type: "button",
            className: new Binding(this.dataContent, "editingMaterial", new ActiveStyleConverter(material)),
            title: new Binding(material, "name"),
            style: {
                backgroundColor: new Binding(material, "color", this.colorConverter),
                backgroundImage: new PathBinding(material, "map.image", new UrlStringConverter()),
                backgroundBlendMode: "multiply",
                backgroundSize: "contain",
            },
            onclick: () => {
                this.dataContent.editingMaterial = material;
            },
            ondblclick: () => {
                this.dataContent.callback(material);
                this.remove();
            },
        });
    }

    private buttons() {
        return div(
            { className: style.bottom },
            button({
                textContent: new Localize("common.confirm"),
                onclick: () => {
                    this.dataContent.callback(this.dataContent.editingMaterial);
                    this.remove();
                },
            }),
            button({
                textContent: new Localize("common.close"),
                onclick: () => this.remove(),
            }),
        );
    }

    connectedCallback() {
        this.dataContent.onPropertyChanged(this._onEditingMaterialChanged);
        this.dataContent.document.modelManager.materials.onCollectionChanged(this.handleMaterialsChanged);
        PubSub.default.sub("showProperties", this._handleShowProperty);
    }

    disconnectedCallback() {
        this.dataContent.removePropertyChanged(this._onEditingMaterialChanged);
        this.dataContent.document.modelManager.materials.removeCollectionChanged(this.handleMaterialsChanged);
        PubSub.default.remove("showProperties", this._handleShowProperty);
    }

    private readonly _handleShowProperty = () => {
        this.remove();
    };

    private readonly _onEditingMaterialChanged = (property: keyof MaterialDataContent) => {
        if (property !== "editingMaterial") return;
        this.initEditingControl(this.dataContent.editingMaterial);
        this.updateDeleteButton();
    };

    private initEditingControl(material: Material) {
        this.editingControl.innerHTML = "";

        const isTexture = (p: Property) => {
            return (material as any)[p.name] instanceof Texture;
        };

        const regular: Property[] = [];
        const textures: Property[] = [];
        for (const property of PropertyUtils.getProperties(material)) {
            (isTexture(property) ? textures : regular).push(property);
        }
        this.editingControl.append(
            ...[...regular, ...textures].map((property) =>
                propertyControl(this.dataContent.document, [material], property),
            ),
        );
    }
}

customElements.define("material-editor", MaterialEditor);
