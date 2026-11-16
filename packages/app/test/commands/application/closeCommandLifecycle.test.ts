// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type AsyncController,
    CancelableCommand,
    type CommandKeys,
    CommandStore,
    Constants,
    type IDocument,
    type IStep,
    PubSub,
    type SnapResult,
    type StorageWrite,
    XYZ,
} from "@chili3d/core";
import { createMockApplication, createMockView } from "@chili3d/core/test-utils";
import { expect, rs, test } from "@rstest/core";
import { BezierCommand } from "../../../src/commands/create/bezier";
import { Document } from "../../../src/document";
import { CommandService } from "../../../src/services/commandService";

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

class PendingBezier extends BezierCommand {
    static latest?: PendingBezier;
    constructor() {
        super();
        PendingBezier.latest = this;
    }
    readonly waiting = deferred();
    readonly release = deferred();
    cancellationObserved = false;
    completedOn?: IDocument;
    completedView?: import("@chili3d/core").IView;
    private points = 0;

    protected override getSteps(): IStep[] {
        const step: IStep = {
            execute: async (_document: IDocument, controller: AsyncController) => {
                this.points++;
                if (this.points <= 2) {
                    controller.success();
                    return {
                        point: new XYZ({ x: this.points, y: 0, z: 0 }),
                        shapes: [],
                    } as unknown as SnapResult;
                }
                this.waiting.resolve();
                await new Promise<void>((done) =>
                    controller.onCancelled(() => {
                        this.cancellationObserved = true;
                        done();
                    }),
                );
                await this.release.promise;
                return undefined;
            },
        };
        return [step, step];
    }

    protected override executeMainTask() {
        this.completedOn = this.document;
        this.completedView = this.view;
        this.document.userData!["completed"] = true;
    }
}

test("close settles a pending Bezier before capturing and disposing its document", async () => {
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(PendingBezier, { key: "test.pendingBezier", icon: "test" });
    const writes: StorageWrite[][] = [];
    Object.assign(app.storage, {
        putMany: async (_db: string, records: readonly StorageWrite[]) => {
            writes.push(structuredClone([...records]));
        },
    });
    const doc = new Document(app, "fixture");
    const view = createMockView({ document: doc });
    app.views.push(view);
    app.activeView = view;
    PubSub.default.pub("executeCommand", "test.pendingBezier" as CommandKeys);
    await rs.waitFor(() => expect(PendingBezier.latest).toBeDefined());
    const command = PendingBezier.latest!;
    await command.waiting.promise;
    Object.assign(app, {
        mainWindow: {
            confirmDocumentClose: async (_name: string, save: () => Promise<void>) => {
                await save();
                return true;
            },
        },
    });
    const close = doc.close();
    try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(command.cancellationObserved).toBe(true);
        expect(app.activeView).toBe(view);
        expect(app.documents.has(doc)).toBe(true);
        expect(writes).toHaveLength(0);
    } finally {
        if (!command.cancellationObserved) void command.cancel();
        command.release.resolve();
        await close;
        await rs.waitFor(() => expect(app.executingCommand).toBeUndefined());
        service.stop();
        CommandStore.unregisterCommand("test.pendingBezier");
        PendingBezier.latest = undefined;
    }
    expect(command.completedOn).toBe(doc);
    const saved = writes[0].find((write) => write.table === Constants.DocumentTable)?.value as {
        userData: { completed?: boolean };
    };
    expect(saved.userData.completed).toBe(true);
});

