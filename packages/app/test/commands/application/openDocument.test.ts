// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.
import { createMockApplication } from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import { OpenDocument } from "../../../src/commands/application/openDocument";

describe("OpenDocument", () => {
    test("has application-command metadata", () => {
        const data = (OpenDocument as any).prototype.data;
        expect(data.key).toBe("doc.open");
        expect(data.icon).toBe("icon-open");
        expect(data.isApplicationCommand).toBe(true);
    });
    test("rejects when progress display is unavailable", async () => {
        await expect(new OpenDocument().execute(createMockApplication())).rejects.toThrow(
            "progress display is unavailable",
        );
    });
    test("propagates a progress presentation failure before opening a picker", async () => {
        const app = createMockApplication();
        (app as any).mainWindow = {
            showProgress: async () => {
                throw new Error("dialog unavailable");
            },
        };
        await expect(new OpenDocument().execute(app)).rejects.toThrow("dialog unavailable");
        expect(document.querySelector('input[type="file"]')).toBeNull();
    });
});
