// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { EditableShapeNode, type ISolid, Result, Serializer, ShapeTypes, XYZ } from "@chili3d/core";
import { TestDocument } from "@chili3d/core/test-utils";
import { OccShapeConverter, ShapeFactory } from "@chili3d/wasm";
import { afterEach, beforeEach, expect, rs, test } from "@rstest/core";
import "../../../wasm/test/setup";
import {
    defaultFabricationParameters,
    type FabricationParameters,
    fabricationHoleCenters,
    validateFabricationParameters,
} from "../../src/bodys/fabricationParameters";
import { buildFabricationShape, FabricationPartNode } from "../../src/bodys/fabricationPart";

beforeEach(() => {
    rs.stubGlobal("shapeFactory", new ShapeFactory());
});
afterEach(() => {
    rs.unstubAllGlobals();
    rs.restoreAllMocks();
});

function expectedVolume(p: FabricationParameters): number {
    const blank =
        p.kind === "plate"
            ? p.width * p.length * p.thickness
            : p.width * p.thickness * (p.length + p.height - p.thickness);
    return (
        blank -
        ["horizontal", "vertical"].reduce((total, flange) => {
            const f = flange as "horizontal" | "vertical";
            return (
                total + fabricationHoleCenters(p, f).length * Math.PI * (p[f].diameter / 2) ** 2 * p.thickness
            );
        }, 0)
    );
}

test.each([
    "plate",
    "bracket",
] as const)("%s is a valid closed solid with analytical volume and through holes", (kind) => {
    const p = defaultFabricationParameters(kind);
    const built = buildFabricationShape(p);
    expect(built.isOk, built.isOk ? "" : built.error).toBe(true);
    const solid = built.value as ISolid;
    try {
        expect(solid.shapeType).toBe(ShapeTypes.solid);
        expect(solid.checkShape()).toBe(true);
        const shells = solid.findSubShapes(ShapeTypes.shell);
        expect(shells.length).toBeGreaterThan(0);
        expect(shells.every((shell) => shell.isClosed())).toBe(true);
        shells.forEach((shell) => shell.dispose());
        expect(solid.volume()).toBeCloseTo(expectedVolume(p), 5);
        for (const flange of ["horizontal", "vertical"] as const) {
            for (const center of fabricationHoleCenters(p, flange)) {
                const point =
                    flange === "horizontal"
                        ? new XYZ({ x: center.x, y: center.y, z: p.thickness / 2 })
                        : new XYZ({ x: center.x, y: p.thickness / 2, z: center.y });
                expect(solid.containsPoint(point, false, 1e-7)).toBe(false);
            }
        }
        expect(solid.containsPoint(new XYZ({ x: 1, y: 1, z: 1 }), false, 1e-7)).toBe(true);
    } finally {
        solid.dispose();
    }
});

test.each([
    ["nonfinite dimension", { width: Number.NaN }],
    ["infinite dimension", { length: Number.POSITIVE_INFINITY }],
    ["zero stock", { thickness: 0 }],
    ["excessive dimension", { width: 2001 }],
    ["fractional rows", { horizontal: { ...defaultFabricationParameters().horizontal, rows: 1.5 } }],
    ["touching holes", { horizontal: { ...defaultFabricationParameters().horizontal, pitchX: 8 } }],
    ["touching edge", { horizontal: { ...defaultFabricationParameters().horizontal, pitchX: 92 } }],
    [
        "too many holes",
        {
            width: 1000,
            length: 1000,
            horizontal: { ...defaultFabricationParameters().horizontal, rows: 5, columns: 7 },
        },
    ],
    ["string dimension", { width: "100" }],
    ["invalid kind", { kind: "sphere" }],
])("rejects %s before entering the kernel", (_name, patch) => {
    const box = rs.spyOn(shapeFactory, "box");
    const result = buildFabricationShape({ ...defaultFabricationParameters(), ...patch });
    expect(result.isOk).toBe(false);
    expect(box).not.toHaveBeenCalled();
});

test("bracket grids clear the corner and the total hole limit covers both flanges", () => {
    const p = defaultFabricationParameters("bracket");
    expect(validateFabricationParameters({ ...p, length: 10 }).isOk).toBe(false);
    expect(validateFabricationParameters({ ...p, height: p.thickness }).isOk).toBe(false);
    expect(
        validateFabricationParameters({
            ...p,
            width: 1000,
            length: 1000,
            height: 1000,
            horizontal: { ...p.horizontal, rows: 4, columns: 5 },
            vertical: { ...p.vertical, rows: 4, columns: 4 },
        }).isOk,
    ).toBe(false);
    const centers = fabricationHoleCenters(p, "vertical");
    expect(centers).toHaveLength(4);
    expect(centers[0]).toEqual({ x: 20, y: 18 });
});

test("disabled grids normalize unused drafts and create an undrilled blank", () => {
    const p = defaultFabricationParameters("bracket");
    p.horizontal = { ...p.horizontal, enabled: false, rows: Number.NaN };
    p.vertical.enabled = false;
    const validated = validateFabricationParameters(p);
    expect(validated.isOk).toBe(true);
    expect(Number.isFinite(validated.value.horizontal.rows)).toBe(true);
    const built = buildFabricationShape(p);
    expect(built.isOk, built.isOk ? "" : built.error).toBe(true);
    expect(built.value.volume()).toBeCloseTo(80400, 5);
    built.value.dispose();
});

