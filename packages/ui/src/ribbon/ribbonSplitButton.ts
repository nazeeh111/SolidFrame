// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type ButtonSize, Localize, type SplitButton } from "@chili3d/core";
import { button, div, label, span } from "@chili3d/element";
import { createDropdownItem, DropdownController, getItemData } from "./dropdownController";
import buttonStyle from "./ribbonButton.module.css";
import { createRibbonIcon } from "./ribbonIcon";
import style from "./ribbonSplitButton.module.css";

export class RibbonSplitButton extends HTMLElement {
    static #nextId = 0;
    readonly #labelId = `ribbon-split-${++RibbonSplitButton.#nextId}`;
    #primaryIndex = 0;
    #dropdown = new DropdownController(style.dropdown);
    #iconEl?: Element;
    #textEl?: Element;
    #arrowEl?: HTMLButtonElement;

    constructor(
        readonly data: SplitButton,
        readonly size: ButtonSize,
    ) {
        super();
        this.initHTML();
    }

    dispose(): void {
        this.#dropdown.dispose();
    }

    private initHTML() {
        if (this.data.items.length === 0) return;

        const isLarge = this.size === "large";
        this.className = isLarge ? style.split : style.splitSmall;

        const { icon: iconName, display } = getItemData(this.data.items[0]);

        this.#iconEl = createRibbonIcon(iconName);
        this.#iconEl.classList.add(isLarge ? buttonStyle.icon : buttonStyle.smallIcon);

        this.#textEl = label({
            id: this.#labelId,
            className: isLarge ? style.text : style.smallText,
            textContent: new Localize(display),
        });

        this.#arrowEl = button(
            {
                type: "button",
                className: isLarge ? style.arrowButton : style.smallArrowButton,
                title: new Localize("common.more"),
                ariaHasPopup: "menu",
                ariaExpanded: "false",
                onclick: (e) => {
                    e.stopPropagation();
                    if (this.#dropdown.isOpened) this.#dropdown.close();
                    else this.openDropdown();
                },
                onkeydown: (e) => {
                    if (e.key === "ArrowDown") {
                        e.preventDefault();
                        e.stopPropagation();
                        this.openDropdown();
                    }
                },
            },
            span({
                id: `${this.#labelId}-more`,
                className: style.menuLabel,
                textContent: new Localize("common.more"),
            }),
            div({ className: isLarge ? style.arrow : style.smallArrow }),
        );
        this.#arrowEl.setAttribute("aria-labelledby", `${this.#labelId} ${this.#labelId}-more`);
        this.append(
            button(
                {
                    type: "button",
                    className: isLarge ? style.mainArea : style.smallMainArea,
                    onclick: (e) => {
                        e.stopPropagation();
                        this.executePrimary();
                    },
                },
                this.#iconEl,
                this.#textEl,
            ),
            this.#arrowEl,
        );
    }

    private executePrimary() {
        if (this.closest('[aria-disabled="true"], [inert]')) return;
        const item = this.data.items[this.#primaryIndex];
        if (!item) return;
        getItemData(item).onClick();
    }

    private openDropdown() {
        if (this.#dropdown.isOpened || this.data.items.length === 0 || !this.#arrowEl) return;

        this.#dropdown.open(this.#arrowEl, (dropdown) => {
            for (const [i, item] of this.data.items.entries()) {
                dropdown.append(
                    createDropdownItem(
                        item,
                        () => {
                            this.switchPrimary(i);
                            this.#dropdown.close();
                        },
                        {
                            item: style.dropdownItem,
                            icon: style.dropdownIcon,
                            text: style.dropdownText,
                        },
                    ),
                );
            }
        });
    }

    private switchPrimary(index: number) {
        if (index === this.#primaryIndex) return;
        this.#primaryIndex = index;

        const item = this.data.items[index];
        if (!item) return;

        const { icon: iconName, display } = getItemData(item);

        if (this.#iconEl) {
            const newIcon = createRibbonIcon(iconName);
            newIcon.classList.add(this.size === "large" ? buttonStyle.icon : buttonStyle.smallIcon);
            this.#iconEl.replaceWith(newIcon);
            this.#iconEl = newIcon;
        }

        if (this.#textEl) {
            const newText = label({
                id: this.#labelId,
                className: this.size === "large" ? style.text : style.smallText,
                textContent: new Localize(display),
            });
            this.#textEl.replaceWith(newText);
            this.#textEl = newText;
        }
    }
}

customElements.define("ribbon-split-button", RibbonSplitButton);
