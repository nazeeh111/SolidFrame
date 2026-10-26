// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Binding,
    type I18nKeys,
    type IDocument,
    Localize,
    PathBinding,
    PropertyUtils,
    Result,
    readFileAsync,
    type Texture,
} from "@chili3d/core";
import { button, div, Expander, svg, UrlStringConverter } from "@chili3d/element";
import { basicPropertyControl } from "./basicPropertyControl";
import style from "./textureProperty.module.css";

export class TextureProperty extends Expander {
    constructor(
        readonly document: IDocument,
        display: I18nKeys,
        readonly texture: Texture,
    ) {
        super(display);
        this.classList.add(style.root);
        this.append(this.render());
    }

    private render() {
        const properties = PropertyUtils.getProperties(this.texture)
            .filter((x) => (x.name as keyof Texture) !== "image")
            .map((x) => basicPropertyControl(this.document, [this.texture], x));

        return div(
            { className: style.expander },
            div({ className: style.properties }, ...properties),
            div(
                { className: style.image },
                button(
                    {
                        className: style.preview,
                        type: "button",
                        title: new Localize("material.texture.image"),
                        style: {
                            backgroundImage: new PathBinding(this.texture, "image", new UrlStringConverter()),
                        },
                        onclick: this.selectTexture,
                    },
                    svg({
                        icon: "icon-plus",
                        style: {
                            opacity: new Binding(this.texture, "image", {
                                convert: (image: string) => Result.ok(image ? "0" : "1"),
                            }),
                        },
                    }),
                ),
                button(
                    {
                        className: style.remove,
                        type: "button",
                        title: new Localize("common.delete"),
                        style: {
                            visibility: new Binding(this.texture, "image", {
                                convert: (image: string) => Result.ok(image ? "visible" : "hidden"),
                            }),
                        },
                        onclick: () => {
                            this.texture.image = "";
                        },
                    },
                    svg({ icon: "icon-times" }),
                ),
            ),
        );
    }

    private readonly selectTexture = async () => {
        const file = await readFileAsync(".png, .jpg, .jpeg", false, "readAsDataURL");
        if (!file.isOk || file.value.length === 0) return;
        this.texture.image = file.value[0].data;
    };
}

customElements.define("texture-editor", TextureProperty);
