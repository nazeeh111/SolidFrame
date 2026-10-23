// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { expect, rs, test } from "@rstest/core";
import { FolderNode, InternalClassName, NodeUtils, Serializer } from "../src";
import { TestDocument } from "../test-utils";

test.each([
    false,
    true,
])("failed tree restoration attempts every returned node cleanup (%s)", async (cleanupThrows) => {
    const document = new TestDocument();
    const source = new FolderNode({ document, name: "root", id: "restore-root" });
    const data = NodeUtils.serializeNode(source);
    const child = new FolderNode({ document, name: "child", id: "restore-child" });
    data.push({ ...Serializer.serializeObject(child), parentId: source.id });
    data.push({ [InternalClassName]: "MissingTreeRecoveryType", id: "bad", parentId: source.id });
    const restored: FolderNode[] = [];
    const deserialize = Serializer.deserializeObject.bind(Serializer);
    const spy = rs.spyOn(Serializer, "deserializeObject").mockImplementation((document, data) => {
        const node = deserialize(document, data);
        if (node instanceof FolderNode) {
            restored.push(node);
            const dispose = rs.spyOn(node, "dispose");
            if (cleanupThrows && restored.length === 1) {
                dispose.mockImplementation(() => {
                    throw new Error("Root cleanup refused");
                });
            }
        }
        return node;
    });
    try {
        await expect(NodeUtils.deserializeNode(document, data)).rejects.toThrow("MissingTreeRecoveryType");
        expect(restored).toHaveLength(2);
        // The root owns its child. Idempotent disposal may revisit the child's wrapper,
        // but both real nodes must reach their cleanup path.
        for (const node of restored) expect(node.dispose).toHaveBeenCalled();
    } finally {
        spy.mockRestore();
        rs.restoreAllMocks();
        for (const node of restored) node.dispose();
        child.dispose();
        source.dispose();
        document.dispose();
        rs.restoreAllMocks();
    }
});
