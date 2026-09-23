// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// Registers the shared `@chili3d/element` mock with `realEvents: true`, for tests
// that trigger handlers via `el.click()` / real event dispatch instead of `_on*`
// fields. Import this module BEFORE the module under test.

import { rs } from "@rstest/core";

rs.mock("@chili3d/element", () => {
    const { createElementMocks } = rs.hoisted(() => require("./elementMocks"));
    return createElementMocks({ realEvents: true });
});
