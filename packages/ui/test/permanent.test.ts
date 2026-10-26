// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { afterEach, expect, rs, test } from "@rstest/core";

rs.mock("../src/permanent.module.css", () => ({}));

import { Permanent } from "../src/permanent";

afterEach(() => document.body.replaceChildren());

test("the loading dialog remains until the returned operation finishes", async () => {
    let finish: () => void = () => {};
    const action = new Promise<void>((resolve) => {
        finish = resolve;
    });
    let settled = false;
    const pending = Permanent.show(() => action, "common.confirm").then(() => {
        settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(document.querySelector("dialog")).not.toBeNull();
    finish();
    await pending;
    expect(settled).toBe(true);
    expect(document.querySelector("dialog")).toBeNull();
});

test("failed operations remove the loading dialog and propagate the error", async () => {
    const error = new Error("Could not open project");
    await expect(
        Permanent.show(async () => {
            throw error;
        }, "common.confirm"),
    ).rejects.toBe(error);
    expect(document.querySelector("dialog")).toBeNull();
});