test("closing an inactive document does not cancel another document's command", async () => {
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(PendingBezier, { key: "test.pendingBezier", icon: "test" });
    const active = new Document(app, "active");
    const inactive = new Document(app, "inactive");
    const activeView = createMockView({ document: active });
    app.views.push(activeView, createMockView({ document: inactive }));
    app.activeView = activeView;
    PubSub.default.pub("executeCommand", "test.pendingBezier" as CommandKeys);
    await rs.waitFor(() => expect(PendingBezier.latest).toBeDefined());
    const command = PendingBezier.latest!;
    await command.waiting.promise;
    Object.assign(app, {
        mainWindow: {
            confirmDocumentClose: async (
                _name: string,
                _save: () => Promise<void>,
                discard: () => Promise<void>,
            ) => {
                await discard();
                return true;
            },
        },
    });
    try {
        expect(await inactive.close()).toBe(true);
        expect(command.cancellationObserved).toBe(false);
        expect(app.activeView).toBe(activeView);
        expect(app.documents.has(active)).toBe(true);
    } finally {
        void command.cancel();
        command.release.resolve();
        await rs.waitFor(() => expect(app.executingCommand).toBeUndefined());
        service.stop();
        CommandStore.unregisterCommand("test.pendingBezier");
        PendingBezier.latest = undefined;
        active.dispose();
    }
});

test("closing a command's original document after a view switch settles and saves that document", async () => {
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(PendingBezier, { key: "test.pendingBezier", icon: "test" });
    const writes: StorageWrite[][] = [];
    Object.assign(app.storage, {
        putMany: async (_db: string, records: readonly StorageWrite[]) => {
            writes.push(structuredClone([...records]));
        },
    });
    const original = new Document(app, "original");
    const other = new Document(app, "other");
    const originalView = createMockView({ document: original });
    const otherView = createMockView({ document: other });
    app.views.push(originalView, otherView);
    app.activeView = originalView;
    PubSub.default.pub("executeCommand", "test.pendingBezier" as CommandKeys);
    await rs.waitFor(() => expect(PendingBezier.latest).toBeDefined());
    const command = PendingBezier.latest!;
    await command.waiting.promise;
    app.activeView = otherView;
    Object.assign(app, {
        mainWindow: {
            confirmDocumentClose: async (_name: string, save: () => Promise<void>) => {
                await save();
                return true;
            },
        },
    });
    const close = original.close();
    try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(command.cancellationObserved).toBe(true);
        expect(writes).toHaveLength(0);
        command.release.resolve();
        expect(await close).toBe(true);
        expect(command.completedOn).toBe(original);
        expect(command.completedView).toBe(originalView);
        expect(other.userData["completed"]).toBeUndefined();
        expect(app.activeView).toBe(otherView);
        const saved = writes[0].find((write) => write.table === Constants.DocumentTable)?.value as {
            userData: { completed?: boolean };
        };
        expect(saved.userData.completed).toBe(true);
    } finally {
        command.release.resolve();
        await close;
        await rs.waitFor(() => expect(app.executingCommand).toBeUndefined());
        service.stop();
        CommandStore.unregisterCommand("test.pendingBezier");
        PendingBezier.latest = undefined;
        other.dispose();
    }
});

test("a command waiting to start cannot run after a close decision", async () => {
    class ProbeCommand {
        static executions = 0;
        async execute() {
            ProbeCommand.executions++;
        }
    }
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(PendingBezier, { key: "test.pendingBezier", icon: "test" });
    CommandStore.registerCommand(ProbeCommand, { key: "test.next", icon: "test" });
    const doc = new Document(app, "fixture");
    const view = createMockView({ document: doc });
    app.views.push(view);
    app.activeView = view;
    PubSub.default.pub("executeCommand", "test.pendingBezier" as CommandKeys);
    await rs.waitFor(() => expect(PendingBezier.latest).toBeDefined());
    const command = PendingBezier.latest!;
    await command.waiting.promise;
    PubSub.default.pub("executeCommand", "test.next" as CommandKeys);
    await rs.waitFor(() => expect(command.cancellationObserved).toBe(true));
    Object.assign(app, {
        mainWindow: {
            confirmDocumentClose: async (
                _name: string,
                _save: () => Promise<void>,
                discard: () => Promise<void>,
            ) => {
                await discard();
                return true;
            },
        },
    });
    const close = doc.close();
    try {
        command.release.resolve();
        expect(await close).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(ProbeCommand.executions).toBe(0);
    } finally {
        command.release.resolve();
        await close;
        service.stop();
        CommandStore.unregisterCommand("test.pendingBezier");
        CommandStore.unregisterCommand("test.next");
        PendingBezier.latest = undefined;
    }
});

