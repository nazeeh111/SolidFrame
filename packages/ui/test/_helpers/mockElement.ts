// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// Registers the shared `@chili3d/element` mock (default options) at module scope.
// Import this module BEFORE the module under test.

import { rs } from "@rstest/core";

rs.mock("@chili3d/element", () => {
    const { createElementMocks } = rs.hoisted(() => require("./elementMocks"));
    return createElementMocks();
});
