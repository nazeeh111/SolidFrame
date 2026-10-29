// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { createMockApplication, createMockDocument, createMockView } from "@chili3d/core/test-utils";
import { afterEach, expect, rs, test } from "@rstest/core";

rs.mock("../src/home/home.module.css", () => ({
    document: "recent-project",
    delete: "delete-project",
    count: "project-count",
    empty: "empty-projects",
}));

import { Home } from "../src/home/home";

afterEach(() => {
    document.body.replaceChildren();
    rs.restoreAllMocks();
});

test("opening an already-open recent project activates its view", async () => {
    const first = createMockDocument({ id: "first" });
    const second = createMockDocument({ id: "second" });
    const app = createMockApplication({
        storage: { page: async () => [{ id: first.id, name: "First", date: Date.now(), image: "" }] },
    });
    const firstView = createMockView({ document: first });
    const secondView = createMockView({ document: second });
    app.documents.add(first);
    app.documents.add(second);
    app.views.push(firstView, secondView);
    app.activeView = secondView;
    const home = new Home(app);
    await home.render();
    document.body.append(home);
    const card = home.querySelector<HTMLElement>(".recent-project > button");
    expect(card).not.toBeNull();
    card?.click();
    expect(app.activeView).toBe(firstView);
    home.remove();
});

test("deleting the last recent project updates the count and empty state", async () => {
    const deleted = rs.fn(async () => true);
    const app = createMockApplication({
        storage: {
            page: async () => [{ id: "saved", name: "Saved", date: Date.now(), image: "" }],
            delete: deleted,
        },
    });
    rs.spyOn(window, "confirm").mockReturnValue(true);
    const home = new Home(app);
    await home.render();
    document.body.append(home);
    expect(home.querySelector(".project-count")?.textContent).toBe("01");
    const remove = home.querySelector<HTMLButtonElement>(".delete-project");
    expect(remove).not.toBeNull();
    await remove?.onclick?.call(remove, new PointerEvent("click"));
    expect(deleted).toHaveBeenCalledTimes(2);
    expect(home.querySelector(".project-count")?.textContent).toBe("00");
    expect(home.querySelector(".recent-project")).toBeNull();
    expect(home.querySelector<HTMLElement>(".empty-projects")?.style.display).toBe("block");
});

test("keyboard events from home controls do not reach modeling shortcuts", () => {
    const home = new Home(createMockApplication());
    const control = document.createElement("button");
    home.append(control);
    document.body.append(home);
    const modelingShortcut = rs.fn();
    window.addEventListener("keydown", modelingShortcut);
    try {
        control.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        control.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
        expect(modelingShortcut).not.toHaveBeenCalled();
    } finally {
        window.removeEventListener("keydown", modelingShortcut);
    }
});
