// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { I18n, type I18nKeys, type Result } from "@chili3d/core";
import {
    type FabricationParameters,
    fabricationHoleCenters,
    type HoleGrid,
    validateFabricationParameters,
} from "../bodys/fabricationParameters";
import style from "./fabricationDialog.module.css";

let dialogSequence = 0;

/** Edits a local draft. The submit callback is the only operation that builds geometry. */
export function showFabricationDialog(
    initial: FabricationParameters,
    mode: "create" | "edit",
    submit: (parameters: FabricationParameters) => Promise<Result<boolean>>,
): Promise<void> {
    let resolveClosed!: () => void;
    const closed = new Promise<void>((resolve) => {
        resolveClosed = resolve;
    });
    const id = `fabrication-${++dialogSequence}`;
    const previousFocus = document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.className = style.root;
    dialog.dataset["fabricationDialog"] = mode;
    dialog.setAttribute("aria-labelledby", `${id}-title`);
    dialog.setAttribute("aria-describedby", `${id}-description`);
    const form = document.createElement("form");
    form.className = style.form;
    form.dataset["fabricationForm"] = "";
    form.noValidate = true;
    const heading = document.createElement("h2");
    heading.id = `${id}-title`;
    heading.textContent = I18n.translate(
        mode === "create" ? "command.fabrication.create" : "command.fabrication.edit",
    );
    const description = document.createElement("p");
    description.id = `${id}-description`;
    description.textContent = I18n.translate("fabrication.description");
    const header = document.createElement("header");
    header.className = style.header;
    header.append(heading, description);

    const body = document.createElement("div");
    body.className = style.body;
    const fields = document.createElement("div");
    fields.className = style.fields;
    const dimensions = document.createElement("fieldset");
    dimensions.className = style.dimensions;
    const dimensionsLegend = document.createElement("legend");
    dimensionsLegend.textContent = I18n.translate("fabrication.dimensions");
    dimensions.append(dimensionsLegend);
    const inputs = new Map<string, HTMLInputElement>();
    const kind = document.createElement("select");
    kind.id = `${id}-kind`;
    kind.name = "kind";
    for (const value of ["plate", "bracket"] as const) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = I18n.translate(`fabrication.${value}`);
        kind.append(option);
    }
    kind.value = initial.kind;
    dimensions.append(field("fabrication.kind", kind));

    function numberField(key: I18nKeys, name: string, value: number, count = false): HTMLElement {
        const input = document.createElement("input");
        input.type = "number";
        input.id = `${id}-${name}`;
        input.name = name;
        input.value = String(value);
        input.step = count ? "1" : "any";
        input.min = count ? "1" : "0.5";
        input.max = count ? "32" : "2000";
        input.inputMode = count ? "numeric" : "decimal";
        input.required = true;
        inputs.set(name, input);
        return field(key, input, I18n.translate(count ? "fabrication.count" : "fabrication.mm"));
    }

    dimensions.append(
        numberField("fabrication.width", "width", initial.width),
        numberField("fabrication.length", "length", initial.length),
    );
    const heightField = numberField("fabrication.height", "height", initial.height);
    dimensions.append(heightField, numberField("fabrication.thickness", "thickness", initial.thickness));
    fields.append(dimensions);

    function gridFields(flange: "horizontal" | "vertical", grid: HoleGrid): HTMLFieldSetElement {
        const fieldset = document.createElement("fieldset");
        fieldset.className = style.holeGrid;
        fieldset.dataset["flange"] = flange;
        const legend = document.createElement("legend");
        legend.textContent = I18n.translate(`fabrication.${flange}`);
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.id = `${id}-${flange}-enabled`;
        enabled.name = `${flange}.enabled`;
        enabled.checked = grid.enabled;
        inputs.set(enabled.name, enabled);
        const toggle = document.createElement("label");
        toggle.className = style.toggle;
        toggle.htmlFor = enabled.id;
        toggle.append(enabled, I18n.translate("fabrication.enableHoles"));
        const layout = document.createElement("div");
        layout.className = style.gridInputs;
        layout.append(
            numberField("fabrication.columns", `${flange}.columns`, grid.columns, true),
            numberField("fabrication.rows", `${flange}.rows`, grid.rows, true),
            numberField("fabrication.pitchX", `${flange}.pitchX`, grid.pitchX),
            numberField("fabrication.pitchY", `${flange}.pitchY`, grid.pitchY),
            numberField("fabrication.diameter", `${flange}.diameter`, grid.diameter),
        );
        fieldset.append(legend, toggle, layout);
        return fieldset;
    }

    const horizontal = gridFields("horizontal", initial.horizontal);
    const vertical = gridFields("vertical", initial.vertical);
    fields.append(horizontal, vertical);
    const preview = document.createElement("aside");
    preview.className = style.preview;
    preview.setAttribute("aria-label", I18n.translate("fabrication.preview"));
    body.append(fields, preview);
    const footer = document.createElement("footer");
    footer.className = style.footer;
    const error = document.createElement("p");
    error.id = `${id}-error`;
    error.className = style.error;
    error.setAttribute("role", "alert");
    error.setAttribute("aria-live", "polite");
    error.tabIndex = -1;
    form.setAttribute("aria-describedby", error.id);
    const actions = document.createElement("div");
    actions.className = style.actions;
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = I18n.translate("common.cancel");
    cancel.addEventListener("click", () => dialog.close());
    const apply = document.createElement("button");
    apply.type = "submit";
    apply.className = style.primary;
    const actionKey = mode === "create" ? "fabrication.create" : "fabrication.apply";
    apply.textContent = I18n.translate(actionKey);
    actions.append(cancel, apply);
    footer.append(error, actions);
    form.append(header, body, footer);
    dialog.append(form);
    let busy = false;

    function readGrid(flange: "horizontal" | "vertical"): HoleGrid {
        return {
            enabled: inputs.get(`${flange}.enabled`)!.checked,
            columns: inputs.get(`${flange}.columns`)!.valueAsNumber,
            rows: inputs.get(`${flange}.rows`)!.valueAsNumber,
            pitchX: inputs.get(`${flange}.pitchX`)!.valueAsNumber,
            pitchY: inputs.get(`${flange}.pitchY`)!.valueAsNumber,
            diameter: inputs.get(`${flange}.diameter`)!.valueAsNumber,
        };
    }

    function readParameters(): FabricationParameters {
        return {
            kind: kind.value as "plate" | "bracket",
            width: inputs.get("width")!.valueAsNumber,
            length: inputs.get("length")!.valueAsNumber,
            height: inputs.get("height")!.valueAsNumber,
            thickness: inputs.get("thickness")!.valueAsNumber,
            horizontal: readGrid("horizontal"),
            vertical: readGrid("vertical"),
        };
    }

    function updateDraft(): void {
        const bracket = kind.value === "bracket";
        heightField.hidden = !bracket;
        inputs.get("height")!.disabled = !bracket;
        vertical.hidden = !bracket;
        for (const [flange, grid] of [
            ["horizontal", horizontal],
            ["vertical", vertical],
        ] as const) {
            const enabled = inputs.get(`${flange}.enabled`)!;
            enabled.disabled = flange === "vertical" && !bracket;
            for (const input of grid.querySelectorAll<HTMLInputElement>('input[type="number"]')) {
                input.disabled = enabled.disabled || !enabled.checked;
            }
        }
        const parameters = readParameters();
        const validation = validateFabricationParameters(parameters);
        error.textContent = validation.isOk ? "" : validation.error;
        renderPreview(preview, validation.isOk ? validation.value : undefined);
    }

    form.addEventListener("input", updateDraft);
    form.addEventListener("change", updateDraft);
    // Keep document shortcuts away from inputs, including Delete and Escape.
    dialog.addEventListener("keydown", (event) => event.stopPropagation());
    dialog.addEventListener("cancel", (event) => {
        if (busy) event.preventDefault();
    });
    dialog.addEventListener("close", () => {
        dialog.remove();
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        resolveClosed();
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (busy) return;
        const validation = validateFabricationParameters(readParameters());
        if (!validation.isOk) {
            error.textContent = validation.error;
            const invalid = form.querySelector<HTMLInputElement>("input:enabled:invalid");
            (invalid ?? error).focus();
            return;
        }
        busy = true;
        form.setAttribute("aria-busy", "true");
        const controls = [
            ...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
                "input, select, button",
            ),
        ];
        controls.forEach((control) => {
            control.disabled = true;
        });
        apply.textContent = I18n.translate("fabrication.building");
        error.textContent = "";
        // Paint the busy state before the synchronous CAD operation begins.
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        try {
            const result = await submit(validation.value);
            if (result.isOk && result.value) {
                dialog.close();
            } else {
                error.textContent = result.isOk ? I18n.translate("fabrication.failed") : result.error;
            }
        } catch {
            error.textContent = I18n.translate("fabrication.failed");
        } finally {
            busy = false;
            form.removeAttribute("aria-busy");
            controls.forEach((control) => {
                control.disabled = false;
            });
            apply.textContent = I18n.translate(actionKey);
            // Restore the draft-dependent disabled controls without overwriting a kernel error.
            const failure = error.textContent;
            updateDraft();
            error.textContent = failure;
            if (dialog.open && failure) error.focus();
        }
    });
    updateDraft();
    document.body.append(dialog);
    dialog.showModal();
    kind.focus();
    return closed;
}

