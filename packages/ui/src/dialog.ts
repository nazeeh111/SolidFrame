// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type DialogButton, I18n, type I18nKeys } from "@chili3d/core";
import { button, div } from "@chili3d/element";
import style from "./dialog.module.css";

const DefaultButtons: DialogButton[] = [
    {
        content: "common.confirm",
    },
    {
        content: "common.cancel",
    },
];
let dialogSequence = 0;

export function showDialog(title: I18nKeys, content: HTMLElement, buttons?: DialogButton[] | (() => void)) {
    const dialog = document.createElement("dialog");
    const host = app.mainWindow ?? document.body;
    host.appendChild(dialog);
    renderDialog(dialog, title, content, combineButtons(buttons));
    dialog.showModal();
}

function renderDialog(
    dialog: HTMLDialogElement,
    title: I18nKeys,
    content: HTMLElement,
    combinedButtons: DialogButton[],
) {
    const closeDialog = () => {
        dialog.removeEventListener("keydown", handleKeyDown);
        dialog.close();
        dialog.remove();
    };
    const handleKeyDown = (e: KeyboardEvent) => handleDialogKeyDown(e, dialog, combinedButtons, closeDialog);
    dialog.addEventListener("keydown", handleKeyDown);
    const titleId = `solidframe-dialog-${++dialogSequence}-title`;
    dialog.setAttribute("aria-labelledby", titleId);
    dialog.append(createDialogContent(title, titleId, content, combinedButtons, closeDialog));
}

function handleDialogKeyDown(
    e: KeyboardEvent,
    dialog: HTMLDialogElement,
    buttons: DialogButton[],
    closeDialog: () => void,
) {
    // Modal editing must not reach modeling shortcuts such as Delete or Escape.
    e.stopPropagation();
    if (e.defaultPrevented || e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)
        return;
    if (e.key === "Enter") {
        // Let focused controls perform their own native action. In particular,
        // Enter on Cancel must never invoke a different button's callback.
        const target = e.target;
        if (
            target instanceof HTMLElement &&
            (target.isContentEditable || target.closest("button, a, textarea, select, [contenteditable]"))
        )
            return;
        const index = buttons.findIndex((btn) => btn.onclick && btn.content !== "common.cancel");
        if (index >= 0) {
            e.preventDefault();
            dialog.querySelectorAll<HTMLButtonElement>(`.${style.buttons} > button`)[index].click();
        }
    } else if (e.key === "Escape") {
        e.preventDefault();
        const cancelBtn = buttons.find((btn) => btn.content === "common.cancel");
        if (cancelBtn) {
            cancelBtn.onclick?.();
            closeDialog();
        }
    }
}

function createDialogContent(
    title: I18nKeys,
    titleId: string,
    content: HTMLElement,
    buttons: DialogButton[],
    closeDialog: () => void,
) {
    return div(
        { className: style.root },
        div({ className: style.title, id: titleId }, I18n.translate(title) ?? "SolidFrame"),
        div({ className: style.content }, content),
        div({ className: style.buttons }, ...buttons.map((btn) => createDialogButton(btn, closeDialog))),
    );
}

function createDialogButton(btn: DialogButton, closeDialog: () => void) {
    return button({
        textContent: I18n.translate(btn.content),
        onclick: async () => {
            if (btn.shouldClose?.() !== false) {
                closeDialog();
            }

            if (btn.onclick) {
                await btn.onclick();
            }
        },
    });
}

function combineButtons(buttons?: DialogButton[] | (() => void)): DialogButton[] {
    if (buttons === undefined) {
        return DefaultButtons;
    }

    if (Array.isArray(buttons)) {
        return buttons;
    }

    return [
        {
            content: "common.confirm",
            onclick: buttons,
        },
        {
            content: "common.cancel",
        },
    ];
}
