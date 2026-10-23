// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { BoundingBox, LineSegment, Matrix4, Quaternion, XY, XYZ } from "../src/math";

function expectPoint(actual: { x: number; y: number; z: number }, expected: XYZ) {
    expect(actual.x).toBeCloseTo(expected.x, 10);
    expect(actual.y).toBeCloseTo(expected.y, 10);
    expect(actual.z).toBeCloseTo(expected.z, 10);
}

describe("geometry math invariants", () => {
    test.each([
        { axis: XYZ.unitZ, angle: Math.PI / 2, point: XYZ.unitX, expected: XYZ.unitY },
        { axis: XYZ.unitZ, angle: -Math.PI / 2, point: XYZ.unitX, expected: XYZ.unitNY },
        { axis: XYZ.unitX, angle: Math.PI, point: XYZ.unitY, expected: XYZ.unitNY },
    ])("quaternion matrix preserves the analytic rotation %j", ({ axis, angle, point, expected }) => {
        const q = Quaternion.fromAxisAngle(axis, angle);
        const matrix = Matrix4.fromQuaternion(q);
        expectPoint(matrix.ofPoint(point), expected);
        expect(matrix.determinant()).toBeCloseTo(1, 10);
        expect(matrix.ofVector(point).length()).toBeCloseTo(1, 10);
    });

    test("rotated bounds include the corners that were not the original min/max", () => {
        const box = new BoundingBox(XYZ.zero, new XYZ(1, 2, 3));
        const matrix = Matrix4.fromAxisRad(XYZ.zero, XYZ.unitZ, Math.PI / 4);
        const result = BoundingBox.transformed(box, matrix);
        expectPoint(result.min, new XYZ(-Math.SQRT2, 0, 0));
        expectPoint(result.max, new XYZ(Math.SQRT1_2, 3 * Math.SQRT1_2, 3));
        expect(BoundingBox.isValid(result)).toBe(true);
    });

    test("negative scale returns ordered enclosing bounds", () => {
        const box = new BoundingBox(new XYZ(1, 2, 3), new XYZ(4, 5, 6));
        const result = BoundingBox.transformed(box, Matrix4.fromScale(-2, 3, -4));
        expectPoint(result.min, new XYZ(-8, 6, -24));
        expectPoint(result.max, new XYZ(-2, 15, -12));
        expect(BoundingBox.isValid(result)).toBe(true);
    });

    test.each([0, 2])("parallel overlap distance is independent of endpoint order (offset %d)", (offset) => {
        const first = new LineSegment({ start: XYZ.zero, end: new XYZ(10, 0, 0) });
        const second = new LineSegment({ start: new XYZ(8, offset, 0), end: new XYZ(3, offset, 0) });
        for (const result of [first.distanceTo(second), second.distanceTo(first)]) {
            expect(result.distance).toBeCloseTo(offset, 10);
            expect(result.sc).toBeGreaterThanOrEqual(0);
            expect(result.sc).toBeLessThanOrEqual(1);
            expect(result.tc).toBeGreaterThanOrEqual(0);
            expect(result.tc).toBeLessThanOrEqual(1);
        }
    });

    test("clockwise perpendicular and oblique vectors are not parallel", () => {
        for (const other of [new XY(0, -1), new XY(1, -1)]) {
            expect(XY.unitX.isParallelTo(other)).toBe(false);
            expect(other.isParallelTo(XY.unitX)).toBe(false);
        }
    });

    test("opposite direction tolerates the negative side of pi", () => {
        const other = new XY(-1, -1e-10);
        expect(XY.unitX.isOppositeTo(other)).toBe(true);
        expect(other.isOppositeTo(XY.unitX)).toBe(true);
    });
});
