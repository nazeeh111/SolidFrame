// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type ButtonSize,
    type CommandData,
    type CommandIcon,
    type CommandKeys,
    CommandStore,
    Config,
    I18n,
    type I18nKeys,
    type IConverter,
    Localize,
    Logger,
    PubSub,
    Result,
    ShortcutProfiles,
} from "@chili3d/core";
import { label } from "@chili3d/element";
import style from "./ribbonButton.module.css";
import { createRibbonIcon } from "./ribbonIcon";

export class RibbonPushButton extends HTMLElement {
    #shortcut?: string;
    get shortcut() {
        return this.#shortcut;
    }

    constructor(
        readonly commandName: CommandKeys,
        icon: CommandIcon,
        size: ButtonSize,
        readonly onClick: () => void,
        display?: I18nKeys,
    ) {
        super();
        this.initHTML(display ?? `command.${commandName}`, icon, size);
        this.setAttribute("role", "button");
        this.tabIndex = 0;
        this.addEventListener("click", this.handleClick);
        this.addEventListener("keydown", this.handleKeyDown);
    }

    static fromCommandName(commandName: CommandKeys, size: ButtonSize) {
        const data = CommandStore.getComandData(commandName);
        if (!data) {
            Logger.warn(`commandData of ${commandName} is undefined`);
            return undefined;
        }
        if (data.toggle) {
            return new RibbonToggleButton(data, size);
        }

        return new RibbonPushButton(data.key, data.icon, size, () => {
            PubSub.default.pub("executeCommand", commandName);
        });
    }

    dispose(): void {
        this.removeEventListener("click", this.handleClick);
        this.removeEventListener("keydown", this.handleKeyDown);
    }

    private readonly handleClick = () => {
        if (!this.closest('[aria-disabled="true"], [inert]')) this.onClick();
    };

    private readonly handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) this.click();
    };

    private initHTML(display: I18nKeys, icon: CommandIcon, size: ButtonSize) {
        const image = createRibbonIcon(icon);
        this.className = size === "large" ? style.normal : style.small;
        image.classList.add(size === "large" ? style.icon : style.smallIcon);
        const text = label({
            className: size === "large" ? style.largeButtonText : style.smallButtonText,
            textContent: new Localize(display),
        });

        I18n.set(this, "title", display);
        this.updateShortcut();

        this.append(image, text);
    }

    updateShortcut() {
        const shortcutData = ShortcutProfiles[Config.instance.navigation3D][this.commandName];
        const shortcut = Array.isArray(shortcutData) ? shortcutData.join("; ") : shortcutData;

        if (shortcut) {
            if (this.#shortcut) {
                this.title = this.title.replace(this.#shortcut, shortcut);
            } else {
                this.title += ` (${shortcut})`;
            }
            this.#shortcut = shortcut;
        } else if (this.#shortcut) {
            this.title = this.title.replace(this.#shortcut, "");
            this.#shortcut = undefined;
        }
    }
}

customElements.define("ribbon-button", RibbonPushButton);

class ToggleConverter implements IConverter {
    constructor(
        readonly className: string,
        readonly active: string,
    ) {}
    convert(isChecked: boolean): Result<string, string> {
        return isChecked ? Result.ok(`${this.className} ${this.active}`) : Result.ok(this.className);
    }
}

export class RibbonToggleButton extends RibbonPushButton {
    constructor(data: CommandData, size: ButtonSize) {
        super(data.key, data.icon, size, () => {
            PubSub.default.pub("executeCommand", data.key);
        });

        if (data.toggle) {
            data.toggle.converter = new ToggleConverter(this.className, style.checked);
            data.toggle.setBinding(this, "className");
        }
    }
}

customElements.define("ribbon-toggle-button", RibbonToggleButton);
