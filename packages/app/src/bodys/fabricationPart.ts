// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type I18nKeys,
    type IShape,
    ParameterShapeNode,
    type ParameterShapeNodeOptions,
    Plane,
    Result,
    ShapeTypes,
    serializable,
    serialize,
    Transaction,
    XYZ,
} from "@chili3d/core";
import {
    defaultFabricationParameters,
    type FabricationParameters,
    fabricationHoleCenters,
    validateFabricationParameters,
} from "./fabricationParameters";

/** One solid, with all temporary stock and cutting tools owned by this operation. */
export function buildFabricationShape(input: unknown): Result<IShape> {
    const validation = validateFabricationParameters(input);
    if (!validation.isOk) return Result.err(validation.error);
    const p = validation.value;
    const temporaries = new Set<IShape>();
    let output: IShape | undefined;
    const own = (result: Result<IShape>): IShape => {
        if (!result.isOk) throw new Error(result.error);
        temporaries.add(result.value);
        return result.value;
    };
    try {
        let stock = own(shapeFactory.box(Plane.XY, p.width, p.length, p.thickness));
        if (p.kind === "bracket") {
            const upright = own(shapeFactory.box(Plane.XY, p.width, p.thickness, p.height));
            stock = own(shapeFactory.booleanFuse([stock], [upright], false));
        }
        const tools: IShape[] = [];
        const overshoot = Math.max(0.01, p.thickness * 0.001);
        for (const flange of ["horizontal", "vertical"] as const) {
            for (const center of fabricationHoleCenters(p, flange)) {
                const origin =
                    flange === "horizontal"
                        ? new XYZ({ x: center.x, y: center.y, z: -overshoot })
                        : new XYZ({ x: center.x, y: -overshoot, z: center.y });
                tools.push(
                    own(
                        shapeFactory.cylinder(
                            flange === "horizontal" ? XYZ.unitZ : XYZ.unitY,
                            origin,
                            p[flange].diameter / 2,
                            p.thickness + 2 * overshoot,
                        ),
                    ),
                );
            }
        }
        const result = tools.length ? own(shapeFactory.booleanCut([stock], tools)) : stock;
        if (result.isNull() || !result.checkShape())
            return Result.err("The part could not form a valid solid.");
        // OCCT boolean operations may wrap a single solid in a compound.
        if (result.shapeType === ShapeTypes.solid) {
            output = result;
        } else {
            const solids = result.findSubShapes(ShapeTypes.solid);
            solids.forEach((solid) => temporaries.add(solid));
            if (solids.length !== 1) return Result.err("The part must contain exactly one connected solid.");
            output = solids[0];
        }
        // BRep_Tool::IsClosed reads the topology flag on a solid. Check its shells instead.
        const shells = output.findSubShapes(ShapeTypes.shell);
        shells.forEach((shell) => temporaries.add(shell));
        if (shells.length === 0 || shells.some((shell) => !shell.isClosed()) || !(output.volume() > 0)) {
            output = undefined;
            return Result.err("The part must be a closed solid with positive volume.");
        }
        return Result.ok(output);
    } catch (error) {
        output = undefined;
        return Result.err(error instanceof Error ? error.message : "The geometry operation failed.");
    } finally {
        for (const shape of temporaries) if (shape !== output) shape.dispose();
    }
}

export interface FabricationPartOptions extends ParameterShapeNodeOptions {
    parameters?: FabricationParameters;
    parametersJson?: string;
    /** A prebuilt candidate, transferred to this node during creation. Not serialized. */
    initialShape?: IShape;
}

@serializable()
export class FabricationPartNode extends ParameterShapeNode {
    constructor(options: FabricationPartOptions) {
        super(options);
        const validation = validateFabricationParameters(
            options.parametersJson === undefined
                ? (options.parameters ?? defaultFabricationParameters())
                : JSON.parse(options.parametersJson),
        );
        if (!validation.isOk) throw new Error(validation.error);
        this.setPrivateValue("parametersJson", JSON.stringify(validation.value));
        if (options.initialShape) this._shape = Result.ok(options.initialShape);
    }

    override display(): I18nKeys {
        return "body.fabricationPart";
    }

    @serialize()
    get parametersJson(): string {
        return this.getPrivateValue("parametersJson");
    }
    set parametersJson(value: string) {
        const result = this.applyParameters(JSON.parse(value));
        if (!result.isOk) throw new Error(result.error);
    }

    get parameters(): FabricationParameters {
        return JSON.parse(this.parametersJson);
    }

    /** Only the parameter JSON enters undo history; shapes are regenerated, never stored after disposal. */
    applyParameters(input: unknown): Result<boolean> {
        const validation = validateFabricationParameters(input);
        if (!validation.isOk) return Result.err(validation.error);
        const json = JSON.stringify(validation.value);
        if (json === this.parametersJson) return Result.ok(false);
        const candidate = buildFabricationShape(validation.value);
        if (!candidate.isOk) return Result.err(candidate.error);
        const previous = this._shape;
        Transaction.execute(this.document, "Edit mechanical part", () => {
            this.setProperty("parametersJson", json, () => {
                this._shape = candidate;
                this._mesh = undefined;
                this.emitPropertyChanged("shape", previous);
            });
        });
        previous.unchecked()?.dispose();
        return Result.ok(true);
    }

    protected override generateShape(): Result<IShape> {
        return buildFabricationShape(this.parameters);
    }
}
