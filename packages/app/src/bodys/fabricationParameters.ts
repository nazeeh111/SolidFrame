// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Result } from "@chili3d/core";

export interface HoleGrid {
    enabled: boolean;
    columns: number;
    rows: number;
    pitchX: number;
    pitchY: number;
    diameter: number;
}

export interface FabricationParameters {
    kind: "plate" | "bracket";
    width: number;
    length: number;
    height: number;
    thickness: number;
    horizontal: HoleGrid;
    vertical: HoleGrid;
}

export const FABRICATION_MIN_WEB = 0.5;
export const FABRICATION_MAX_DIMENSION = 2000;
export const FABRICATION_MAX_HOLES = 32;

export function defaultFabricationParameters(kind: "plate" | "bracket" = "plate"): FabricationParameters {
    return {
        kind,
        width: 100,
        length: 80,
        height: 60,
        thickness: 6,
        horizontal: { enabled: true, columns: 2, rows: 2, pitchX: 60, pitchY: 40, diameter: 8 },
        vertical: { enabled: true, columns: 2, rows: 2, pitchX: 60, pitchY: 30, diameter: 8 },
    };
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dimension(value: unknown): value is number {
    return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= FABRICATION_MIN_WEB &&
        value <= FABRICATION_MAX_DIMENSION
    );
}

function readGrid(value: unknown, fallback: HoleGrid, active: boolean): Result<HoleGrid> {
    if (!record(value) || typeof value["enabled"] !== "boolean") {
        return Result.err("A hole layout must include an enabled setting.");
    }
    if (!active || !value["enabled"]) {
        const count = (key: "columns" | "rows") =>
            typeof value[key] === "number" &&
            Number.isInteger(value[key]) &&
            value[key] >= 1 &&
            value[key] <= FABRICATION_MAX_HOLES
                ? value[key]
                : fallback[key];
        return Result.ok({
            enabled: value["enabled"],
            columns: count("columns"),
            rows: count("rows"),
            pitchX: dimension(value["pitchX"]) ? value["pitchX"] : fallback.pitchX,
            pitchY: dimension(value["pitchY"]) ? value["pitchY"] : fallback.pitchY,
            diameter: dimension(value["diameter"]) ? value["diameter"] : fallback.diameter,
        });
    }
    for (const key of ["columns", "rows"] as const) {
        if (
            typeof value[key] !== "number" ||
            !Number.isInteger(value[key]) ||
            value[key] < 1 ||
            value[key] > FABRICATION_MAX_HOLES
        ) {
            return Result.err("Hole rows and columns must be whole numbers from 1 to 32.");
        }
    }
    for (const key of ["pitchX", "pitchY", "diameter"] as const) {
        if (!dimension(value[key])) return Result.err("Hole diameter and pitches must be 0.5 to 2,000 mm.");
    }
    return Result.ok({
        enabled: true,
        columns: value["columns"] as number,
        rows: value["rows"] as number,
        pitchX: value["pitchX"] as number,
        pitchY: value["pitchY"] as number,
        diameter: value["diameter"] as number,
    });
}

/** Validate the complete coupled layout before any native kernel call. Also strips unknown saved fields. */
export function validateFabricationParameters(value: unknown): Result<FabricationParameters> {
    if (!record(value) || (value["kind"] !== "plate" && value["kind"] !== "bracket")) {
        return Result.err("Choose a rectangular plate or right-angle bracket.");
    }
    for (const key of ["width", "length", "thickness"] as const) {
        if (!dimension(value[key])) return Result.err("Stock dimensions must be 0.5 to 2,000 mm.");
    }
    const defaults = defaultFabricationParameters(value["kind"]);
    const height =
        value["kind"] === "plate" && !dimension(value["height"]) ? defaults.height : value["height"];
    if (!dimension(height)) return Result.err("Bracket height must be 0.5 to 2,000 mm.");
    const width = value["width"] as number;
    const length = value["length"] as number;
    const thickness = value["thickness"] as number;
    if (
        value["kind"] === "bracket" &&
        (length - thickness < FABRICATION_MIN_WEB || height - thickness < FABRICATION_MIN_WEB)
    ) {
        return Result.err("Bracket length and total height must exceed thickness by at least 0.5 mm.");
    }
    const horizontal = readGrid(value["horizontal"], defaults.horizontal, true);
    if (!horizontal.isOk) return Result.err(horizontal.error);
    const vertical = readGrid(value["vertical"], defaults.vertical, value["kind"] === "bracket");
    if (!vertical.isOk) return Result.err(vertical.error);
    const parameters: FabricationParameters = {
        kind: value["kind"],
        width,
        length,
        height,
        thickness,
        horizontal: horizontal.value,
        vertical: vertical.value,
    };
    let holes = 0;
    for (const flange of ["horizontal", "vertical"] as const) {
        if (flange === "vertical" && parameters.kind === "plate") continue;
        const grid = parameters[flange];
        if (!grid.enabled) continue;
        holes += grid.columns * grid.rows;
        const span =
            (flange === "horizontal" ? length : height) - (parameters.kind === "bracket" ? thickness : 0);
        if (
            (grid.columns > 1 && grid.pitchX - grid.diameter < FABRICATION_MIN_WEB) ||
            (grid.rows > 1 && grid.pitchY - grid.diameter < FABRICATION_MIN_WEB)
        ) {
            return Result.err("Leave at least 0.5 mm of stock between neighboring holes.");
        }
        if (
            (grid.columns - 1) * grid.pitchX + grid.diameter + 2 * FABRICATION_MIN_WEB > width ||
            (grid.rows - 1) * grid.pitchY + grid.diameter + 2 * FABRICATION_MIN_WEB > span
        ) {
            return Result.err(
                `${flange === "horizontal" ? "Horizontal" : "Vertical"} holes need at least 0.5 mm clearance from every edge and the bracket corner.`,
            );
        }
    }
    if (holes > FABRICATION_MAX_HOLES) return Result.err("Use at most 32 holes across both flange layouts.");
    return Result.ok(parameters);
}

/** Coordinates in the flange's own drawing: x across width, y along length or total height. */
export function fabricationHoleCenters(
    parameters: FabricationParameters,
    flange: "horizontal" | "vertical",
): { x: number; y: number }[] {
    if (flange === "vertical" && parameters.kind === "plate") return [];
    const grid = parameters[flange];
    if (!grid.enabled) return [];
    const offset = parameters.kind === "bracket" ? parameters.thickness : 0;
    const span = (flange === "horizontal" ? parameters.length : parameters.height) - offset;
    const startX = (parameters.width - (grid.columns - 1) * grid.pitchX) / 2;
    const startY = offset + (span - (grid.rows - 1) * grid.pitchY) / 2;
    const centers: { x: number; y: number }[] = [];
    for (let row = 0; row < grid.rows; row++) {
        for (let column = 0; column < grid.columns; column++) {
            centers.push({ x: startX + column * grid.pitchX, y: startY + row * grid.pitchY });
        }
    }
    return centers;
}
