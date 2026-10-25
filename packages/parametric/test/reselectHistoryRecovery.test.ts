// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { AsyncController, Matrix4, Result, Signal } from "@chili3d/core";
import { TestDocument } from "@chili3d/core/test-utils";
import { describe, expect, rs, test } from "@rstest/core";
import {
    EdgeReselectSession,
    ProfileReselectSession,
    type ReselectHost,
} from "../src/commands/reselectSession";
import type { ExtrudeFeatureData, FilletFeatureData } from "../src/features/feature";
import type { SketchNode } from "../src/sketch/sketchNode";

function fixture(initiallyDisabled: boolean, failure?: Error) {
    const document = new TestDocument();
    document.history.disabled = initiallyDisabled;
    const selected = rs.fn();
    const selection = {
        clearSelection: rs.fn(),
        setSelectedNodes: selected,
        onShapeChanged: new Signal(),
    };
    document.selection = selection as unknown as TestDocument["selection"];
    document.picker.pickShape = rs.fn(async () => []);
    const restoreFeatures = rs.fn(() => {
        if (failure) throw failure;
    });
    const rollback = rs.fn((index: number | undefined) => {
        if (index === undefined && failure) throw failure;
        return true;
    });
    const host = {
        document,
        features: [],
        shape: Result.err("unused shape"),
        setFeaturesEmitShapeChanged: restoreFeatures,
        setRollbackIndex: rollback,
        worldTransform: () => Matrix4.identity(),
    } as unknown as ReselectHost;
    return { document, host, selected, restoreFeatures, rollback };
}

const extrude: ExtrudeFeatureData = { id: "f1", type: "extrude", sketchId: "sketch", depth: 5 };
const fillet: FilletFeatureData = { id: "f2", type: "fillet", radius: 1, edges: [] };
const sketch = { id: "sketch" } as SketchNode;

describe("reselect teardown history recovery", () => {
    test.each([
        false,
        true,
    ])("profile cleanup failure restores history=%s and preserves its error", async (initial) => {
        const failure = new Error("restore feature failed");
        const { document, host, selected, restoreFeatures } = fixture(initial, failure);
        await expect(
            new ProfileReselectSession(host).pick(extrude, sketch, new AsyncController()),
        ).rejects.toBe(failure);
        expect(restoreFeatures).toHaveBeenCalledTimes(1);
        expect(document.history.disabled).toBe(initial);
        expect(selected).not.toHaveBeenCalled();
    });

    test.each([
        false,
        true,
    ])("edge cleanup failure restores history=%s and preserves its error", async (initial) => {
        const failure = new Error("restore rollback failed");
        const { document, host, selected, rollback } = fixture(initial, failure);
        await expect(new EdgeReselectSession(host).pick(fillet, 1, new AsyncController())).rejects.toBe(
            failure,
        );
        expect(rollback).toHaveBeenLastCalledWith(undefined);
        expect(document.history.disabled).toBe(initial);
        expect(selected).not.toHaveBeenCalled();
    });

    test.each([
        false,
        true,
    ])("normal profile completion retains history=%s and reselects the host", async (initial) => {
        const { document, host, selected } = fixture(initial);
        await expect(
            new ProfileReselectSession(host).pick(extrude, sketch, new AsyncController()),
        ).resolves.toEqual([]);
        expect(document.history.disabled).toBe(initial);
        expect(selected).toHaveBeenCalledWith([host], false);
    });
});
