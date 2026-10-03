// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { describe, expect, test } from "@rstest/core";

rs.mock("../src/ribbon/ribbonButton.module.css", () => ({ builtInIcon: "builtin-command-icon" }));

import { createRibbonIcon } from "../src/ribbon/ribbonIcon";

describe("ribbon icon treatment", () => {
    test("marks built-in symbols without replacing their geometry", () => {
        const icon = createRibbonIcon("icon-box");
        expect(icon.classList.contains("builtin-command-icon")).toBe(true);
        const use = icon.querySelector("use");
        expect(use).not.toBeNull();
        expect(use?.getAttributeNS("http://www.w3.org/1999/xlink", "href")).toBe("#icon-box");
    });

    test("keeps custom SVG artwork and colors unchanged", () => {
        const icon = createRibbonIcon({
            type: "svg",
            value: '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#e52a78" d="M0 0h10v10z"/></svg>',
        });
        expect(icon.classList.contains("builtin-command-icon")).toBe(false);
        const path = icon.querySelector("path");
        expect(path).not.toBeNull();
        expect(path?.getAttribute("fill")).toBe("#e52a78");
        expect(path?.getAttribute("d")).toBe("M0 0h10v10z");
    });

    test("keeps plugin URL icons outside the built-in treatment", () => {
        const icon = createRibbonIcon({ type: "url", value: "https://example.invalid/plugin/icon.svg" });
        expect(icon.tagName.toLowerCase()).toBe("img");
        expect(icon.getAttribute("src")).toBe("https://example.invalid/plugin/icon.svg");
        expect(icon.classList.contains("builtin-command-icon")).toBe(false);
    });

    test("preserves plugin PNG bytes without applying the built-in treatment", () => {
        const icon = createRibbonIcon({ type: "png", value: new Uint8Array([137, 80, 78, 71]) });
        expect(icon.getAttribute("src")).toBe("data:image/png;base64,iVBORw==");
        expect(icon.classList.contains("builtin-command-icon")).toBe(false);
    });
});