test("disabling a valid custom grid keeps its saved settings for later re-enabling", () => {
    const p = defaultFabricationParameters("bracket");
    p.horizontal = { ...p.horizontal, enabled: false, columns: 3, pitchX: 25, diameter: 10 };
    const validated = validateFabricationParameters(p);
    expect(validated.isOk).toBe(true);
    expect(validated.value.horizontal).toEqual(p.horizontal);
});

test("an atomic nondefault bracket edit, undo/redo and serialization retain parameters and geometry", () => {
    const document = new TestDocument();
    const node = new FabricationPartNode({ document, parameters: defaultFabricationParameters("bracket") });
    const old = node.parameters;
    const originalVolume = node.shape.value.volume();
    const changed = {
        ...old,
        width: 120,
        length: 95,
        height: 75,
        horizontal: { ...old.horizontal, columns: 3, pitchX: 35 },
        vertical: { ...old.vertical, diameter: 10 },
    };
    const undoCount = document.history.undoCount();
    expect(node.applyParameters(changed).isOk).toBe(true);
    expect(document.history.undoCount()).toBe(undoCount + 1);
    expect(node.parameters).toEqual(changed);
    expect(node.shape.value.volume()).toBeCloseTo(expectedVolume(changed), 5);
    document.history.undo();
    expect(node.parameters).toEqual(old);
    expect(node.shape.value.volume()).toBeCloseTo(originalVolume, 5);
    document.history.redo();
    expect(node.parameters).toEqual(changed);
    expect(node.shape.value.volume()).toBeCloseTo(expectedVolume(changed), 5);
    const restored = Serializer.deserializeObject(
        document,
        Serializer.serializeObject(node),
    ) as FabricationPartNode;
    expect(restored).toBeInstanceOf(FabricationPartNode);
    expect(restored.parameters).toEqual(changed);
    expect(restored.shape.value.volume()).toBeCloseTo(expectedVolume(changed), 5);
    restored.dispose();
    node.dispose();
});

test("invalid input and native failures preserve both geometry and undo history", () => {
    const document = new TestDocument();
    const node = new FabricationPartNode({ document });
    const original = node.shape.value;
    const json = node.parametersJson;
    const count = document.history.undoCount();
    expect(node.applyParameters({ ...node.parameters, width: -1 }).isOk).toBe(false);
    rs.spyOn(shapeFactory, "booleanCut").mockReturnValue(Result.err("Controlled native failure"));
    expect(node.applyParameters({ ...node.parameters, width: 110 }).error).toBe("Controlled native failure");
    expect(node.parametersJson).toBe(json);
    expect(node.shape.value).toBe(original);
    expect(original.checkShape()).toBe(true);
    expect(document.history.undoCount()).toBe(count);
    node.dispose();
});

test("corrupt saved parameters reject restoration before geometry execution", () => {
    const box = rs.spyOn(shapeFactory, "box");
    expect(
        () => new FabricationPartNode({ document: new TestDocument(), parametersJson: '{"kind":"plate"}' }),
    ).toThrow("Stock dimensions");
    expect(box).not.toHaveBeenCalled();
});

test("the bracket survives STEP exchange and exports a complete binary STL", () => {
    const built = buildFabricationShape(defaultFabricationParameters("bracket"));
    expect(built.isOk, built.isOk ? "" : built.error).toBe(true);
    const converter = new OccShapeConverter();
    const step = converter.convertToSTEP(built.value);
    expect(step.isOk).toBe(true);
    const imported = converter.convertFromSTEP(new TestDocument(), new TextEncoder().encode(step.value));
    expect(imported.isOk).toBe(true);
    const node = imported.value.firstChild;
    expect(node).toBeInstanceOf(EditableShapeNode);
    const restored = (node as EditableShapeNode).shape;
    expect(restored.isOk).toBe(true);
    expect(restored.value.checkShape()).toBe(true);
    expect(restored.value.volume()).toBeCloseTo(built.value.volume(), 4);
    const stl = converter.convertToSTL([built.value], { binary: true });
    expect(stl.isOk).toBe(true);
    const triangles = new DataView(stl.value.buffer, stl.value.byteOffset).getUint32(80, true);
    expect(triangles).toBeGreaterThan(0);
    expect(stl.value.length).toBe(84 + 50 * triangles);
    imported.value.dispose();
    built.value.dispose();
});

test("the maximum 32-hole layout produces a valid solid with the expected removed volume", () => {
    const p = defaultFabricationParameters();
    p.width = 400;
    p.length = 200;
    p.horizontal = { enabled: true, columns: 8, rows: 4, pitchX: 40, pitchY: 40, diameter: 8 };
    const start = performance.now();
    const built = buildFabricationShape(p);
    const elapsed = performance.now() - start;
    expect(built.isOk, built.isOk ? "" : built.error).toBe(true);
    expect(built.value.checkShape()).toBe(true);
    expect(built.value.volume()).toBeCloseTo(expectedVolume(p), 4);
    console.info(`32-hole native part: ${elapsed.toFixed(1)} ms`);
    built.value.dispose();
});