function field(key: I18nKeys, control: HTMLInputElement | HTMLSelectElement, unit?: string): HTMLElement {
    const label = document.createElement("label");
    label.className = style.field;
    label.htmlFor = control.id;
    const text = document.createElement("span");
    text.textContent = `${I18n.translate(key)}${unit ? ` (${unit})` : ""}`;
    label.append(text, control);
    return label;
}

function renderPreview(container: HTMLElement, parameters?: FabricationParameters): void {
    container.replaceChildren();
    const title = document.createElement("h3");
    title.textContent = I18n.translate("fabrication.preview");
    const note = document.createElement("p");
    note.textContent = I18n.translate("fabrication.layoutNote");
    container.append(title, note);
    if (!parameters) {
        const invalid = document.createElement("p");
        invalid.textContent = I18n.translate("fabrication.previewInvalid");
        container.append(invalid);
        return;
    }
    const ns = "http://www.w3.org/2000/svg";
    for (const flange of parameters.kind === "bracket"
        ? (["horizontal", "vertical"] as const)
        : (["horizontal"] as const)) {
        const span = flange === "horizontal" ? parameters.length : parameters.height;
        const padding = Math.max(parameters.width, span) * 0.06;
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute(
            "viewBox",
            `${-padding} ${-padding} ${parameters.width + 2 * padding} ${span + 2 * padding}`,
        );
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", I18n.translate(`fabrication.${flange}`));
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("width", String(parameters.width));
        rect.setAttribute("height", String(span));
        rect.classList.add(style.stock);
        svg.append(rect);
        if (parameters.kind === "bracket") {
            const corner = document.createElementNS(ns, "rect");
            corner.setAttribute("width", String(parameters.width));
            corner.setAttribute("height", String(parameters.thickness));
            corner.classList.add(style.corner);
            svg.append(corner);
        }
        for (const center of fabricationHoleCenters(parameters, flange)) {
            const circle = document.createElementNS(ns, "circle");
            circle.setAttribute("cx", String(center.x));
            circle.setAttribute("cy", String(center.y));
            circle.setAttribute("r", String(parameters[flange].diameter / 2));
            circle.classList.add(style.hole);
            svg.append(circle);
        }
        const caption = document.createElement("p");
        caption.className = style.caption;
        caption.textContent = `${I18n.translate(`fabrication.${flange}`)} · ${parameters.width} × ${span} mm`;
        container.append(svg, caption);
    }
}
