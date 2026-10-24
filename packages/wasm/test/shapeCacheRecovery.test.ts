// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type IShape, Matrix4, XYZ } from "@chili3d/core";
import { type OccEdge, OccSubEdgeShape } from "../src/shape";
import { createBox, createTestFactory, unwrapOk } from "./helpers";
import "./setup";

test("borrowed curves survive repeated updates and are released with their edge", () => {
    const edge = unwrapOk(createTestFactory().line(XYZ.zero, new XYZ(10, 0, 0))) as OccEdge;
    const borrowed = edge.curve;
    const dispose = rs.spyOn(borrowed, "dispose");
    try {
        borrowed.setTrim(0, 4);
        edge.update(borrowed);
        expect(borrowed.endPoint().x).toBeCloseTo(4, 6);
        expect(edge.curve.endPoint().x).toBeCloseTo(4, 6);
        edge.update(borrowed);
        expect(edge.length()).toBeCloseTo(4, 6);
        expect(dispose).not.toHaveBeenCalled();
        edge.dispose();
        expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
        edge.dispose();
        dispose.mockRestore();
    }
});

test("cached bounds follow absolute matrix assignments instead of accumulating them", () => {
    const box = createBox(createTestFactory(), 10, 20, 30);
    try {
        box.boundingBox();
        box.matrix = Matrix4.fromTranslation(10, 0, 0);
        expect(box.boundingBox().min.x).toBeCloseTo(10, 6);
        box.matrix = Matrix4.fromTranslation(20, 0, 0);
        expect(box.matrix.ofPoint(XYZ.zero).x).toBeCloseTo(20, 6);
        expect(box.boundingBox().min.x).toBeCloseTo(20, 6);
        expect(box.boundingBox().max.x).toBeCloseTo(30, 6);
    } finally {
        box.dispose();
    }
});

test("cached oriented bounds follow the current absolute location", () => {
    const box = createBox(createTestFactory(), 10, 20, 30);
    try {
        const initial = box.orientedBoundingBox().center.location.x;
        box.matrix = Matrix4.fromTranslation(10, 0, 0);
        box.orientedBoundingBox();
        box.matrix = Matrix4.fromTranslation(20, 0, 0);
        expect(box.orientedBoundingBox().center.location.x).toBeCloseTo(initial + 20, 6);
    } finally {
        box.dispose();
    }
});

for (const query of ["length", "endpoints", "curve", "bounds"] as const) {
    test(`edge update refreshes its cached ${query}`, () => {
        const factory = createTestFactory();
        const edge = unwrapOk(factory.line(XYZ.zero, XYZ.unitX)) as OccEdge;
        const replacement = unwrapOk(factory.line(XYZ.zero, new XYZ(0, 0, 10))) as OccEdge;
        try {
            edge.curve;
            edge.boundingBox();
            edge.update(replacement.curve);
            if (query === "length") expect(edge.length()).toBeCloseTo(10, 6);
            if (query === "endpoints") expect(edge.endPoint().z).toBeCloseTo(10, 6);
            if (query === "curve") expect(edge.curve.endPoint().z).toBeCloseTo(10, 6);
            // Native tessellation adds padding; compare with the same untouched geometry.
            if (query === "bounds") {
                expect(edge.boundingBox().max.z).toBeCloseTo(replacement.boundingBox().max.z, 6);
            }
        } finally {
            edge.dispose();
            replacement.dispose();
        }
    });
}

test("updating a selected sub-edge regenerates its own mesh without changing its parent", () => {
    const factory = createTestFactory();
    const parent = unwrapOk(factory.line(XYZ.zero, XYZ.unitX));
    const selected = parent.mesh.edges!.range[0].shape;
    if (!(selected instanceof OccSubEdgeShape)) throw new Error("Expected a selectable native sub-edge");
    const replacement = unwrapOk(factory.line(XYZ.zero, new XYZ(0, 0, 10))) as OccEdge;
    try {
        selected.boundingBox();
        selected.update(replacement.curve);
        expect(selected.length()).toBeCloseTo(10, 6);
        expect(selected.boundingBox().max.z).toBeCloseTo(replacement.boundingBox().max.z, 6);
        expect(Math.max(...selected.mesh.edges!.position.filter((_, index) => index % 3 === 2))).toBeCloseTo(
            10,
            6,
        );
        expect(parent.boundingBox().max.z).toBeLessThan(0.01);
        expect((parent as OccEdge).length()).toBeCloseTo(1, 6);
    } finally {
        parent.dispose();
        replacement.dispose();
    }
});

for (const type of ["edge", "face"] as const) {
    test(`moving a selected sub-${type} regenerates its mesh independently of the parent`, () => {
        const factory = createTestFactory();
        const parent = createBox(factory, 10, 20, 30);
        let expected: IShape | undefined;
        try {
            const data = parent.mesh;
            const selected = (type === "edge" ? data.edges : data.faces)!.range[0].shape as IShape;
            selected.boundingBox();
            const parentInitial = parent.boundingBox().min.x;
            expected = selected.transformed(Matrix4.fromTranslation(100, 0, 0));
            selected.matrix = Matrix4.fromTranslation(100, 0, 0);
            expect(selected.boundingBox().min.x).toBeCloseTo(expected.boundingBox().min.x, 6);
            const positions = (type === "edge" ? selected.mesh.edges : selected.mesh.faces)!.position;
            expect(Math.min(...positions.filter((_, index) => index % 3 === 0))).toBeGreaterThan(99);
            expect(parent.boundingBox().min.x).toBeCloseTo(parentInitial, 6);
            const parentCopy = parent.clone();
            try {
                expect(parentCopy.boundingBox().min.x).toBeCloseTo(parentInitial, 6);
            } finally {
                parentCopy.dispose();
            }
        } finally {
            expected?.dispose();
            parent.dispose();
        }
    });
}
