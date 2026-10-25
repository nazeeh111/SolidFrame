// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    AngleStep,
    AsyncController,
    type I18nKeys,
    LengthAtAxisStep,
    LengthAtPlaneStep,
    Plane,
    Precision,
    PubSub,
    Ray,
    type Result,
    type SnapData,
    type SnapEventHandler,
    XY,
    XYZ,
} from "@chili3d/core";
import {
    createHandlerMockView,
    createMockApplication,
    createMockSelection,
    createMockVisualWithDocument,
    createPointerEvent,
    TestDocument,
} from "@chili3d/core/test-utils";
import { afterEach, expect, test } from "@rstest/core";
import { Picker } from "../src/picker";

type Kind = "axis" | "plane" | "angle";
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
});

function fixture(kind: Kind, overrides: SnapData = {}) {
    const doc = new TestDocument({ application: createMockApplication(), selection: createMockSelection() });
    let nextMesh = 0;
    doc.visual = createMockVisualWithDocument(doc, { context: { displayMesh: () => ++nextMesh } });
    doc.picker = new Picker(doc);
    let missesPlane = false;
    const view = createHandlerMockView({
        document: doc,
        workplane: Plane.XY,
        up: () => XYZ.unitY,
        direction: () => XYZ.unitZ.reverse(),
        rayAt: (x, y) =>
            new Ray({
                point: new XYZ({ x, y, z: 100 }),
                direction: missesPlane ? XYZ.unitX : XYZ.unitZ.reverse(),
            }),
        screenToWorld: (x, y) => new XYZ({ x, y, z: 0 }),
        worldToScreen: (point) => new XY({ x: point.x, y: point.y }),
    });
    const previewPoints: (XYZ | undefined)[] = [];
    const data: SnapData = {
        validator: (point) => point.distanceTo(XYZ.zero) > Precision.Distance,
        preview: (point) => {
            previewPoints.push(point);
            return [];
        },
        ...overrides,
    };
    const step =
        kind === "axis"
            ? new LengthAtAxisStep("prompt.pickNextPoint", () => ({
                  ...data,
                  point: XYZ.zero,
                  direction: XYZ.unitY,
              }))
            : kind === "plane"
              ? new LengthAtPlaneStep("prompt.pickRadius", () => ({
                    ...data,
                    point: () => XYZ.zero,
                    plane: () => Plane.XY,
                }))
              : new AngleStep(
                    "prompt.pickNextPoint",
                    () => XYZ.zero,
                    () => XYZ.unitX,
                    () => ({ ...data, plane: () => Plane.XY }),
                );
    const controller = new AsyncController();
    const pending = step.execute(doc, controller);
    const handler = doc.visual.eventHandler as SnapEventHandler;
    const f = {
        doc,
        view,
        handler,
        controller,
        pending,
        previewPoints,
        missPlane: (miss: boolean) => {
            missesPlane = miss;
        },
    };
    cleanups.push(async () => {
        controller.cancel();
        await pending;
        controller.dispose();
    });
    return f;
}

function move(f: ReturnType<typeof fixture>, x: number, y: number) {
    f.handler.pointerMove(f.view, createPointerEvent({ offsetX: x, offsetY: y }));
}

test.each([
    "axis",
    "plane",
    "angle",
] as const)("%s step cannot accept an earlier point at a rejected pointer position", async (kind) => {
    const f = fixture(kind);
    move(f, 10, 10);
    expect(f.handler.snaped?.point?.distanceTo(XYZ.zero)).toBeGreaterThan(1);
    const previous = f.handler.snaped;
    move(f, 0, 0);
    f.handler.pointerDown(f.view, createPointerEvent({ offsetX: 0, offsetY: 0 }));
    expect(f.controller.result).toBeUndefined();
    expect(f.handler.snaped).toBe(previous);
    expect(f.previewPoints.at(-1)).toBeUndefined();
    move(f, 20, 20);
    const recovered = f.handler.snaped?.point;
    expect(recovered?.distanceTo(XYZ.zero)).toBeGreaterThan(10);
    f.handler.pointerDown(f.view, createPointerEvent({ offsetX: 20, offsetY: 20 }));
    expect((await f.pending)?.point).toBe(recovered);
});

test("a missing current ray cannot retain an earlier axis snap", async () => {
    const f = fixture("axis");
    move(f, 10, 10);
    expect(f.handler.snaped?.point?.y).toBeCloseTo(10);
    const previous = f.handler.snaped;
    f.missPlane(true);
    move(f, 20, 20);
    expect(f.handler.snaped).toBe(previous);
    f.handler.pointerDown(f.view, createPointerEvent());
    expect(f.controller.result).toBeUndefined();
    f.missPlane(false);
    move(f, 30, 30);
    f.handler.pointerDown(f.view, createPointerEvent());
    expect((await f.pending)?.point?.y).toBeCloseTo(30);
});

test("a disabled feature point does not survive when current candidates are rejected", () => {
    let active = true;
    const feature = new XYZ({ x: 5, y: 5, z: 0 });
    const f = fixture("plane", {
        featurePoints: [{ point: feature, prompt: "feature", when: () => active }],
    });
    move(f, 5, 5);
    expect(f.handler.snaped?.type).toBe("feature");
    expect(f.handler.snaped?.point).toBe(feature);
    const previous = f.handler.snaped;
    active = false;
    move(f, 0, 0);
    expect(f.handler.snaped).toBe(previous);
    expect(f.previewPoints.at(-1)).toBeUndefined();
    f.handler.pointerDown(f.view, createPointerEvent());
    expect(f.controller.result).toBeUndefined();
});