test("a non-cancelable command settles before the close snapshot", async () => {
    const gate = deferred();
    const started = deferred();
    class PendingCommand {
        async execute(app: import("@chili3d/core").IApplication) {
            const owner = app.activeView!.document;
            started.resolve();
            await gate.promise;
            owner.userData!["completed"] = true;
        }
    }
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(PendingCommand, { key: "test.pending", icon: "test" });
    const writes: StorageWrite[][] = [];
    Object.assign(app.storage, {
        putMany: async (_db: string, records: readonly StorageWrite[]) => {
            writes.push(structuredClone([...records]));
        },
    });
    const doc = new Document(app, "fixture");
    const view = createMockView({ document: doc });
    app.views.push(view);
    app.activeView = view;
    PubSub.default.pub("executeCommand", "test.pending" as CommandKeys);
    await started.promise;
    Object.assign(app, {
        mainWindow: {
            confirmDocumentClose: async (_name: string, save: () => Promise<void>) => {
                await save();
                return true;
            },
        },
    });
    const close = doc.close();
    try {
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(writes).toHaveLength(0);
        expect(app.documents.has(doc)).toBe(true);
        gate.resolve();
        expect(await close).toBe(true);
        const saved = writes[0].find((write) => write.table === Constants.DocumentTable)?.value as {
            userData: { completed?: boolean };
        };
        expect(saved.userData.completed).toBe(true);
    } finally {
        gate.resolve();
        await close;
        service.stop();
        CommandStore.unregisterCommand("test.pending");
    }
});

test("command finalization failure prevents close and snapshot", async () => {
    class FailingBezier extends PendingBezier {
        protected override executeMainTask() {
            throw new Error("finalization failed");
        }
    }
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(FailingBezier, { key: "test.failingBezier", icon: "test" });
    const writes: StorageWrite[][] = [];
    Object.assign(app.storage, {
        putMany: async (_db: string, records: readonly StorageWrite[]) => {
            writes.push([...records]);
        },
    });
    const doc = new Document(app, "fixture");
    const view = createMockView({ document: doc });
    app.views.push(view);
    app.activeView = view;
    PubSub.default.pub("executeCommand", "test.failingBezier" as CommandKeys);
    await rs.waitFor(() => expect(PendingBezier.latest).toBeDefined());
    const command = PendingBezier.latest!;
    await command.waiting.promise;
    let failure: unknown;
    Object.assign(app, {
        mainWindow: {
            confirmDocumentClose: async (_name: string, save: () => Promise<void>) => {
                try {
                    await save();
                } catch (error) {
                    failure = error;
                }
                return false;
            },
        },
    });
    const close = doc.close();
    try {
        await rs.waitFor(() => expect(command.cancellationObserved).toBe(true));
        command.release.resolve();
        expect(await close).toBe(false);
        expect(failure).toEqual(new Error("finalization failed"));
        expect(writes).toHaveLength(0);
        expect(app.documents.has(doc)).toBe(true);
        expect(app.views.contains(view)).toBe(true);
        expect(doc.isCloseInProgress).toBe(false);
    } finally {
        command.release.resolve();
        await close;
        service.stop();
        CommandStore.unregisterCommand("test.failingBezier");
        PendingBezier.latest = undefined;
        doc.dispose();
    }
});

