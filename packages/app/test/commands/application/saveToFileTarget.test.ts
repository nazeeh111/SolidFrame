// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { DOCUMENT_FILE_EXTENSION, type IView, PubSub } from "@chili3d/core";
import { createMockApplication } from "@chili3d/core/test-utils";
import { SaveDocumentToFile } from "../../../src/commands/application/toFile";
import { Document as ProjectDocument } from "../../../src/document";

test.each([
    "switch",
    "clear",
    "same",
] as const)("save-to-file keeps its originating document when active view becomes %s during the delay", async (change) => {
    const app = createMockApplication();
    const first = new ProjectDocument(app, "First project", "first-id");
    const second = new ProjectDocument(app, "Second project", "second-id");
    first.userData = { source: "first-work" };
    second.userData = { source: "second-work" };
    const initialFirst = JSON.stringify(first.serialize());
    const initialSecond = JSON.stringify(second.serialize());
    const firstView = { document: first } as unknown as IView;
    const secondView = { document: second } as unknown as IView;
    app.activeView = firstView;
    const blobs: Blob[] = [];
    const names: string[] = [];
    let pending: Promise<void> | undefined;
    // The shipped Permanent.show subscriber starts its action synchronously too.
    const startAction = (action: () => Promise<void>) => {
        pending = action();
    };
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (value) => {
        blobs.push(value as Blob);
        return "blob:save-target-test";
    };
    URL.revokeObjectURL = () => {};
    rs.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        names.push(this.download);
    });
    PubSub.default.sub("showPermanent", startAction);
    rs.useFakeTimers();
    try {
        await new SaveDocumentToFile().execute(app);
        expect(pending).toBeDefined();
        await rs.advanceTimersByTimeAsync(20);
        if (change === "switch") app.activeView = secondView;
        if (change === "clear") app.activeView = undefined;
        await rs.advanceTimersByTimeAsync(80);
        await pending;
        expect(blobs).toHaveLength(1);
        const text = await blobs[0].text();
        expect(text).toBe(initialFirst);
        expect(names).toEqual([`First project${DOCUMENT_FILE_EXTENSION}`]);
        const exported = JSON.parse(text);
        expect(exported).toEqual(JSON.parse(initialFirst));
        expect(exported.id).toBe("first-id");
        expect(exported.userData).toEqual({ source: "first-work" });
        expect(JSON.stringify(first.serialize())).toBe(initialFirst);
        expect(JSON.stringify(second.serialize())).toBe(initialSecond);
        expect(app.activeView).toBe(
            change === "switch" ? secondView : change === "clear" ? undefined : firstView,
        );
    } finally {
        PubSub.default.remove("showPermanent", startAction);
        rs.useRealTimers();
        rs.restoreAllMocks();
        URL.createObjectURL = originalCreate;
        URL.revokeObjectURL = originalRevoke;
        first.dispose();
        second.dispose();
    }
});
