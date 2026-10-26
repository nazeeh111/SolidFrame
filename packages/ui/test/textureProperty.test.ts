// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// biome-ignore assist/source/organizeImports: import order is load-bearing — test-utils must load before the core-mock helper, and the helper before the module under test
import type { I18nKeys, Texture } from "@chili3d/core";
// test-utils must load BEFORE the core-mock helper so the real core module is
// fully cached by the time `rs.mock("@chili3d/core")` registers.
import { createMockDocument } from "@chili3d/core/test-utils";
import { beforeEach, describe, expect, test } from "@rstest/core";

// Mock CSS module under test
rs.mock("../src/property/textureProperty.module.css", () => ({
    root: "tx-root",
    expander: "tx-expander",
    properties: "tx-properties",
    image: "tx-image",
    preview: "tx-preview",
    remove: "tx-remove",
}));

// basicPropertyControl is replaced with a recording stub — it has its own test
// file (propertyControl.test.ts).
const basicControlMock = rs.hoisted(() =>
    rs.fn(() => {
        const el = document.createElement("div");
        el.className = "mock-basic-control";
        return el;
    }),
);

rs.mock("../src/property/basicPropertyControl", () => ({
    basicPropertyControl: basicControlMock,
}));

// Mock element helpers and core services
import "./_helpers/mockElement";
import { readFileAsyncMock } from "./_helpers/mockCoreTexture";

import { readFileAsync as readLocalFileAsync } from "../../core/src/foundation/utils/readFileAsync";
import { Result } from "../../core/src/foundation/result";
import { TextureProperty } from "../src/property/textureProperty";
import { mustQuery } from "./_helpers/domHelpers";

describe("TextureProperty", () => {
    const display = "test.texture" as I18nKeys;

    function createTexture() {
        return { image: "data:image/png;base64,old", wrapS: 1 } as unknown as Texture;
    }

    beforeEach(() => {
        basicControlMock.mockClear();
        readFileAsyncMock.mockReset();
    });

    describe("constructor", () => {
        test("should add the root style class", () => {
            const prop = new TextureProperty(createMockDocument(), display, createTexture());
            expect(prop.classList.contains("tx-root")).toBe(true);
        });

        test("should render controls for all texture properties except image", () => {
            const doc = createMockDocument();
            const texture = createTexture();
            const prop = new TextureProperty(doc, display, texture);

            // PropertyUtils stub returns wrapS + image; image is filtered out
            expect(basicControlMock).toHaveBeenCalledTimes(1);
            expect(basicControlMock).toHaveBeenCalledWith(
                doc,
                [texture],
                expect.objectContaining({ name: "wrapS" }),
            );
            mustQuery(prop, ".tx-properties");
        });

        test("should render the texture image and a remove icon", () => {
            const prop = new TextureProperty(createMockDocument(), display, createTexture());
            mustQuery(prop, ".tx-image .tx-preview");
            mustQuery(prop, ".tx-image .tx-remove");
        });
    });

    describe("image editing", () => {
        test("should preserve the texture when the real file helper receives cancel", async () => {
            readFileAsyncMock.mockImplementation(readLocalFileAsync);
            const texture = createTexture();
            const prop = new TextureProperty(createMockDocument(), display, texture);
            const img = mustQuery(prop, ".tx-image .tx-preview");
            const onclick = (img as unknown as { _onclick: () => Promise<void> })._onclick;
            const click = rs.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (
                this: HTMLInputElement,
            ) {
                this.dispatchEvent(new Event("cancel"));
            });
            try {
                await expect(onclick()).resolves.toBeUndefined();
                expect(click).toHaveBeenCalledTimes(1);
                expect(document.querySelector('input[type="file"]')).toBeNull();
                expect(texture.image).toBe("data:image/png;base64,old");
            } finally {
                click.mockRestore();
            }
        });

        test("should preserve the texture when file reading returns an error", async () => {
            readFileAsyncMock.mockResolvedValue(Result.err("could not read image"));
            const texture = createTexture();
            const prop = new TextureProperty(createMockDocument(), display, texture);
            const img = mustQuery(prop, ".tx-image .tx-preview");
            const onclick = (img as unknown as { _onclick: () => Promise<void> })._onclick;

            await expect(onclick()).resolves.toBeUndefined();
            expect(texture.image).toBe("data:image/png;base64,old");
        });

        test("should preserve the texture when the selected file list is empty", async () => {
            readFileAsyncMock.mockResolvedValue(Result.ok([]));
            const texture = createTexture();
            const prop = new TextureProperty(createMockDocument(), display, texture);
            const img = mustQuery(prop, ".tx-image .tx-preview");
            const onclick = (img as unknown as { _onclick: () => Promise<void> })._onclick;

            await expect(onclick()).resolves.toBeUndefined();
            expect(texture.image).toBe("data:image/png;base64,old");
        });

        test("should clear the texture image when the remove icon is clicked", () => {
            const texture = createTexture();
            const prop = new TextureProperty(createMockDocument(), display, texture);

            const icon = mustQuery(prop, ".tx-image .tx-remove");
            const onclick = (icon as unknown as { _onclick?: () => void })._onclick;
            expect(onclick).toBeDefined();
            onclick!();

            expect(texture.image).toBe("");
        });

        test("should assign the picked file data URL to the texture image", async () => {
            readFileAsyncMock.mockResolvedValue(
                Result.ok([{ fileName: "new.png", data: "data:image/png;base64,new" }]),
            );
            const texture = createTexture();
            const prop = new TextureProperty(createMockDocument(), display, texture);

            const img = mustQuery(prop, ".tx-image .tx-preview");
            const onclick = (img as unknown as { _onclick?: () => Promise<void> })._onclick;
            expect(onclick).toBeDefined();
            await onclick!();

            expect(readFileAsyncMock).toHaveBeenCalledWith(".png, .jpg, .jpeg", false, "readAsDataURL");
            expect(texture.image).toBe("data:image/png;base64,new");
        });
    });
});
