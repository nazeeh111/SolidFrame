// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// Registers the CSS-module mocks shared by several UI tests at module scope.
// `rs.mock` paths resolve relative to THIS file, hence `../../src/...`.
// Importing this module registers mocks for modules a test may never load —
// unused registrations are harmless.

import { rs } from "@rstest/core";

rs.mock("../../src/property/propertyBase.module.css", () => ({
    panel: "pb-panel",
}));

rs.mock("../../src/property/common.module.css", () => ({
    panel: "cm-panel",
    propertyName: "cm-property-name",
}));

rs.mock("../../src/property/input.module.css", () => ({
    box: "ip-box",
}));

rs.mock("../../src/project/toolBar.module.css", () => ({
    panel: "tb-panel",
    svg: "tb-svg",
}));

rs.mock("../../src/project/tree/treeItemGroup.module.css", () => ({
    group: "tig-group",
    header: "tig-header",
    children: "tig-children",
}));
