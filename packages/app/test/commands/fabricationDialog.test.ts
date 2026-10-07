// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Result } from "@chili3d/core";
import { afterEach, beforeEach, expect, rs, test } from "@rstest/core";
import {
    defaultFabricationParameters,
    type FabricationParameters,
} from "../../src/bodys/fabricationParameters";
import { showFabricationDialog } from "../../src/commands/fabricationDialog";

function dialog(): HTMLDialogElement {
    return document.querySelector<HTMLDialogElement>("dialog[data-fabrication-dialog]")!;
}

function input(name: string): HTMLInputElement {
    return dialog().querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
}

function setNumber(name: string, value: string): void {
    input(name).value = value;
    input(name).dispatchEvent(new Event("input", { bubbles: true }));
}

function submit(): void {
    dialog()
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

beforeEach(() => {
    rs.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
        queueMicrotask(() => callback(0));
        return 1;
    });
});

afterEach(() => {
    for (const element of document.querySelectorAll("dialog")) element.close();
    document.body.replaceChildren();
    rs.unstubAllGlobals();
});

test("draft validation prevents submission, then correction submits and restores focus", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const callback = rs.fn(async () => Result.ok(true));
    const closed = showFabricationDialog(defaultFabricationParameters(), "create", callback);
    expect(document.activeElement).toBe(dialog().querySelector("select"));
    expect(dialog().textContent).toContain("fabrication.mm");
    setNumber("width", "10");
    expect(callback).not.toHaveBeenCalled();
    submit();
    expect(callback).not.toHaveBeenCalled();
    expect(dialog().open).toBe(true);
    expect(dialog().querySelector('[role="alert"]')?.textContent).toContain("clearance");
    setNumber("width", "120");
    submit();
    await closed;
    expect(callback).toHaveBeenCalledExactlyOnceWith({ ...defaultFabricationParameters(), width: 120 });
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
});

test("geometry failure retains the draft and permits a successful retry", async () => {
    const callback = rs.fn(async (): Promise<Result<boolean>> => Result.err("Kernel refused this part"));
    const closed = showFabricationDialog(defaultFabricationParameters(), "edit", callback);
    setNumber("length", "90");
    submit();
    await rs.waitFor(() =>
        expect(dialog().querySelector('[role="alert"]')?.textContent).toBe("Kernel refused this part"),
    );
    expect(input("length").value).toBe("90");
    expect(input("length").disabled).toBe(false);
    expect(input("vertical.rows").disabled).toBe(true);
    expect(document.activeElement).toBe(dialog().querySelector('[role="alert"]'));
    callback.mockResolvedValueOnce(Result.ok(true));
    submit();
    await closed;
    expect(callback).toHaveBeenCalledTimes(2);
});

test("busy submission blocks duplicate work and Escape cancellation until it finishes", async () => {
    let finish!: (result: Result<boolean>) => void;
    const callback = rs.fn(
        () =>
            new Promise<Result<boolean>>((resolve) => {
                finish = resolve;
            }),
    );
    const closed = showFabricationDialog(defaultFabricationParameters(), "create", callback);
    submit();
    await rs.waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
    expect(input("width").disabled).toBe(true);
    expect(dialog().querySelector("form")?.getAttribute("aria-busy")).toBe("true");
    submit();
    const cancel = new Event("cancel", { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
    finish(Result.ok(true));
    await closed;
});

test("bracket and hole toggles update the drawing and ignore inactive invalid values", async () => {
    const callback = rs.fn(async (_parameters: FabricationParameters) => Result.ok(true));
    const closed = showFabricationDialog(defaultFabricationParameters(), "create", callback);
    expect(dialog().querySelectorAll('svg[role="img"]')).toHaveLength(1);
    const kind = dialog().querySelector("select")!;
    kind.value = "bracket";
    kind.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input("height").disabled).toBe(false);
    expect(input("vertical.rows").disabled).toBe(false);
    expect(dialog().querySelectorAll('svg[role="img"]')).toHaveLength(2);
    setNumber("vertical.rows", "");
    input("vertical.enabled").click();
    expect(input("vertical.rows").disabled).toBe(true);
    expect(dialog().querySelector('[role="alert"]')?.textContent).toBe("");
    submit();
    await closed;
    expect(callback.mock.calls[0][0].vertical.enabled).toBe(false);
    expect(callback.mock.calls[0][0].kind).toBe("bracket");
});

test("cancel discards edits and document shortcuts do not receive input keys", async () => {
    const callback = rs.fn(async () => Result.ok(true));
    const shortcut = rs.fn();
    document.addEventListener("keydown", shortcut);
    try {
        const closed = showFabricationDialog(defaultFabricationParameters(), "create", callback);
        setNumber("width", "120");
        input("width").dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
        expect(shortcut).not.toHaveBeenCalled();
        dialog().querySelector<HTMLButtonElement>('button[type="button"]')!.click();
        await closed;
        expect(callback).not.toHaveBeenCalled();
    } finally {
        document.removeEventListener("keydown", shortcut);
    }
});
