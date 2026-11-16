// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { afterEach, expect, rs, test } from "@rstest/core";
import "./_helpers/mockCoreI18n";
import { confirmDocumentClose } from "../src/closeDocumentDialog";

afterEach(() => document.querySelectorAll("dialog").forEach((dialog) => dialog.remove()));

test("cancel and Escape leave the document open", async () => {
    const save = rs.fn(async () => {});
    const discard = rs.fn(async () => {});
    const result = confirmDocumentClose(document.body, "fixture", save, discard);
    const dialog = document.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelectorAll("button")).toHaveLength(3);
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(await result).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
    expect(document.querySelector("dialog")).toBeNull();
});

test("failure keeps the dialog open and allows cancellation", async () => {
    const failure = new Error("storage unavailable");
    const save = rs.fn(async () => {
        throw failure;
    });
    const result = confirmDocumentClose(document.body, "fixture", save, async () => {});
    const dialog = document.querySelector("dialog")!;
    const buttons = dialog.querySelectorAll("button");
    buttons[0].click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(save).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("storage unavailable");
    expect(buttons[2].disabled).toBe(false);
    buttons[2].click();
    expect(await result).toBe(false);
});

test("repeated clicks and Escape cannot interrupt an in-flight close", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
        release = resolve;
    });
    const save = rs.fn(() => pending);
    const result = confirmDocumentClose(document.body, "fixture", save, async () => {});
    const dialog = document.querySelector("dialog")!;
    const buttons = dialog.querySelectorAll("button");
    buttons[0].click();
    buttons[0].click();
    dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
    expect(Array.from(buttons).every((button) => button.disabled)).toBe(true);
    release();
    expect(await result).toBe(true);
    expect(document.querySelector("dialog")).toBeNull();
});