test.each([
    "axis",
    "plane",
    "angle",
] as const)("%s numeric input can recover from a syntax error and complete", async (kind) => {
    const f = fixture(kind);
    move(f, 10, 10);
    let submit: ((text: string) => Result<string, I18nKeys>) | undefined;
    const input = (_text: string, handler: NonNullable<typeof submit>) => {
        submit = handler;
    };
    PubSub.default.sub("showInput", input);
    try {
        f.handler.keyDown(f.view, { key: "5" } as KeyboardEvent);
        expect(submit).toBeDefined();
        if (submit === undefined) throw new Error("showInput callback not published");
        expect(submit("abc").isOk).toBe(false);
        expect(f.controller.result).toBeUndefined();
        expect(submit("5").isOk).toBe(true);
        const result = await f.pending;
        expect(result?.type).toBe(kind === "angle" ? "angle" : "input");
        expect(Number.isFinite(result?.point?.x)).toBe(true);
        expect(Number.isFinite(result?.point?.y)).toBe(true);
    } finally {
        PubSub.default.remove("showInput", input);
    }
});

function captureInput(f: ReturnType<typeof fixture>) {
    let submit: ((text: string) => Result<string, I18nKeys>) | undefined;
    const input = (_text: string, handler: NonNullable<typeof submit>) => {
        submit = handler;
    };
    PubSub.default.sub("showInput", input);
    f.handler.keyDown(f.view, { key: "5" } as KeyboardEvent);
    if (!submit) throw new Error("showInput callback not published");
    return { submit, dispose: () => PubSub.default.remove("showInput", input) };
}

test.each([
    "axis",
    "plane",
] as const)("%s retained direction supports distance input after rejected hover", async (kind) => {
    const f = fixture(kind);
    move(f, -10, -10);
    move(f, 0, 0);
    const input = captureInput(f);
    try {
        expect(input.submit("5").isOk).toBe(true);
        const result = await f.pending;
        expect(result?.point?.y).toBeLessThan(0);
        expect(result?.point?.distanceTo(XYZ.zero)).toBeCloseTo(5);
    } finally {
        input.dispose();
    }
});

test("plane coordinates retain the last quadrant after rejected hover", async () => {
    const f = fixture("plane");
    move(f, -10, -10);
    move(f, 0, 0);
    const input = captureInput(f);
    try {
        expect(input.submit("3,4").isOk).toBe(true);
        const result = await f.pending;
        expect(result?.point?.x).toBeCloseTo(-3);
        expect(result?.point?.y).toBeCloseTo(-4);
    } finally {
        input.dispose();
    }
});

test("plane coordinates are supported before hover", async () => {
    const f = fixture("plane");
    const input = captureInput(f);
    try {
        expect(input.submit("3,4").isOk).toBe(true);
        const result = await f.pending;
        expect(result?.point?.x).toBeCloseTo(3);
        expect(result?.point?.y).toBeCloseTo(4);
    } finally {
        input.dispose();
    }
});

test("typed angle is supported before hover", async () => {
    const f = fixture("angle");
    const input = captureInput(f);
    try {
        expect(input.submit("90").isOk).toBe(true);
        const result = await f.pending;
        expect(result?.point?.x).toBeCloseTo(0);
        expect(result?.point?.y).toBeCloseTo(1);
    } finally {
        input.dispose();
    }
});

test.each([
    "pointerOut",
    "Escape",
    "dispose",
] as const)("%s clears retained direction and current pointer acceptance", (action) => {
    const f = fixture("axis");
    move(f, -10, -10);
    expect(f.handler.snaped?.point?.y).toBeCloseTo(-10);
    if (action === "pointerOut") f.handler.pointerOut(f.view, createPointerEvent());
    else if (action === "Escape") f.handler.keyDown(f.view, { key: "Escape" } as KeyboardEvent);
    else f.handler.dispose();
    expect(f.handler.snaped).toBeUndefined();
    if (action === "Escape") expect(f.controller.result?.status).toBe("cancel");
    else {
        f.handler.pointerDown(f.view, createPointerEvent());
        expect(f.controller.result).toBeUndefined();
    }
});

test("a rejected pointer point cannot complete on primary touch release", async () => {
    const f = fixture("plane");
    move(f, 10, 10);
    move(f, 0, 0);
    f.handler.pointerUp(f.view, createPointerEvent({ pointerType: "touch", isPrimary: true }));
    expect(f.controller.result).toBeUndefined();
    move(f, 20, 20);
    f.handler.pointerUp(f.view, createPointerEvent({ pointerType: "touch", isPrimary: true }));
    expect((await f.pending)?.point?.x).toBeCloseTo(20);
});

test("a key-triggered preview does not restore the retained point after rejected hover", () => {
    let redraw: (() => void) | undefined;
    const f = fixture("plane", {
        onKeyDown: (_event, update) => {
            redraw = update;
        },
    });
    move(f, 10, 10);
    move(f, 0, 0);
    f.handler.keyDown(f.view, { key: "Shift" } as KeyboardEvent);
    if (!redraw) throw new Error("preview callback not supplied");
    redraw();
    expect(f.previewPoints.at(-1)).toBeUndefined();
    expect(f.controller.result).toBeUndefined();
});
