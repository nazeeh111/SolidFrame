// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type DialogButton, PubSub, type PubSubEventMap } from "@chili3d/core";
import { createMockApplication } from "@chili3d/core/test-utils";
import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import type { AceApi } from "../src/macro/aceLoader";
import { MacroEditor } from "../src/macro/macroEditor";
import type { MacroStorage } from "../src/macro/macroStorage";

const control = rs.hoisted(() => ({ load: rs.fn<() => Promise<AceApi>>() }));
rs.mock("../src/macro/aceLoader", () => ({ loadAce: control.load }));
rs.mock("../src/macro/macro.module.css", () => ({
    editorContainer: "editor",
    field: "field",
    inputLabel: "input-label",
    input: "input",
    codeInput: "code-input",
    codeEditor: "rich-editor",
    actionButton: "action",
}));

describe("Macro editor dependency lifecycle", () => {
    let buttons: DialogButton[];
    let resolve: (ace: AceApi) => void;
    let editor: MacroEditor;
    let richValue: string;
    let initialRichCode: string;
    const destroyed = rs.fn();
    const focused = rs.fn();
    const saved = rs.fn(async (_name: string, _code: string, _id?: string) => undefined);
    const onSave = rs.fn();
    const rich = {
        getValue: () => richValue,
        setTheme: rs.fn((_theme: string) => undefined),
        destroy: destroyed,
        focus: focused,
    };
    const ace: AceApi = {
        version: "1.44.0",
        config: { set: rs.fn((_key: string, _value: string) => undefined) },
        edit: rs.fn((host: HTMLElement) => {
            initialRichCode = host.textContent ?? "";
            richValue = initialRichCode;
            return rich;
        }),
    };
    const onDialog: PubSubEventMap["showDialog"] = (_title, content, choices) => {
        buttons = choices as DialogButton[];
        document.body.appendChild(content);
    };

    beforeEach(() => {
        rs.clearAllMocks();
        control.load.mockReset();
        control.load.mockImplementation(() => new Promise<AceApi>((done) => (resolve = done)));
        buttons = [];
        richValue = "";
        initialRichCode = "";
        PubSub.default.sub("showDialog", onDialog);
        editor = new MacroEditor(createMockApplication(), { saveMacro: saved } as unknown as MacroStorage);
    });

    afterEach(() => {
        document.body.replaceChildren();
        PubSub.default.remove("showDialog", onDialog);
        rs.restoreAllMocks();
    });

    function open() {
        editor.show(undefined, onSave);
        expect(editor.isConnected).toBe(true);
        expect(buttons).toHaveLength(3);
        const code = editor.querySelector<HTMLTextAreaElement>("#macro-editor-code-input");
        expect(code).not.toBeNull();
        return code!;
    }

    test("registration creates no editor request; the mounted dialog stays editable while loading", () => {
        expect(control.load).not.toHaveBeenCalled();
        const code = open();
        expect(control.load).toHaveBeenCalledTimes(1);
        code.value = "console.log('typed while loading');";
        expect(code.hidden).toBe(false);
        expect(code.disabled).toBe(false);
        expect(editor.querySelector('[role="status"]')?.textContent).toContain("macro.editor.loading");
    });

    test("an element attached before show does not request a library for an absent editor", () => {
        document.body.appendChild(editor);
        expect(editor.isConnected).toBe(true);
        expect(editor.querySelector("textarea")).toBeNull();
        expect(control.load).not.toHaveBeenCalled();
    });

    test("failure retains edits and retries without recreating the dialog", async () => {
        control.load.mockRejectedValueOnce(new Error("offline"));
        const code = open();
        code.value = "const unchanged = 7;";
        await rs.waitFor(() =>
            expect(editor.querySelector('[role="status"]')?.textContent).toContain("loadFailed"),
        );
        expect(code.value).toBe("const unchanged = 7;");
        expect(code.hidden).toBe(false);
        editor.querySelector<HTMLInputElement>("input")!.focus();
        editor.querySelector<HTMLButtonElement>("button")!.click();
        expect(control.load).toHaveBeenCalledTimes(2);
        resolve(ace);
        await rs.waitFor(() => expect(code.hidden).toBe(true));
        expect(initialRichCode).toBe("const unchanged = 7;");
        expect(editor.isConnected).toBe(true);
    });

    test("finishing a download does not switch the control underneath someone typing", async () => {
        const code = open();
        code.value = "const selected = 12;";
        code.focus();
        resolve(ace);
        await rs.waitFor(() => expect(editor.querySelector("button")?.textContent).toContain("useRich"));
        expect(code.hidden).toBe(false);
        expect(document.activeElement).toBe(code);
        expect(ace.edit).not.toHaveBeenCalled();
        editor.querySelector<HTMLButtonElement>("button")!.click();
        expect(initialRichCode).toBe("const selected = 12;");
        expect(code.hidden).toBe(true);
        expect(focused).toHaveBeenCalledTimes(1);
    });

    test("a late download after cancel does not create a rich editor or reattach content", async () => {
        const code = open();
        code.value = "const pending = 3;";
        editor.remove();
        resolve(ace);
        await rs.waitFor(() => expect(control.load.mock.results[0].value).resolves.toBe(ace));
        expect(ace.edit).not.toHaveBeenCalled();
        expect(editor.isConnected).toBe(false);
        expect(code.value).toBe("const pending = 3;");
    });

    test("close-before-confirm preserves the latest rich text before disposing the editor", async () => {
        open();
        editor.querySelector<HTMLInputElement>("input")!.value = "Saved macro";
        resolve(ace);
        await rs.waitFor(() => expect(ace.edit).toHaveBeenCalledTimes(1));
        richValue = "console.log('latest rich edit');";
        const confirm = buttons.find((button) => button.content === "common.confirm");
        expect(confirm).not.toBeUndefined();
        expect(confirm!.shouldClose!()).toBe(true);
        editor.remove();
        expect(destroyed).toHaveBeenCalledTimes(1);
        await confirm!.onclick!();
        expect(saved).toHaveBeenCalledWith("Saved macro", "console.log('latest rich edit');", undefined);
        expect(onSave).toHaveBeenCalledTimes(1);
    });

    test("close-before-confirm also saves the latest fallback text after a failed download", async () => {
        control.load.mockRejectedValueOnce(new Error("offline"));
        const code = open();
        editor.querySelector<HTMLInputElement>("input")!.value = "Plain macro";
        code.value = "console.log('latest fallback edit');";
        await rs.waitFor(() =>
            expect(editor.querySelector('[role="status"]')?.textContent).toContain("loadFailed"),
        );
        const confirm = buttons.find((button) => button.content === "common.confirm");
        expect(confirm).not.toBeUndefined();
        expect(confirm!.shouldClose!()).toBe(true);
        editor.remove();
        await confirm!.onclick!();
        expect(saved).toHaveBeenCalledWith("Plain macro", "console.log('latest fallback edit');", undefined);
        expect(destroyed).not.toHaveBeenCalled();
        expect(onSave).toHaveBeenCalledTimes(1);
    });

    test("a closed editor cannot attach or dispose the next editor sharing its pending library", async () => {
        const pending = new Promise<AceApi>((done) => (resolve = done));
        control.load.mockReturnValue(pending);
        open();
        editor.remove();
        const next = new MacroEditor(createMockApplication(), {
            saveMacro: saved,
        } as unknown as MacroStorage);
        next.show(undefined, onSave);
        expect(next.isConnected).toBe(true);
        resolve(ace);
        await rs.waitFor(() => expect(ace.edit).toHaveBeenCalledTimes(1));
        expect(next.querySelector<HTMLTextAreaElement>("textarea")?.hidden).toBe(true);
        expect(editor.isConnected).toBe(false);
        expect(destroyed).not.toHaveBeenCalled();
        next.remove();
        expect(destroyed).toHaveBeenCalledTimes(1);
    });
});
