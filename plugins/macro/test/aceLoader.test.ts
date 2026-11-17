// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { afterEach, beforeEach, describe, expect, rs, test } from "@rstest/core";
import type { AceApi } from "../src/macro/aceLoader";

describe("Optional Ace delivery", () => {
    let scripts: HTMLScriptElement[];
    let previous: unknown;
    const scope = globalThis as typeof globalThis & { ace?: unknown };

    beforeEach(() => {
        rs.resetModules();
        scripts = [];
        previous = scope.ace;
        delete scope.ace;
        rs.spyOn(document.head, "appendChild").mockImplementation(<T extends Node>(node: T): T => {
            scripts.push(node as unknown as HTMLScriptElement);
            return node;
        });
    });

    afterEach(() => {
        if (previous === undefined) delete scope.ace;
        else scope.ace = previous;
        rs.restoreAllMocks();
    });

    function api(): AceApi {
        return {
            version: "1.44.0",
            config: { set: rs.fn((_key: string, _value: string) => undefined) },
            edit: rs.fn(() => ({
                getValue: () => "",
                setTheme: rs.fn((_theme: string) => undefined),
                destroy: rs.fn(),
                focus: rs.fn(),
            })),
        };
    }

    test("imports alone fetch nothing; concurrent requests share one pinned library", async () => {
        const { loadAce } = await import("../src/macro/aceLoader");
        expect(scripts).toHaveLength(0);
        const one = loadAce();
        const two = loadAce();
        expect(two).toBe(one);
        expect(scripts).toHaveLength(1);
        expect(scripts[0].src).toBe(
            "https://cdn.jsdelivr.net/npm/ace-builds@1.44.0/src-min-noconflict/ace.js",
        );
        const ace = api();
        scope.ace = ace;
        scripts[0].dispatchEvent(new Event("load"));
        await expect(one).resolves.toBe(ace);
        await expect(two).resolves.toBe(ace);
        expect(ace.config.set).toHaveBeenCalledWith(
            "basePath",
            "https://cdn.jsdelivr.net/npm/ace-builds@1.44.0/src-min-noconflict",
        );
        await expect(loadAce()).resolves.toBe(ace);
        expect(scripts).toHaveLength(1);
    });

    test("a failed download settles and a retry creates a new request to the same pinned URL", async () => {
        const { loadAce } = await import("../src/macro/aceLoader");
        const failed = loadAce();
        expect(scripts).toHaveLength(1);
        scripts[0].dispatchEvent(new Event("error"));
        await expect(failed).rejects.toThrow("could not be downloaded");
        const retried = loadAce();
        expect(retried).not.toBe(failed);
        expect(scripts).toHaveLength(2);
        expect(scripts[1].src).toBe(scripts[0].src);
        const ace = api();
        scope.ace = ace;
        scripts[1].dispatchEvent(new Event("load"));
        await expect(retried).resolves.toBe(ace);
    });

    test("a different existing Ace is reported without overwriting that global or fetching another", async () => {
        const existing = { ...api(), version: "1.0.0" };
        scope.ace = existing;
        const { loadAce } = await import("../src/macro/aceLoader");
        await expect(loadAce()).rejects.toThrow("different or incomplete syntax editor");
        expect(scope.ace).toBe(existing);
        expect(scripts).toHaveLength(0);
    });
});
