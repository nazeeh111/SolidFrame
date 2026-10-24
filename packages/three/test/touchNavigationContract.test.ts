// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { createHandlerMockView, createPointerEvent } from "@chili3d/core/test-utils";
import { Object3D } from "three";
import { CameraController } from "../src/cameraController";
import type { ThreeView } from "../src/threeView";
import { ThreeViewHandler } from "../src/threeViewEventHandler";

type Pair = [[number, number], [number, number]];
const touch = (id: number, point: [number, number]) =>
    createPointerEvent({ pointerType: "touch", pointerId: id, offsetX: point[0], offsetY: point[1] });

function recordedGesture(before: Pair, after: Pair, reverse = false) {
    const view = createHandlerMockView();
    const pan = rs.fn((_x: number, _y: number) => {});
    const zoom = rs.fn((_x: number, _y: number, _delta: number) => {});
    const update = rs.fn(() => {});
    Object.assign(view.cameraController, { pan, zoom });
    Object.assign(view, { update });
    const handler = new ThreeViewHandler();
    before.forEach((point, i) => handler.pointerDown(view, touch(i + 1, point)));
    for (const i of reverse ? [1, 0] : [0, 1]) handler.pointerMove(view, touch(i + 1, after[i]));
    // A completed pair is evaluated on the next repeated pointer, before its new coordinates are used.
    expect(pan).not.toHaveBeenCalled();
    expect(zoom).not.toHaveBeenCalled();
    handler.pointerMove(view, touch(1, [999, 999]));
    expect(update).toHaveBeenCalledTimes(3);
    handler.dispose();
    return { pan, zoom };
}

test("pair delivery order preserves the completed-batch coordinates and zoom delta", () => {
    const { pan, zoom } = recordedGesture(
        [
            [20, 100],
            [60, 100],
        ],
        [
            [10, 100],
            [70, 100],
        ],
        true,
    );
    expect(pan).not.toHaveBeenCalled();
    expect(zoom).toHaveBeenCalledExactlyOnceWith(40, 100, -20);
});

test("coincident fingers can separate without a fabricated starting span", () => {
    const { pan, zoom } = recordedGesture(
        [
            [10, 20],
            [10, 20],
        ],
        [
            [0, 20],
            [20, 20],
        ],
    );
    expect(pan).not.toHaveBeenCalled();
    expect(zoom).toHaveBeenCalledExactlyOnceWith(10, 20, -20);
});

test("constant separation and center do not zoom when the pair changes orientation", () => {
    const { pan, zoom } = recordedGesture(
        [
            [10, 20],
            [30, 20],
        ],
        [
            [20, 10],
            [20, 30],
        ],
    );
    expect(pan).not.toHaveBeenCalled();
    expect(zoom).not.toHaveBeenCalled();
});

test("a coincident pair translated together still pans", () => {
    const { pan, zoom } = recordedGesture(
        [
            [10, 20],
            [10, 20],
        ],
        [
            [13, 24],
            [13, 24],
        ],
    );
    expect(pan).toHaveBeenCalledExactlyOnceWith(3, 4);
    expect(zoom).not.toHaveBeenCalled();
});

test.each([
    { first: -1, second: 29, panDelta: undefined, zoomDelta: -20 },
    { first: 0, second: 30, panDelta: undefined, zoomDelta: -20 },
    { first: 1, second: 31, panDelta: 11, zoomDelta: undefined },
])("strict half-span pan threshold remains unchanged: %j", ({ first, second, panDelta, zoomDelta }) => {
    const { pan, zoom } = recordedGesture(
        [
            [0, 0],
            [10, 0],
        ],
        [
            [first, 0],
            [second, 0],
        ],
    );
    if (panDelta === undefined) {
        expect(pan).not.toHaveBeenCalled();
        expect(zoom).toHaveBeenCalledExactlyOnceWith((first + second) / 2, 0, zoomDelta);
    } else {
        expect(pan).toHaveBeenCalledExactlyOnceWith(panDelta, 0);
        expect(zoom).not.toHaveBeenCalled();
    }
});

function cameraGesture(type: "perspective" | "orthographic", before: Pair, after: Pair) {
    const view = createHandlerMockView();
    Object.assign(view, {
        screenToCameraRect: (_x: number, _y: number) => ({ x: 0, y: 0 }),
        content: { visualShapes: new Object3D() },
    });
    const camera = new CameraController(view as unknown as ThreeView);
    Object.assign(view, { cameraController: camera });
    camera.cameraType = type;
    camera.setSize(800, 600);
    camera.lookAt({ x: 1500, y: 1500, z: 1500 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    const initial = { position: camera.cameraPosition, target: camera.cameraTarget };
    const initialDistance = camera.cameraPosition.distanceTo(camera.cameraTarget);
    const handler = new ThreeViewHandler();
    before.forEach((point, i) => handler.pointerDown(view, touch(i + 1, point)));
    after.forEach((point, i) => handler.pointerMove(view, touch(i + 1, point)));
    handler.pointerMove(view, touch(1, after[0]));
    handler.dispose();
    return { camera, initial, initialDistance };
}

test.each([
    "perspective",
    "orthographic",
] as const)("stationary touch leaves actual %s camera unchanged; direct zero zoom keeps established policy", (type) => {
    const pair: Pair = [
        [20, 100],
        [60, 100],
    ];
    const { camera, initial, initialDistance } = cameraGesture(type, pair, pair);
    expect(camera.cameraPosition).toEqual(initial.position);
    expect(camera.cameraTarget).toEqual(initial.target);
    expect(camera.cameraPosition.distanceTo(camera.cameraTarget)).toBeCloseTo(initialDistance);
    camera.zoom(400, 300, 0);
    expect(camera.cameraPosition.distanceTo(camera.cameraTarget)).toBeCloseTo(initialDistance * 0.9);
});

test("actual camera retains sign-based zoom magnitude for different nonzero pinch spans", () => {
    const before: Pair = [
        [380, 300],
        [420, 300],
    ];
    const short = cameraGesture("perspective", before, [
        [370, 300],
        [430, 300],
    ]);
    const long = cameraGesture("perspective", before, [
        [300, 300],
        [500, 300],
    ]);
    expect(short.camera.cameraPosition.distanceTo(short.camera.cameraTarget)).toBeCloseTo(
        short.initialDistance * 0.9,
    );
    expect(long.camera.cameraPosition.distanceTo(long.camera.cameraTarget)).toBeCloseTo(
        long.initialDistance * 0.9,
    );
});
