// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// Registers a shared `@chili3d/core` mock whose PubSub stub records `sub`
// handlers, so tests can look them up and invoke them directly.
// Import this module BEFORE the module under test.

import { rs } from "@rstest/core";

const recorder = rs.hoisted(() => {
    const { createPubSubRecorder } = require("./coreMocks");
    return createPubSubRecorder();
});

/** Records handlers passed to `PubSub.default.sub`, keyed by topic. */
export const pubSubHandlers = recorder.handlers;

rs.mock("@chili3d/core", () => {
    const actual = rs.hoisted(() => require("@chili3d/core"));
    const { LocalizeMock, BindingMock, TransactionMock } = rs.hoisted(() => require("./coreMocks"));
    return {
        ...actual,
        Localize: LocalizeMock,
        Binding: BindingMock,
        Transaction: TransactionMock,
        PubSub: recorder.stub,
    };
});
