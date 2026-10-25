// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    AsyncController,
    type INodeVisual,
    type IWindow,
    Matrix4,
    NodeSelectionHandler,
    ShapeTypes,
    SubshapeSelectionHandler,
    type VisualShapeData,
    VisualStates,
} from "@chili3d/core";
import {
    createHandlerMockView,
    createMockApplication,
    createMockHighlighter,
    createMockVisualWithDocument,
    createPointerEvent,
    MockShape,
    TestDocument,
    TestNode,
} from "@chili3d/core/test-utils";
import { afterEach, expect, rs, test } from "@rstest/core";
import { Picker } from "../src/picker";
import { SelectionManager } from "../src/selectionManager";

type Kind = "node" | "shape";
const cleanups: (() => void)[] = [];

afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
});

function fixture() {
    const host = document.createElement("div");
    document.body.append(host);
    const application = { ...createMockApplication(), mainWindow: host as unknown as IWindow };
    const doc = new TestDocument({ application });
    const node = new TestNode();
    const shape = new MockShape({ shapeType: ShapeTypes.face });
    const disposeShape = rs.spyOn(shape, "dispose");
    const disposeOwner = rs.fn();
    const owner: INodeVisual = {
        node,
        locked: false,
        visible: true,
        transform: Matrix4.identity(),
        worldTransform: () => Matrix4.identity(),
        boundingBox: () => undefined,
        dispose: disposeOwner,
    };
    const data: VisualShapeData = { shape, owner, transform: Matrix4.identity(), indexes: [0] };
    const { highlighter, removeCalls } = createMockHighlighter();
    doc.visual = createMockVisualWithDocument(doc, {
        highlighter,
        context: { getNode: () => node, getVisual: () => owner },
    });
    doc.selection = new SelectionManager(doc);
    doc.picker = new Picker(doc);
    const view = createHandlerMockView({
        document: doc,
        detectVisual: () => [owner],
        detectVisualRect: () => [owner],
        detectShapes: () => [data],
        detectShapesRect: () => [data],
    });
    const handlers: (NodeSelectionHandler | SubshapeSelectionHandler)[] = [];
    const makeHandler = (kind: Kind, controller?: AsyncController) => {
        const handler =
            kind === "node"
                ? new NodeSelectionHandler(doc, true, controller)
                : new SubshapeSelectionHandler(doc, ShapeTypes.face, true, controller);
        handlers.push(handler);
        return handler;
    };
    const defaultHandler = makeHandler("node");
    doc.visual.defaultEventHandler = defaultHandler;
    doc.visual.eventHandler = defaultHandler;
    const selected = (kind: Kind) =>
        kind === "node" ? doc.selection.getSelectedNodes() : doc.selection.getSelectedShapes();
    const seed = (kind: Kind) => {
        if (kind === "node") doc.selection.setSelectedNodes([node], false);
        else doc.selection.setSelectedShapes([data], VisualStates.edgeSelected, false);
    };
    cleanups.push(() => {
        for (const handler of handlers) handler.dispose();
        doc.selection.dispose();
        host.remove();
        disposeShape.mockRestore();
    });
    return {
        doc,
        host,
        view,
        node,
        data,
        defaultHandler,
        makeHandler,
        selected,
        seed,
        removeCalls,
        disposeShape,
        disposeOwner,
    };
}

type Fixture = ReturnType<typeof fixture>;

function drag(f: Fixture, handler: NodeSelectionHandler | SubshapeSelectionHandler) {
    handler.pointerDown(f.view, createPointerEvent({ offsetX: 10, offsetY: 10, clientX: 10, clientY: 10 }));
    handler.pointerMove(
        f.view,
        createPointerEvent({
            offsetX: 40,
            offsetY: 40,
            clientX: 40,
            clientY: 40,
            buttons: 1,
        }),
    );
    expect(f.host.children).toHaveLength(1);
    const rect = f.host.firstElementChild as HTMLElement;
    expect(rect.style.display).toBe("block");
    expect(rect.isConnected).toBe(true);
    return rect;
}

function ordinaryGesture(f: Fixture, handler: NodeSelectionHandler | SubshapeSelectionHandler, kind: Kind) {
    f.doc.selection.clearSelection();
    const rect = drag(f, handler);
    handler.pointerUp(f.view, createPointerEvent());
    expect(rect.isConnected).toBe(false);
    expect(f.selected(kind)).toEqual([kind === "node" ? f.node : f.data]);
}