test("cancelling the close prompt leaves the modeling command running", async () => {
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(PendingBezier, { key: "test.pendingBezier", icon: "test" });
    const doc = new Document(app, "fixture");
    const view = createMockView({ document: doc });
    app.views.push(view);
    app.activeView = view;
    PubSub.default.pub("executeCommand", "test.pendingBezier" as CommandKeys);
    await rs.waitFor(() => expect(PendingBezier.latest).toBeDefined());
    const command = PendingBezier.latest!;
    await command.waiting.promise;
    Object.assign(app, { mainWindow: { confirmDocumentClose: async () => false } });
    try {
        expect(await doc.close()).toBe(false);
        expect(command.cancellationObserved).toBe(false);
        expect(app.executingCommand).toBe(command);
        expect(app.activeView).toBe(view);
        expect(doc.isCloseInProgress).toBe(false);
    } finally {
        void command.cancel();
        command.release.resolve();
        await rs.waitFor(() => expect(app.executingCommand).toBeUndefined());
        service.stop();
        CommandStore.unregisterCommand("test.pendingBezier");
        PendingBezier.latest = undefined;
        doc.dispose();
    }
});

test("command cleanup failure does not hang close or dispose the document", async () => {
    class CleanupFailure extends PendingBezier {
        protected override afterExecute() {
            throw new Error("cleanup failed");
        }
    }
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(CleanupFailure, { key: "test.cleanupFailure", icon: "test" });
    const doc = new Document(app, "fixture");
    const view = createMockView({ document: doc });
    app.views.push(view);
    app.activeView = view;
    PubSub.default.pub("executeCommand", "test.cleanupFailure" as CommandKeys);
    await rs.waitFor(() => expect(PendingBezier.latest).toBeDefined());
    const command = PendingBezier.latest!;
    await command.waiting.promise;
    let failure: unknown;
    Object.assign(app, {
        mainWindow: {
            confirmDocumentClose: async (_name: string, save: () => Promise<void>) => {
                try {
                    await save();
                } catch (error) {
                    failure = error;
                }
                return false;
            },
        },
    });
    const close = doc.close();
    try {
        await rs.waitFor(() => expect(command.cancellationObserved).toBe(true));
        command.release.resolve();
        expect(
            await Promise.race([
                close,
                new Promise((_, reject) => setTimeout(() => reject(new Error("close hung")), 1000)),
            ]),
        ).toBe(false);
        expect(failure).toEqual(new Error("cleanup failed"));
        expect(app.documents.has(doc)).toBe(true);
        expect(app.views.contains(view)).toBe(true);
    } finally {
        command.release.resolve();
        service.stop();
        CommandStore.unregisterCommand("test.cleanupFailure");
        PendingBezier.latest = undefined;
        doc.dispose();
    }
});

test("a synchronous view change during command setup prevents dispatch to the wrong document", async () => {
    class ProbeCommand {
        static executions = 0;
        async execute() {
            ProbeCommand.executions++;
        }
    }
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(ProbeCommand, { key: "test.viewRace", icon: "test" });
    const first = new Document(app, "first");
    const second = new Document(app, "second");
    const firstView = createMockView({ document: first });
    const secondView = createMockView({ document: second });
    app.views.push(firstView, secondView);
    app.activeView = firstView;
    let observed = false;
    const switchView = () => {
        observed = true;
        app.activeView = secondView;
    };
    PubSub.default.sub("showProperties", switchView);
    try {
        PubSub.default.pub("executeCommand", "test.viewRace" as CommandKeys);
        await rs.waitFor(() => expect(observed).toBe(true));
        await rs.waitFor(() => expect(app.executingCommand).toBeUndefined());
        expect(ProbeCommand.executions).toBe(0);
        expect(app.activeView).toBe(secondView);
    } finally {
        PubSub.default.remove("showProperties", switchView);
        service.stop();
        CommandStore.unregisterCommand("test.viewRace");
        first.dispose();
        second.dispose();
    }
});

