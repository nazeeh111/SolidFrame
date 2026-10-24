// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { type FaceMeshData, MeshDataUtils } from "../src/shape/meshData";
import { MeshUtils } from "../src/shape/meshUtils";
import type { ISubShape } from "../src/shape/shape";

function quad(x: number, materialIndex: number): FaceMeshData {
    return {
        position: new Float32Array([x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0]),
        normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
        uv: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
        index: new Uint32Array([0, 1, 2, 0, 2, 3]),
        range: [{ start: 0, count: 6, shape: {} as ISubShape }],
        groups: [{ start: 0, count: 6, materialIndex }],
        color: 0xffffff,
    };
}

function triangleCoordinates(mesh: FaceMeshData, start: number, count: number): number[] {
    return Array.from(mesh.index.slice(start, start + count)).flatMap((index) =>
        Array.from(mesh.position.slice(index * 3, index * 3 + 3)),
    );
}

test("merged indices draw the second mesh at its own coordinates", () => {
    const first = quad(0, 2);
    const second = quad(10, 7);
    const merged = MeshDataUtils.mergeFaceMesh(first, second);
    expect(triangleCoordinates(merged, 6, 6)).toEqual(triangleCoordinates(second, 0, 6));
    expect(triangleCoordinates(merged, 0, 6)).toEqual(triangleCoordinates(first, 0, 6));
    expect(Array.from(first.index)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(Array.from(second.index)).toEqual([0, 1, 2, 0, 2, 3]);
});

test("merged face ranges use index offsets and still extract the corresponding face", () => {
    const first = quad(0, 2);
    const second = quad(10, 7);
    const merged = MeshDataUtils.mergeFaceMesh(first, second);
    const face = MeshUtils.subFace(merged, 1)!;
    expect(triangleCoordinates(face, 0, 6)).toEqual(triangleCoordinates(second, 0, 6));
    expect(merged.range[1].shape).toBe(second.range[0].shape);
});

test("merged material groups retain both inputs at the proper index offsets", () => {
    const first = quad(0, 2);
    const second = quad(10, 7);
    const merged = MeshDataUtils.mergeFaceMesh(first, second);
    expect(merged.groups).toEqual([
        { start: 0, count: 6, materialIndex: 2 },
        { start: 6, count: 6, materialIndex: 7 },
    ]);
    expect(first.groups).toEqual([{ start: 0, count: 6, materialIndex: 2 }]);
    expect(second.groups).toEqual([{ start: 0, count: 6, materialIndex: 7 }]);
});

test("merging an already merged mesh preserves all geometry and material groups", () => {
    const meshes = [quad(0, 2), quad(10, 7), quad(20, 9)];
    const merged = meshes.reduce((left, right) => MeshDataUtils.mergeFaceMesh(left, right));
    meshes.forEach((mesh, index) => {
        expect(triangleCoordinates(merged, index * 6, 6)).toEqual(triangleCoordinates(mesh, 0, 6));
    });
    expect(merged.groups.map((group) => group.materialIndex)).toEqual([2, 7, 9]);
});