function keyboard(key: string) {
    return { key, preventDefault: rs.fn(), stopImmediatePropagation: rs.fn() };
}

const exits = (["node", "shape"] as const).flatMap((kind) =>
    (["success", "fail", "cancel"] as const).map((exit) => ({ kind, exit })),
);

test.each(
    exits,
)("external $exit removes a $kind pick rectangle before restoring the default handler", async ({
    kind,
    exit,
}) => {
    const f = fixture();
    const controller = new AsyncController();
    f.seed(kind);
    const pending =
        kind === "node"
            ? f.doc.picker.pickNode("prompt.select.shape", controller, { multi: true })
            : f.doc.picker.pickShape("prompt.select.shape", controller, {
                  multi: true,
                  shapeType: ShapeTypes.face,
              });
    const handler = f.doc.visual.eventHandler as NodeSelectionHandler | SubshapeSelectionHandler;
    const rect = drag(f, handler);
    const removals = f.removeCalls.length;
    controller[exit]();
    const result = await pending;
    expect(rect.isConnected).toBe(false);
    expect(f.host.children).toHaveLength(0);
    expect(f.doc.visual.eventHandler).toBe(f.defaultHandler);
    expect(result).toEqual(exit === "cancel" ? [] : [kind === "node" ? f.node : f.data]);
    expect(f.removeCalls.length - removals).toBe(exit === "cancel" ? 2 : 0);
    expect(f.disposeShape).not.toHaveBeenCalled();
    expect(f.disposeOwner).not.toHaveBeenCalled();
    ordinaryGesture(f, f.defaultHandler, "node");
    controller.dispose();
});

const accepts = (["node", "shape"] as const).flatMap((kind) => ["Enter", " "].map((key) => ({ kind, key })));

test.each(accepts)("keyboard $key accepts a $kind pick and removes its rectangle", async ({ kind, key }) => {
    const f = fixture();
    const controller = new AsyncController();
    f.seed(kind);
    const pending =
        kind === "node"
            ? f.doc.picker.pickNode("prompt.select.shape", controller, { multi: true })
            : f.doc.picker.pickShape("prompt.select.shape", controller, { multi: true });
    const handler = f.doc.visual.eventHandler as NodeSelectionHandler | SubshapeSelectionHandler;
    const rect = drag(f, handler);
    const event = keyboard(key);
    handler.keyDown(f.view, event as unknown as KeyboardEvent);
    expect(await pending).toEqual([kind === "node" ? f.node : f.data]);
    expect(rect.isConnected).toBe(false);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    ordinaryGesture(f, f.defaultHandler, "node");
    controller.dispose();
});

const defaults = (["node", "shape"] as const).flatMap((kind) =>
    ["Escape", "Enter", " "].map((key) => ({ kind, key })),
);

test.each(defaults)("default $kind handler ends its drag on $key and can select again", ({ kind, key }) => {
    const f = fixture();
    const handler = f.makeHandler(kind);
    f.doc.visual.defaultEventHandler = handler;
    f.doc.visual.eventHandler = handler;
    f.seed(kind);
    const rect = drag(f, handler);
    const event = keyboard(key);
    handler.keyDown(f.view, event as unknown as KeyboardEvent);
    expect(rect.isConnected).toBe(false);
    const expected = key === "Escape" ? [] : [kind === "node" ? f.node : f.data];
    expect(f.selected(kind)).toEqual(expected);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    handler.pointerMove(f.view, createPointerEvent({ buttons: 1 }));
    handler.pointerUp(f.view, createPointerEvent());
    expect(f.selected(kind)).toEqual(expected);
    ordinaryGesture(f, handler, kind);
});

test.each(["node", "shape"] as const)("disposing a %s handler removes its owned rectangle", (kind) => {
    const f = fixture();
    const handler = f.makeHandler(kind);
    const rect = drag(f, handler);
    handler.dispose();
    expect(rect.isConnected).toBe(false);
    expect(f.disposeShape).not.toHaveBeenCalled();
    expect(f.disposeOwner).not.toHaveBeenCalled();
    ordinaryGesture(f, f.makeHandler(kind), kind);
});

test.each(["node", "shape"] as const)("ordinary %s pointer-up removes its rectangle and selects", (kind) => {
    const f = fixture();
    ordinaryGesture(f, f.makeHandler(kind), kind);
});
