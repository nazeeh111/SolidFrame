// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { InternalClassName } from "@chili3d/core";
import { createMockApplication } from "@chili3d/core/test-utils";
import { expect, rs, test } from "@rstest/core";
import { Document } from "../src/document";

test.each([
    { stage: "acts", cleanupThrows: false },
    { stage: "models", cleanupThrows: false },
    { stage: "acts", cleanupThrows: true },
    { stage: "models", cleanupThrows: true },
])("a failed restore removes its document and preserves the original error (%j)", async ({
    stage,
    cleanupThrows,
}) => {
    const app = createMockApplication();
    const original = new Document(app, "keep this document");
    const data = original.serialize();
    data["id"] = "failed-import";
    const unknown = { [InternalClassName]: "MissingLoadRecoveryType", id: "bad" };
    if (stage === "acts") data["acts"] = [unknown];
    else data["models"].nodes.push(unknown);
    const before = [...app.documents];
    const visuals: ReturnType<typeof app.visualFactory.create>[] = [];
    const create = app.visualFactory.create.bind(app.visualFactory);
    const spy = rs.spyOn(app.visualFactory, "create").mockImplementation((document) => {
        const visual = create(document);
        const dispose = rs.spyOn(visual, "dispose");
        if (cleanupThrows)
            dispose.mockImplementation(() => {
                throw new Error("Visual cleanup refused");
            });
        visuals.push(visual);
        return visual;
    });
    try {
        await expect(Document.load(app, data)).rejects.toThrow("MissingLoadRecoveryType");
        expect([...app.documents]).toEqual(before);
        expect(visuals).toHaveLength(1);
        expect(visuals[0].dispose).toHaveBeenCalledTimes(1);
    } finally {
        spy.mockRestore();
        rs.restoreAllMocks();
        for (const document of app.documents) document.dispose();
    }
});
