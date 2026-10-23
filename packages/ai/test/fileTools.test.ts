// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { FolderNode, VisualNode } from "@chili3d/core";
import { createMockApplication, createMockDocument } from "@chili3d/core/test-utils";
import { rs } from "@rstest/core";
import { buildFileTools } from "../src/tools/fileTools";

function visualNode(id: string, name: string) {
    const node = Object.create(VisualNode.prototype);
    Object.defineProperty(node, "id", { value: id });
    Object.defineProperty(node, "name", { value: name });
    return node;
}

describe("fileTools", () => {
    test("export_nodes exports the given nodes and downloads the file", async () => {
        const node = visualNode("n1", "box");
        const doc = createMockDocument();
        (doc.modelManager as any).findNodes = rs.fn(() => [node]);

        const app = createMockApplication();
        (app as any).activeView = { document: doc };
        (app as any).dataExchange = {
            exportFormats: () => [".step", ".stl"],
            export: rs.fn(async () => ["data"]),
        };
        rs.stubGlobal("app", app);
        const createObjectURL = URL.createObjectURL;
        const revokeObjectURL = URL.revokeObjectURL;
        URL.createObjectURL = rs.fn(() => "blob:mock") as any;
        URL.revokeObjectURL = rs.fn(() => {}) as any;

        try {
            const tool = buildFileTools().find((t) => t.name === "export_nodes")!;
            const result = JSON.parse((await tool.handler({ format: ".step", ids: ["n1"] })) as string);
            expect(result.ok).toBe(true);
            expect(result.filename).toBe("box.step");
            expect(app.dataExchange.export).toHaveBeenCalledWith(".step", [node]);
        } finally {
            URL.createObjectURL = createObjectURL;
            URL.revokeObjectURL = revokeObjectURL;
            rs.unstubAllGlobals();
        }
    });

    test("export_nodes appends the missing extension to a custom filename", async () => {
        const node = visualNode("n1", "box");
        const doc = createMockDocument();
        (doc.modelManager as any).findNodes = rs.fn(() => [node]);

        const app = createMockApplication();
        (app as any).activeView = { document: doc };
        (app as any).dataExchange = {
            exportFormats: () => [".step"],
            export: rs.fn(async () => ["data"]),
        };
        rs.stubGlobal("app", app);
        const createObjectURL = URL.createObjectURL;
        const revokeObjectURL = URL.revokeObjectURL;
        URL.createObjectURL = rs.fn(() => "blob:mock") as any;
        URL.revokeObjectURL = rs.fn(() => {}) as any;

        try {
            const tool = buildFileTools().find((t) => t.name === "export_nodes")!;
            const result = JSON.parse(
                (await tool.handler({ format: ".step", ids: ["n1"], filename: "part" })) as string,
            );
            expect(result.filename).toBe("part.step");
        } finally {
            URL.createObjectURL = createObjectURL;
            URL.revokeObjectURL = revokeObjectURL;
            rs.unstubAllGlobals();
        }
    });

    test("export_nodes rejects an unknown format and missing nodes", async () => {
        const doc = createMockDocument();
        (doc.modelManager as any).findNodes = rs.fn(() => []);

        const app = createMockApplication();
        (app as any).activeView = { document: doc };
        (app as any).dataExchange = {
            exportFormats: () => [".step"],
            export: rs.fn(async () => ["data"]),
        };
        rs.stubGlobal("app", app);

        try {
            const tool = buildFileTools().find((t) => t.name === "export_nodes")!;
            const badFormat = JSON.parse((await tool.handler({ format: ".obj", ids: ["n1"] })) as string);
            expect(badFormat.error).toContain("unknown format");
            const missing = JSON.parse((await tool.handler({ format: ".step", ids: ["n1"] })) as string);
            expect(missing.error).toContain("nodes not found");
            expect(app.dataExchange.export).not.toHaveBeenCalled();
        } finally {
            rs.unstubAllGlobals();
        }
    });
});

/** Tree fixtures keep this test at the export boundary; no CAD kernel or download is needed. */
async function exportScene(
    nodes: any[],
    root: object,
    ids: string[] | undefined,
): Promise<{ result: any; exported: unknown[][] }> {
    const doc = createMockDocument();
    (doc.modelManager as any).rootNode = root;
    (doc.modelManager as any).findNodes = (predicate: (node: unknown) => boolean) => nodes.filter(predicate);
    const exported: unknown[][] = [];
    const app = createMockApplication();
    (app as any).activeView = { document: doc };
    (app as any).dataExchange = {
        exportFormats: () => [".step"],
        export: async (_format: string, selected: unknown[]) => {
            exported.push(selected);
            return ["data"];
        },
    };
    rs.stubGlobal("app", app);
    const createObjectURL = URL.createObjectURL;
    const revokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = rs.fn(() => "blob:mock") as any;
    URL.revokeObjectURL = rs.fn(() => {}) as any;
    try {
        const result = JSON.parse((await buildFileTools()[0].handler({ format: ".step", ids })) as string);
        return { result, exported };
    } finally {
        URL.createObjectURL = createObjectURL;
        URL.revokeObjectURL = revokeObjectURL;
        rs.unstubAllGlobals();
    }
}

function folderNode(id: string, parent: object, children: unknown[]) {
    const folder = Object.create(FolderNode.prototype);
    Object.defineProperties(folder, {
        id: { value: id },
        name: { value: id },
        parent: { value: parent },
        children: { value: () => children },
    });
    return folder;
}

function withParent(node: unknown, parent: object) {
    Object.defineProperty(node, "parent", { value: parent });
    return node;
}

describe("export_nodes folder traversal", () => {
    test("default export includes nested folder contents alongside free nodes", async () => {
        const root = {};
        const nestedChildren: unknown[] = [];
        const folder = folderNode("folder", root, nestedChildren);
        const innerChildren: unknown[] = [];
        const inner = folderNode("inner", folder, innerChildren);
        const grouped = withParent(visualNode("grouped", "part"), inner);
        const free = withParent(visualNode("free", "free"), root);
        nestedChildren.push(inner);
        innerChildren.push(grouped);
        const { result, exported } = await exportScene([folder, inner, grouped, free], root, undefined);
        expect(result.nodes).toEqual(["grouped", "free"]);
        expect(exported).toEqual([[grouped, free]]);
    });

    test("explicit folder plus repeated child ids exports the child once", async () => {
        const root = {};
        const children: unknown[] = [];
        const folder = folderNode("folder", root, children);
        const child = withParent(visualNode("child", "part"), folder);
        children.push(child);
        const { result, exported } = await exportScene([folder, child], root, ["folder", "child", "child"]);
        expect(result.nodes).toEqual(["child"]);
        expect(exported).toEqual([[child]]);
    });

    test("stops at a visual body and does not add its consumed tool children", async () => {
        const root = {};
        const body = withParent(visualNode("body", "body"), root);
        const consumed = withParent(visualNode("tool", "tool"), body as object);
        Object.defineProperty(body, "children", { value: () => [consumed] });
        const { result, exported } = await exportScene([body, consumed], root, undefined);
        expect(result.nodes).toEqual(["body"]);
        expect(exported).toEqual([[body]]);
    });
});
