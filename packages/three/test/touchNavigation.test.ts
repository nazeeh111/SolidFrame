// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { createHandlerMockView, createPointerEvent } from "@chili3d/core/test-utils";
import { ThreeViewHandler } from "../src/threeViewEventHandler";

type Point = [number, number];

function gesture(before: [Point, Point], after: [Point, Point]) {
    const pan = rs.fn((_dx: number, _dy: number) => {});
    const zoom = rs.fn((_x: number, _y: number, _delta: number) => {});
    const view = createHandlerMockView();
    Object.assign(view.cameraController, { pan, zoom });
    const handler = new ThreeViewHandler();
    const event = (index: number, point: Point) =>
        createPointerEvent({
            pointerType: "touch",
            pointerId: index + 1,
            offsetX: point[0],
            offsetY: point[1],
        });
    before.forEach((point, index) => {
        handler.pointerDown(view, event(index, point));
    });
    after.forEach((point, index) => {
        handler.pointerMove(view, event(index, point));
    });
    // The existing handler compares the completed pair on the next move event.
    handler.pointerMove(view, event(0, after[0]));
    handler.dispose();
    return { pan, zoom };
}

test.each([
    {
        before: [
            [20, 100],
            [60, 100],
        ],
        after: [
            [10, 100],
            [70, 100],
        ],
        delta: -20,
    },
    {
        before: [
            [100, 20],
            [100, 60],
        ],
        after: [
            [100, 10],
            [100, 70],
        ],
        delta: -20,
    },
    {
        before: [
            [20, 20],
            [60, 60],
        ],
        after: [
            [30, 30],
            [50, 50],
        ],
        delta: Math.sqrt(800),
    },
    {
        before: [
            [120, 220],
            [160, 260],
        ],
        after: [
            [130, 230],
            [150, 250],
        ],
        delta: Math.sqrt(800),
    },
] as {
    before: [Point, Point];
    after: [Point, Point];
    delta: number;
}[])("pinch measures actual finger separation: %j", ({ before, after, delta }) => {
    const { pan, zoom } = gesture(before, after);
    expect(pan).not.toHaveBeenCalled();
    expect(zoom).toHaveBeenCalledTimes(1);
    const args = zoom.mock.calls[0];
    expect(args[0]).toBe((after[0][0] + after[1][0]) / 2);
    expect(args[1]).toBe((after[0][1] + after[1][1]) / 2);
    expect(args[2]).toBeCloseTo(delta);
});

test("a translated two-finger pair pans without a spurious pinch", () => {
    const { pan, zoom } = gesture(
        [
            [20, 20],
            [60, 60],
        ],
        [
            [22, 18],
            [62, 58],
        ],
    );
    expect(pan).toHaveBeenCalledExactlyOnceWith(2, -2);
    expect(zoom).not.toHaveBeenCalled();
});

test("stationary fingers do not send a zero-delta zoom", () => {
    const { pan, zoom } = gesture(
        [
            [20, 100],
            [60, 100],
        ],
        [
            [20, 100],
            [60, 100],
        ],
    );
    expect(pan).not.toHaveBeenCalled();
    expect(zoom).not.toHaveBeenCalled();
});
