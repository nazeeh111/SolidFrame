// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
import { PubSub } from "@chili3d/core";
import { createMockApplication } from "@chili3d/core/test-utils";
import { afterEach, expect, rs, test } from "@rstest/core";
import "../../../src/commands/application/openDocument";
import { Permanent } from "../../../../ui/src/permanent";
import { CommandService } from "../../../src/services/commandService";
import { HotkeyService } from "../../../src/services/hotkeyService";

const originalClick = HTMLInputElement.prototype.click;
const originalReader = globalThis.FileReader;
function stubReader(text: string) {
    class Reader {
        static DONE = 2;
        readyState = 2;
        result = text;
        onload: ((event: any) => void) | null = null;
        readAsText() {
            queueMicrotask(() => this.onload?.({ target: this }));
        }
    }
    globalThis.FileReader = Reader as unknown as typeof FileReader;
}
const command = new CommandService();
const hotkeys = new HotkeyService();
const app = createMockApplication();
const runningDialogs: Promise<void>[] = [];
const show = (action: () => Promise<void>, message: any, ...args: any[]) => {
    const result = Permanent.show(action, message, ...args);
    runningDialogs.push(result);
    return result;
};
afterEach(async () => {
    for (const input of document.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
        input.oncancel?.(new Event("cancel"));
    }
    await Promise.allSettled(runningDialogs);
    runningDialogs.length = 0;
    command.stop();
    hotkeys.stop();
    (app as any).mainWindow = undefined;
    HTMLInputElement.prototype.click = originalClick;
    globalThis.FileReader = originalReader;
    document.body.replaceChildren();
});

test("Open remains owned while picker is pending and ignores a second global shortcut", async () => {
    HTMLInputElement.prototype.click = () => {};
    command.register(app);
    command.start();
    hotkeys.register(app);
    hotkeys.start();
    (app as any).mainWindow = { showProgress: show };
    PubSub.default.pub("executeCommand", "doc.open");
    await rs.waitFor(() => expect(document.querySelectorAll('input[type="file"]').length).toBe(1));
    // Let the actual asynchronous dispatch chain settle before the second request.
    expect(app.executingCommand).toBeDefined();
    const blocked = new Promise<void>((resolve) =>
        PubSub.default.sub("showToast", function listener() {
            PubSub.default.remove("showToast", listener);
            resolve();
        }),
    );
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "o", ctrlKey: true, bubbles: true }));
    await blocked;
    expect(document.querySelectorAll('input[type="file"]').length).toBe(1);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    input.oncancel?.(new Event("cancel"));
    await rs.waitFor(() => expect(app.lastCommand).toBe("doc.open"));
    expect(app.executingCommand).toBeUndefined();
});

test("Open owns asynchronous loading after the picker change until load completes", async () => {
    HTMLInputElement.prototype.click = () => {};
    stubReader('{"name":"fixture"}');
    let release!: () => void;
    const loading = new Promise<void>((resolve) => {
        release = resolve;
    });
    let received: unknown;
    app.loadDocument = async (data) => {
        received = data;
        await loading;
        return undefined;
    };
    command.register(app);
    command.start();
    (app as any).mainWindow = { showProgress: show };
    PubSub.default.pub("executeCommand", "doc.open");
    await rs.waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull());
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['{"name":"fixture"}'], "fixture.cd", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file] });
    input.onchange?.(new Event("change"));
    try {
        await rs.waitFor(() => expect(received).toEqual({ name: "fixture" }));
        expect(app.executingCommand).toBeDefined();
        expect(document.querySelector("dialog")).not.toBeNull();
    } finally {
        release();
    }
    await rs.waitFor(() => expect(app.executingCommand).toBeUndefined());
    await Promise.all(runningDialogs);
    expect(document.querySelector("dialog")).toBeNull();
});

test("Open releases ownership and reports an asynchronous load failure", async () => {
    HTMLInputElement.prototype.click = () => {};
    stubReader("{}");
    app.loadDocument = async () => {
        throw new Error("fixture load failed");
    };
    const errors: unknown[] = [];
    const report = (error: unknown) => {
        errors.push(error);
    };
    PubSub.default.sub("displayError", report);
    try {
        command.register(app);
        command.start();
        (app as any).mainWindow = { showProgress: show };
        PubSub.default.pub("executeCommand", "doc.open");
        await rs.waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull());
        const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
        Object.defineProperty(input, "files", { value: [new File(["{}"], "fixture.cd")] });
        input.onchange?.(new Event("change"));
        await rs.waitFor(() => expect(errors.length).toBe(1));
        expect((errors[0] as Error).message).toBe("fixture load failed");
        await rs.waitFor(() => expect(app.executingCommand).toBeUndefined());
        await Promise.allSettled(runningDialogs);
        expect(document.querySelector("dialog")).toBeNull();
    } finally {
        PubSub.default.remove("displayError", report);
    }
});

test("Open reports a read failure and releases command ownership", async () => {
    HTMLInputElement.prototype.click = () => {};
    class FailedReader {
        onerror: (() => void) | null = null;
        readAsText() {
            queueMicrotask(() => this.onerror?.());
        }
    }
    globalThis.FileReader = FailedReader as unknown as typeof FileReader;
    const errors: unknown[] = [];
    const report = (error: unknown) => {
        errors.push(error);
    };
    PubSub.default.sub("displayError", report);
    try {
        command.register(app);
        command.start();
        (app as any).mainWindow = { showProgress: show };
        PubSub.default.pub("executeCommand", "doc.open");
        await rs.waitFor(() => expect(document.querySelector('input[type="file"]')).not.toBeNull());
        const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
        Object.defineProperty(input, "files", { value: [new File(["data"], "broken.cd")] });
        input.onchange?.(new Event("change"));
        await rs.waitFor(() => expect(errors.length).toBe(1));
        expect((errors[0] as Error).message).toContain(
            "Cannot read document: Error occurred reading file: broken.cd",
        );
        await rs.waitFor(() => expect(app.executingCommand).toBeUndefined());
    } finally {
        PubSub.default.remove("displayError", report);
    }
});
