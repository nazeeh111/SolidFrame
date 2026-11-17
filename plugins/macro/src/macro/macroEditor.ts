// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Config,
    type DialogButton,
    I18n,
    type I18nKeys,
    type IApplication,
    Localize,
    PubSub,
} from "@chili3d/core";
import { button, div, input, label, span, textarea } from "@chili3d/element";
import { type AceApi, type AceEditor, loadAce } from "./aceLoader";
import style from "./macro.module.css";
import { runMacro } from "./macroRunner";
import type { MacroDefinition, MacroStorage } from "./macroStorage";

const DefaultCode = `// Available variables:
// app - IApplication instance
// You can access:
//   - app.activeView - current active view
//   - app.documents - all open documents
//   - app.visualFactory - visual factory
//   - app.storage - storage interface
//   - shapeFactory - shape factory

// Example: Create a simple box

// const { Plane, EditableShapeNode } = Chili3dCore;
// const { document, cameraController } = app.activeView;
// 
// const box = shapeFactory.box(Plane.XY, 1000, 1000, 1000);
// const node = new EditableShapeNode({
//     document, 
//     name: "box1",
//     shape: box
// });
// document.modelManager.addNode(node);
// cameraController.fitContent();
// document.visual.update();

alert("Hello from macro!");
`;

export class MacroEditor extends HTMLElement {
    private macro: MacroDefinition | undefined;
    private onSaveCallback: (() => void) | undefined;
    private nameInput: HTMLInputElement | null = null;
    private codeInput: HTMLTextAreaElement | null = null;
    private editorHost: HTMLDivElement | null = null;
    private status: HTMLSpanElement | null = null;
    private retryButton: HTMLButtonElement | null = null;
    private editor?: AceEditor;
    private ace?: AceApi;
    private generation = 0;
    private loading = false;

    constructor(
        readonly app: IApplication,
        readonly storage: MacroStorage,
    ) {
        super();
    }

    show(macro: MacroDefinition | undefined, onSave: () => void): void {
        this.macro = macro;
        this.onSaveCallback = onSave;

        this.createDom(macro);

        PubSub.default.pub(
            "showDialog",
            (macro ? "macro.editor.titleEdit" : "macro.editor.titleNew") as I18nKeys,
            this,
            this.buttons(),
        );
    }

    connectedCallback() {
        void this.loadEditor();
    }

    disconnectedCallback() {
        this.generation++;
        this.loading = false;
        if (this.editor && this.codeInput) this.codeInput.value = this.editor.getValue();
        this.editor?.destroy();
        this.editor = undefined;
    }

    private getCode(): string {
        return this.editor?.getValue() ?? this.codeInput?.value ?? "";
    }

    private async loadEditor(): Promise<void> {
        const status = this.status;
        const retryButton = this.retryButton;
        if (this.loading || this.editor || !this.isConnected || !status || !retryButton) return;
        this.loading = true;
        const generation = ++this.generation;
        status.textContent = I18n.translate("macro.editor.loading" as I18nKeys);
        retryButton.hidden = true;
        try {
            const ace = await loadAce();
            if (!this.isConnected || generation !== this.generation) return;
            this.ace = ace;
            status.textContent = "";
            if (document.activeElement === this.codeInput) {
                retryButton.textContent = I18n.translate("macro.editor.useRich" as I18nKeys);
                retryButton.hidden = false;
            } else {
                this.useEditor();
            }
        } catch {
            if (!this.isConnected || generation !== this.generation) return;
            status.textContent = I18n.translate("macro.editor.loadFailed" as I18nKeys);
            retryButton.textContent = I18n.translate("macro.editor.retry" as I18nKeys);
            retryButton.hidden = false;
        } finally {
            if (generation === this.generation) this.loading = false;
        }
    }

    private useEditor(focus = false) {
        const status = this.status;
        const retryButton = this.retryButton;
        if (!this.ace || !this.isConnected || !this.codeInput || !this.editorHost || !status || !retryButton)
            return;
        this.editorHost.textContent = this.codeInput.value;
        this.editorHost.hidden = false;
        try {
            this.editor = this.ace.edit(this.editorHost, {
                mode: "ace/mode/javascript",
                selectionStyle: "text",
            });
            this.editor.setTheme(this.isDarkTheme() ? "ace/theme/dracula" : "ace/theme/xcode");
            this.codeInput.hidden = true;
            retryButton.hidden = true;
            if (focus) this.editor.focus();
        } catch {
            this.editor?.destroy();
            this.editor = undefined;
            this.editorHost.hidden = true;
            status.textContent = I18n.translate("macro.editor.loadFailed" as I18nKeys);
            retryButton.textContent = I18n.translate("macro.editor.retry" as I18nKeys);
            retryButton.hidden = false;
            this.ace = undefined;
        }
    }

    private isDarkTheme() {
        const themeMode = Config.instance.themeMode;
        let theme: "light" | "dark";

        if (themeMode === "system") {
            theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        } else {
            theme = themeMode;
        }

        return theme === "dark";
    }

    private buttons(): DialogButton[] {
        return [
            {
                content: "macro.editor.run" as I18nKeys,
                onclick: async () => await runMacro(this.app, this.getCode()),
                shouldClose: () => false,
            },
            {
                content: "common.confirm",
                shouldClose: () => !!this.nameInput?.value.trim(),
                onclick: async () => await this.saveMacro(),
            },
            {
                content: "common.cancel",
            },
        ];
    }

    private createDom(macro: MacroDefinition | undefined) {
        this.nameInput = input({
            id: "macro-editor-name",
            className: style.input,
            value: macro?.name ?? "",
            placeholder: I18n.translate("macro.editor.namePlaceholder" as I18nKeys),
        });

        this.codeInput = textarea({
            id: "macro-editor-code-input",
            className: style.codeInput,
            value: macro?.code ?? DefaultCode,
            spellcheck: false,
            onkeydown: (e) => {
                if (e.key === "Enter") {
                    e.stopPropagation();
                }
            },
        });
        this.editorHost = div({ id: "macro-editor-code", className: style.codeEditor, hidden: true });
        this.status = span({ role: "status" });
        this.retryButton = button({
            type: "button",
            className: style.actionButton,
            hidden: true,
            onclick: () => {
                if (this.ace) this.useEditor(true);
                else void this.loadEditor();
            },
        });

        this.className = style.editorContainer;
        this.replaceChildren(
            div(
                { className: style.field },
                label({
                    htmlFor: "macro-editor-name",
                    className: style.inputLabel,
                    textContent: new Localize("macro.editor.name" as I18nKeys),
                }),
                this.nameInput,
            ),
            div(
                { className: style.field },
                label({
                    htmlFor: "macro-editor-code-input",
                    className: style.inputLabel,
                    textContent: new Localize("macro.editor.code" as I18nKeys),
                }),
                this.codeInput,
                this.editorHost,
                this.status,
                this.retryButton,
            ),
        );
    }

    private async saveMacro(): Promise<void> {
        const name = this.nameInput?.value.trim();
        if (!name) {
            alert(I18n.translate("macro.editor.nameRequired" as I18nKeys));
            return;
        }

        const code = this.getCode();
        await this.storage.saveMacro(name, code, this.macro?.id);
        this.onSaveCallback?.();
    }
}

customElements.define("macro-editor", MacroEditor);
