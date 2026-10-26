// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { AsyncController, type IApplication, type IStep, Plane, SnapEventHandler, XYZ } from "@chili3d/core";
import {
    createHandlerMockView,
    createMockApplication,
    createMockSelection,
    TestDocument,
} from "@chili3d/core/test-utils";
import { describe, expect, test } from "@rstest/core";
import { ArrayCommand } from "../../../src/commands/modify/array";
import { seedStepDatas } from "../commandTestUtils";

describe("Array circular step-bound angle validation", () => {
    test.each([
        "XY center",
        "XY normal",
        "XY valid",
        "YZ center",
        "YZ normal",
        "YZ valid",
    ])("%s uses the command's existing angle predicate", async (scenario) => {
        const plane = scenario.startsWith("XY")
            ? Plane.XY
            : new Plane({ origin: new XYZ({ x: 2, y: 3, z: 4 }), normal: XYZ.unitX, xvec: XYZ.unitY });
        const point = scenario.endsWith("center")
            ? plane.origin
            : plane.origin.add((scenario.endsWith("normal") ? plane.normal : plane.yvec).multiply(5));
        const app = createMockApplication();
        const doc = new TestDocument({ application: app, selection: createMockSelection() });
        const view = createHandlerMockView({ document: doc, workplane: plane });
        app.activeView = view;
        const cmd = new ArrayCommand();
        (cmd as unknown as { _application: IApplication })._application = app;
        seedStepDatas(cmd, [
            { view, point: plane.origin, shapes: [], type: "input" },
            { view, point: plane.origin.add(plane.xvec.multiply(5)), plane, shapes: [], type: "input" },
        ]);
        let accepted: boolean | undefined;
        doc.picker.pickAsync = async (handler, _tip, currentController) => {
            if (!(handler instanceof SnapEventHandler)) throw new Error("expected snap handler");
            const predicate = handler.data.validator;
            if (!predicate) throw new Error("step did not bind its validator");
            accepted = predicate(point);
            currentController.cancel();
        };
        const controller = new AsyncController();
        try {
            await (cmd as unknown as { getCircularSteps(): IStep[] })
                .getCircularSteps()[2]
                .execute(doc, controller);
            expect(accepted).toBe(scenario.endsWith("valid"));
        } finally {
            controller.dispose();
            doc.dispose();
        }
    });
});
