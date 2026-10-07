// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { PubSub, Result } from "@chili3d/core";
import {
    createMockApplication,
    createMockDocument,
    createMockView,
    MockShape,
    TestDocument,
} from "@chili3d/core/test-utils";
import { afterEach, beforeEach, expect, rs, test } from "@rstest/core";
import { defaultFabricationParameters } from "../../src/bodys/fabricationParameters";
import * as fabricationPart from "../../src/bodys/fabricationPart";
import { FabricationPartNode } from "../../src/bodys/fabricationPart";
import { CreateFabricationPart, EditFabricationPart } from "../../src/commands/fabrication";
import { showFabricationDialog } from "../../src/commands/fabricationDialog";

rs.mock("../../src/commands/fabricationDialog", () => ({ showFabricationDialog: rs.fn() }));
const show = rs.mocked(showFabricationDialog);
const build = rs.fn<typeof fabricationPart.buildFabricationShape>();
const documents: TestDocument[] = [];

function context() {
    const app = createMockApplication();
    const selection = createMockDocument().selection;
    const document = new TestDocument({ application: app, selection });
    documents.push(document);
    app.documents.add(document);
    app.activeView = createMockView({ document });
    app.activeView.cameraController.fitContent = rs.fn();
    app.newDocument = rs.fn(async () => document);
    return { app, document };
}

function submit() {
    return show.mock.calls[0][2](defaultFabricationParameters());
}

beforeEach(() => {
    show.mockReset().mockResolvedValue(undefined);
    build.mockReset();
    rs.spyOn(fabricationPart, "buildFabricationShape").mockImplementation(build);
});

afterEach(() => {
    for (const document of documents.splice(0)) document.dispose();
    rs.restoreAllMocks();
});

test("creation cancels without allocating a document or building geometry", async () => {
    const app = createMockApplication();
    app.newDocument = rs.fn();
    await new CreateFabricationPart().execute(app);
    expect(app.newDocument).not.toHaveBeenCalled();
    expect(build).not.toHaveBeenCalled();
});

test("a rejected shape does not create an empty document", async () => {
    const app = createMockApplication();
    app.newDocument = rs.fn();
    build.mockReturnValue(Result.err("Kernel refused this part"));
    await new CreateFabricationPart().execute(app);
    expect((await submit()).error).toBe("Kernel refused this part");
    expect(app.newDocument).not.toHaveBeenCalled();
});

test("creation reuses the active document, owns the prebuilt shape, and adds one undo step", async () => {
    const { app, document } = context();
    const candidate = new MockShape();
    build.mockReturnValue(Result.ok(candidate));
    const select = rs.spyOn(document.selection, "setSelectedNodes");
    await new CreateFabricationPart().execute(app);
    expect((await submit()).value).toBe(true);
    const nodes = document.modelManager.findNodes();
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toBeInstanceOf(FabricationPartNode);
    expect((nodes[0] as FabricationPartNode).shape.value).toBe(candidate);
    expect(build).toHaveBeenCalledTimes(1);
    expect(app.newDocument).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith([nodes[0]], false);
    expect(document.history.undoCount()).toBe(1);
    document.history.undo();
    expect(document.modelManager.findNodes()).toHaveLength(0);
    document.history.redo();
    expect(document.modelManager.findNodes()).toEqual(nodes);
});

test("home creation builds before allocating its first document", async () => {
    const { app, document } = context();
    app.activeView = undefined;
    const calls: string[] = [];
    build.mockImplementation(() => {
        calls.push("build");
        return Result.ok(new MockShape());
    });
    app.newDocument = rs.fn(async () => {
        calls.push("document");
        return document;
    });
    await new CreateFabricationPart().execute(app);
    expect((await submit()).value).toBe(true);
    expect(calls).toEqual(["build", "document"]);
    expect(app.newDocument).toHaveBeenCalledExactlyOnceWith("fabrication.documentName");
});

test("document creation failure disposes the unused candidate", async () => {
    const app = createMockApplication();
    const candidate = new MockShape();
    const dispose = rs.spyOn(candidate, "dispose");
    build.mockReturnValue(Result.ok(candidate));
    app.newDocument = rs.fn(async () => {
        throw new Error("Document unavailable");
    });
    await new CreateFabricationPart().execute(app);
    expect((await submit()).isOk).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(1);
});

test("closing the target document while drafting prevents creation", async () => {
    const { app, document } = context();
    await new CreateFabricationPart().execute(app);
    app.documents.delete(document);
    expect((await submit()).error).toBe("fabrication.documentClosed");
    expect(build).not.toHaveBeenCalled();
    expect(app.newDocument).not.toHaveBeenCalled();
});

test("editing requires exactly one mechanical part, including nonvisual selections", async () => {
    const { app, document } = context();
    const toast = rs.spyOn(PubSub.default, "pub");
    const part = new FabricationPartNode({ document, initialShape: new MockShape() });
    document.modelManager.addNode(part);
    document.selection.getSelectedNodes = () => [part, document.modelManager.rootNode];
    await new EditFabricationPart().execute(app);
    expect(show).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("showToast", "fabrication.selectPart");
});

test("edit failure is returned to the open draft; an unchanged valid edit succeeds", async () => {
    const { app, document } = context();
    const part = new FabricationPartNode({ document, initialShape: new MockShape() });
    document.modelManager.addNode(part);
    document.selection.getSelectedNodes = () => [part];
    const apply = rs.spyOn(part, "applyParameters").mockReturnValueOnce(Result.err("Invalid geometry"));
    await new EditFabricationPart().execute(app);
    expect(show.mock.calls[0][1]).toBe("edit");
    expect((await submit()).error).toBe("Invalid geometry");
    apply.mockReturnValueOnce(Result.ok(false));
    expect((await submit()).value).toBe(true);
    app.documents.delete(document);
    expect((await submit()).error).toBe("fabrication.documentClosed");
    expect(apply).toHaveBeenCalledTimes(2);
});
