// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { expect, rs, test } from "@rstest/core";
import { runStartupActions } from "../src/startupActions";

test("query plugins never execute, including through file aliases", async () => {
    const loadFromUrl = rs.fn(async (_url: string) => {});
    const loadFileFromUrl = rs.fn(async (_url: string) => {});
    const messages: string[] = [];
    const app = { pluginManager: { loadFromUrl }, loadFileFromUrl };
    for (const query of [
        "?plugin=https://example.test/code.js",
        "?url=https://example.test/code.chiliplugin",
        "?model=https://example.test/code.CHILIPLUGIN",
        "?url=javascript:alert(1)",
    ])
        await runStartupActions(app, query, (message) => messages.push(message));
    expect(loadFromUrl).not.toHaveBeenCalled();
    expect(loadFileFromUrl).not.toHaveBeenCalled();
    expect(messages).toHaveLength(4);
});

test("a model link still imports a supported file while plugin query parameters are ignored", async () => {
    const loaded: string[] = [];
    const app = {
        loadFileFromUrl: async (url: string) => {
            loaded.push(url);
        },
    };
    await runStartupActions(app, "?plugin=untrusted.js&url=https://example.test/part.step", () => {});
    expect(loaded).toEqual(["https://example.test/part.step"]);
});

test("failed remote model loading produces a user-facing recovery message", async () => {
    const app = {
        loadFileFromUrl: async (_url: string) => {
            throw new Error("Network unavailable");
        },
    };
    const messages: string[] = [];
    await runStartupActions(app, "?url=https://example.test/model.step", (message) => messages.push(message));
    expect(messages).toEqual([
        "The model link could not be opened. Check the address or import a local copy.",
    ]);
});
