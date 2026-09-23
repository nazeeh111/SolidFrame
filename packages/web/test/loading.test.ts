// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Loading } from "../src/loading";

describe("SolidFrame loading state", () => {
    test("provides an accessible status while preparing the geometry workspace", () => {
        const loading = new Loading();
        expect(loading.getAttribute("role")).toBe("status");
        expect(loading.textContent).toContain("Preparing your modeling workspace");
        expect(loading.textContent).toContain("CAD calculations run in your browser");
    });

    test("failed startup shows its reason as text and offers a reload", () => {
        const loading = new Loading();
        loading.showError("Missing <kernel>");
        expect(loading.getAttribute("role")).toBe("alert");
        expect(loading.textContent).toContain("Missing <kernel>");
        expect(loading.querySelector("kernel")).toBeNull();
        const reload = loading.querySelector("button");
        expect(reload).not.toBeNull();
        expect(reload!.textContent).toBe("Reload workspace");
    });
});
