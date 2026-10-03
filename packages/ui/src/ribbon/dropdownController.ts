// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type CommandIcon,
    type CommandKeys,
    CommandStore,
    type I18nKeys,
    Localize,
    PubSub,
    type PushButton,
} from "@chili3d/core";
import { button, createIcon, div, label } from "@chili3d/element";

export interface DropdownItemData {
    command: CommandKeys;
    icon: CommandIcon;
    display: I18nKeys;
    onClick: () => void;
}

export function getItemData(item: PushButton | CommandKeys): DropdownItemData {
    if (typeof item === "string") {
        const data = CommandStore.getComandData(item);
        return {
            command: item,
            icon: data?.icon ?? ("icon-command" as CommandIcon),
            display: (data ? `command.${data.key}` : item) as I18nKeys,
            onClick: () => PubSub.default.pub("executeCommand", item),
        };
    }
    return {
        command: item.command,
        icon: item.icon as CommandIcon,
        display: item.display ?? (`command.${item.command}` as I18nKeys),
        onClick: item.onClick,
    };
}

export interface DropdownItemClasses {
    item: string;
    icon: string;
    text: string;
}

export function createDropdownItem(
    item: PushButton | CommandKeys,
    onSelect: () => void,
    classes: DropdownItemClasses,
): HTMLElement {
    const data = getItemData(item);
    const icon = data.icon ? createIcon(data.icon) : div();
    icon.classList.add(classes.icon);
    return button(
        {
            type: "button",
            role: "menuitem",
            tabIndex: -1,
            className: classes.item,
            onclick: (e) => {
                e.stopPropagation();
                PubSub.default.pub("executeCommand", data.command);
                onSelect();
            },
        },
        icon,
        label({
            className: classes.text,
            textContent: new Localize(data.display),
        }),
    );
}

export class DropdownController {
    static readonly openedDropdowns = new Set<DropdownController>();

    static closeAll(): void {
        for (const controller of DropdownController.openedDropdowns) {
            controller.close();
        }
    }

    #dropdown?: HTMLElement;
    #isOpened = false;
    #anchor?: HTMLElement;
    readonly #containerClass: string;

    constructor(containerClass: string) {
        this.#containerClass = containerClass;
    }

    get isOpened(): boolean {
        return this.#isOpened;
    }

    open(anchor: HTMLElement, buildItems: (dropdown: HTMLElement) => void): void {
        if (this.#isOpened || anchor.closest('[aria-disabled="true"], [inert]')) return;

        DropdownController.closeAll();
        const dropdown = div({ className: this.#containerClass, role: "menu" });
        buildItems(dropdown);

        document.body.appendChild(dropdown);
        this.#position(dropdown, anchor);
        this.#dropdown = dropdown;
        this.#anchor = anchor;
        anchor.setAttribute("aria-expanded", "true");
        this.#isOpened = true;
        DropdownController.openedDropdowns.add(this);

        document.addEventListener("click", this.#onOutsideClick);
        document.addEventListener("keydown", this.#onKeyDown);
        dropdown.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }

    close(restoreFocus = false): void {
        if (!this.#isOpened) return;

        this.#anchor?.setAttribute("aria-expanded", "false");
        if (restoreFocus) this.#anchor?.focus();
        this.#anchor = undefined;
        this.#dropdown?.remove();
        this.#dropdown = undefined;
        this.#isOpened = false;
        DropdownController.openedDropdowns.delete(this);

        document.removeEventListener("click", this.#onOutsideClick);
        document.removeEventListener("keydown", this.#onKeyDown);
    }

    dispose(): void {
        this.close();
    }

    #position(dropdown: HTMLElement, anchor: HTMLElement): void {
        const rect = anchor.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 2}px`;
        dropdown.style.width = `${rect.width}px`;
        const width = dropdown.getBoundingClientRect().width;
        dropdown.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - width - 4))}px`;
    }

    readonly #onOutsideClick = (e: Event) => {
        if (this.#dropdown && !this.#dropdown.contains(e.target as Node)) {
            this.close();
        }
    };

    readonly #onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            this.close(true);
            return;
        }
        if (!this.#dropdown?.contains(e.target as Node)) return;
        // Keep menu navigation separate from viewport selection and CAD shortcuts.
        e.stopPropagation();
        if (e.key === "Tab") {
            this.close(true);
            return;
        }
        const items = Array.from(this.#dropdown.querySelectorAll<HTMLElement>('[role="menuitem"]'));
        const index = items.indexOf(document.activeElement as HTMLElement);
        let next: number;
        if (e.key === "ArrowDown") next = (index + 1) % items.length;
        else if (e.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = items.length - 1;
        else return;
        e.preventDefault();
        items[next]?.focus();
    };
}