test("simultaneous command requests install only one running operation", async () => {
    const gate = deferred();
    const started = deferred();
    class PendingCommand {
        static executions = 0;
        async execute() {
            PendingCommand.executions++;
            started.resolve();
            await gate.promise;
        }
    }
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(PendingCommand, { key: "test.simultaneous", icon: "test" });
    const doc = new Document(app, "fixture");
    const view = createMockView({ document: doc });
    app.views.push(view);
    app.activeView = view;
    try {
        PubSub.default.pub("executeCommand", "test.simultaneous" as CommandKeys);
        PubSub.default.pub("executeCommand", "test.simultaneous" as CommandKeys);
        await started.promise;
        expect(PendingCommand.executions).toBe(1);
    } finally {
        gate.resolve();
        await rs.waitFor(() => expect(app.executingCommand).toBeUndefined());
        service.stop();
        CommandStore.unregisterCommand("test.simultaneous");
        doc.dispose();
    }
});

test("a cancelable command abandoned during setup cannot later execute", async () => {
    class SetupProbe extends CancelableCommand {
        static latest?: SetupProbe;
        static executions = 0;
        constructor() {
            super();
            SetupProbe.latest = this;
        }
        protected async executeAsync() {
            SetupProbe.executions++;
        }
    }
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(SetupProbe, { key: "test.setupProbe", icon: "test" });
    const first = new Document(app, "first");
    const second = new Document(app, "second");
    app.activeView = createMockView({ document: first });
    const otherView = createMockView({ document: second });
    const switchView = () => {
        app.activeView = otherView;
        PubSub.default.pub("activeViewChanged", otherView);
    };
    PubSub.default.sub("showProperties", switchView);
    try {
        PubSub.default.pub("executeCommand", "test.setupProbe" as CommandKeys);
        await rs.waitFor(() => expect(SetupProbe.latest?.isCompleted).toBe(true));
        const command = SetupProbe.latest!;
        expect(command.isCanceled).toBe(true);
        await command.cancel();
        await command.execute(app);
        expect(SetupProbe.executions).toBe(0);
        expect(app.executingCommand).toBeUndefined();
    } finally {
        PubSub.default.remove("showProperties", switchView);
        service.stop();
        CommandStore.unregisterCommand("test.setupProbe");
        first.dispose();
        second.dispose();
    }
});

test("a close chosen synchronously during command setup does not deadlock or run the command", async () => {
    class SetupProbe extends CancelableCommand {
        static latest?: SetupProbe;
        static executions = 0;
        constructor() {
            super();
            SetupProbe.latest = this;
        }
        protected async executeAsync() {
            SetupProbe.executions++;
        }
    }
    const service = new CommandService();
    const app = createMockApplication({ services: [service] });
    service.register(app);
    service.start();
    CommandStore.registerCommand(SetupProbe, { key: "test.setupClose", icon: "test" });
    const doc = new Document(app, "fixture");
    const view = createMockView({ document: doc });
    app.views.push(view);
    app.activeView = view;
    Object.assign(app, {
        mainWindow: {
            confirmDocumentClose: async (_name: string, save: () => Promise<void>) => {
                await save();
                return true;
            },
        },
    });
    let close: Promise<boolean> | undefined;
    const requestClose = () => {
        close = doc.close();
    };
    PubSub.default.sub("showProperties", requestClose);
    try {
        PubSub.default.pub("executeCommand", "test.setupClose" as CommandKeys);
        await rs.waitFor(() => expect(close).toBeDefined());
        expect(
            await Promise.race([
                close!,
                new Promise((_, reject) => setTimeout(() => reject(new Error("close hung")), 1000)),
            ]),
        ).toBe(true);
        expect(SetupProbe.executions).toBe(0);
        expect(SetupProbe.latest?.isCompleted).toBe(true);
        expect(app.documents.has(doc)).toBe(false);
        expect(app.executingCommand).toBeUndefined();
    } finally {
        PubSub.default.remove("showProperties", requestClose);
        service.stop();
        CommandStore.unregisterCommand("test.setupClose");
        doc.dispose();
    }
});
