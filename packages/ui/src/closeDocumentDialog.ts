// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { I18n } from "@chili3d/core";
import style from "./dialog.module.css";

/** Keep the modal open while a chosen operation completes; a failure can be retried or cancelled. */
export function confirmDocumentClose(
    host: HTMLElement,
    name: string,
    save: () => Promise<void>,
    discard: () => Promise<void>,
): Promise<boolean> {
    return new Promise((resolve) => {
        const dialog = document.createElement("dialog");
        const root = document.createElement("div");
        root.className = style.root;
        const heading = document.createElement("h2");
        heading.className = style.title;
        heading.textContent = I18n.translate("closeDocument.title");
        const content = document.createElement("div");
        content.className = style.content;
        const description = document.createElement("p");
        description.textContent = I18n.translate("closeDocument.message{0}", name);
        const error = document.createElement("p");
        error.setAttribute("role", "alert");
        content.append(description, error);
        const actions = document.createElement("div");
        actions.className = style.buttons;
        const saveButton = document.createElement("button");
        const discardButton = document.createElement("button");
        const cancelButton = document.createElement("button");
        for (const button of [saveButton, discardButton, cancelButton]) button.type = "button";
        saveButton.textContent = I18n.translate("closeDocument.save");
        discardButton.textContent = I18n.translate("closeDocument.discard");
        cancelButton.textContent = I18n.translate("common.cancel");
        actions.append(saveButton, discardButton, cancelButton);
        root.append(heading, content, actions);
        dialog.append(root);
        dialog.setAttribute("aria-label", I18n.translate("closeDocument.title"));
        host.append(dialog);
        let busy = false;
        let finished = false;
        const finish = (closed: boolean) => {
            if (finished) return;
            finished = true;
            dialog.close();
            dialog.remove();
            if (closed) host.focus();
            resolve(closed);
        };
        const run = async (operation: () => Promise<void>) => {
            if (busy || finished) return;
            busy = true;
            error.textContent = "";
            for (const button of [saveButton, discardButton, cancelButton]) button.disabled = true;
            try {
                await operation();
                finish(true);
            } catch (cause) {
                error.textContent = `${I18n.translate("closeDocument.failed")} ${cause instanceof Error ? cause.message : String(cause)}`;
                busy = false;
                for (const button of [saveButton, discardButton, cancelButton]) button.disabled = false;
                cancelButton.focus();
            }
        };
        saveButton.onclick = () => void run(save);
        discardButton.onclick = () => void run(discard);
        cancelButton.onclick = () => finish(false);
        dialog.addEventListener("cancel", (event) => {
            event.preventDefault();
            if (!busy) finish(false);
        });
        dialog.addEventListener("keydown", (event) => event.stopPropagation());
        dialog.showModal();
        cancelButton.focus();
    });
}
