// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { Constants, PubSub, type StorageWrite } from "@chili3d/core";
import { createMockApplication, createMockView } from "@chili3d/core/test-utils";
import { afterEach, expect, rs, test } from "@rstest/core";
import { SaveDocument } from "../src/commands/application/saveDocument";
import { Document } from "../src/document";

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
const documents: Document[] = [];

function fixture(write: (records: readonly StorageWrite[]) => Promise<void>) {
    const app = createMockApplication();
    Object.assign(app.storage, {
        put: async (_db: string, table: string, id: string, value: unknown) => {
            await write([{ table, id, value }]);
            return true;
        },
        putMany: async (_db: string, records: readonly StorageWrite[]) => write(records),
    });
    const document = new Document(app, "original", "owned-document");
    documents.push(document);
    const view = createMockView({ document, toImage: () => "original-thumbnail" });
    app.views.push(view);
    app.activeView = view;
    return { app, document, view };
}

afterEach(() => {
    for (const document of documents.splice(0)) document.dispose();
    rs.restoreAllMocks();
});

test("a deferred save command retains the document selected when invoked", async () => {
    const { app, document } = fixture(async () => {});
    const other = new Document(app, "other");
    documents.push(other);
    const saveOriginal = rs.spyOn(document, "save").mockResolvedValue(undefined);
    const saveOther = rs.spyOn(other, "save").mockResolvedValue(undefined);
    let action: (() => Promise<void>) | undefined;
    const capture = (callback: () => Promise<void>) => {
        action = callback;
    };
    PubSub.default.sub("showPermanent", capture);
    try {
        await new SaveDocument().execute(app);
        app.activeView = createMockView({ document: other });
        expect(action).not.toBeUndefined();
        await action!();
        expect(saveOriginal).toHaveBeenCalledTimes(1);
        expect(saveOther).not.toHaveBeenCalled();
    } finally {
        PubSub.default.remove("showPermanent", capture);
    }
});

test("payload, nested data, name and thumbnail describe the same pre-await snapshot", async () => {
    const gate = deferred();
    const records = new Map<string, unknown>();
    const { app, document } = fixture(async (writes) => {
        await gate.promise;
        for (const write of writes) records.set(write.table, structuredClone(write.value));
    });
    document.userData = { nested: { revision: 1 } };
    const pending = document.save();
    document.name = "edited";
    (document.userData["nested"] as { revision: number }).revision = 2;
    app.activeView = createMockView({ toImage: () => "unrelated-thumbnail" });
    gate.resolve();
    await pending;
    expect(records.get(Constants.DocumentTable)).toMatchObject({
        name: "original",
        userData: { nested: { revision: 1 } },
    });
    expect(records.get(Constants.RecentTable)).toMatchObject({
        id: document.id,
        name: "original",
        image: "original-thumbnail",
    });
});

test("saving an inactive document uses its own view, and no unrelated thumbnail when viewless", async () => {
    const batches: StorageWrite[][] = [];
    const { app, document, view } = fixture(async (writes) => {
        batches.push(structuredClone([...writes]));
    });
    app.activeView = createMockView({ toImage: () => "unrelated-thumbnail" });
    await document.save();
    expect(batches.flat().find((r) => r.table === Constants.RecentTable)?.value).toMatchObject({
        image: "original-thumbnail",
    });
    batches.length = 0;
    app.views.remove(view);
    await document.save();
    expect(batches.flat().find((r) => r.table === Constants.RecentTable)?.value).toMatchObject({
        image: undefined,
    });
});

test("failure to persist recents cannot replace the last committed document", async () => {
    const records = new Map<string, unknown>([
        [Constants.DocumentTable, { name: "last-good-document" }],
        [Constants.RecentTable, { name: "last-good-recent" }],
    ]);
    const failure = new DOMException("Storage full", "QuotaExceededError");
    const { document } = fixture(async (writes) => {
        if (writes.some((r) => r.table === Constants.RecentTable)) throw failure;
        for (const write of writes) records.set(write.table, structuredClone(write.value));
    });
    await expect(document.save()).rejects.toBe(failure);
    expect(records.get(Constants.DocumentTable)).toEqual({ name: "last-good-document" });
    expect(records.get(Constants.RecentTable)).toEqual({ name: "last-good-recent" });
});

test("overlapping saves commit invocation snapshots in order", async () => {
    const gate = deferred();
    const started: string[] = [];
    const committed: string[] = [];
    const { document } = fixture(async (writes) => {
        const data = writes.find((r) => r.table === Constants.DocumentTable)?.value as
            | { name: string }
            | undefined;
        if (!data) return;
        started.push(data.name);
        if (data.name === "original") await gate.promise;
        committed.push(data.name);
    });
    const first = document.save();
    document.name = "second";
    const second = document.save();
    document.name = "unsaved-edit";
    try {
        await turn();
        expect(started).toEqual(["original"]);
    } finally {
        gate.resolve();
        await Promise.all([first, second]);
    }
    expect(committed).toEqual(["original", "second"]);
});

test("a failed queued save rejects its caller and does not block the next snapshot", async () => {
    const failure = new DOMException("Aborted", "AbortError");
    const committed: string[] = [];
    const { document } = fixture(async (writes) => {
        const data = writes.find((r) => r.table === Constants.DocumentTable)?.value as
            | { name: string }
            | undefined;
        if (data?.name === "original") throw failure;
        if (data) committed.push(data.name);
    });
    const first = expect(document.save()).rejects.toBe(failure);
    document.name = "retry";
    const second = document.save();
    await first;
    await second;
    expect(committed).toEqual(["retry"]);
});

test("cancel and repeated close requests preserve the document and share one prompt", async () => {
    const { app, document, view } = fixture(async () => {});
    let cancel!: (result: boolean) => void;
    const prompt = rs.fn(
        () =>
            new Promise<boolean>((resolve) => {
                cancel = resolve;
            }),
    );
    Object.assign(app, { mainWindow: { confirmDocumentClose: prompt } });
    const first = document.close();
    const second = document.close();
    expect(prompt).toHaveBeenCalledTimes(1);
    cancel(false);
    expect(await first).toBe(false);
    expect(await second).toBe(false);
    expect(app.documents.has(document)).toBe(true);
    expect(app.views.contains(view)).toBe(true);
});

test("failed close save leaves the document editable and can be cancelled", async () => {
    const failure = new DOMException("Aborted", "AbortError");
    const { app, document, view } = fixture(async () => {
        throw failure;
    });
    let received: unknown;
    Object.assign(app, {
        mainWindow: {
            confirmDocumentClose: async (_name: string, save: () => Promise<void>) => {
                try {
                    await save();
                } catch (error) {
                    received = error;
                }
                return false;
            },
        },
    });
    expect(await document.close()).toBe(false);
    expect(received).toBe(failure);
    expect(app.documents.has(document)).toBe(true);
    expect(app.views.contains(view)).toBe(true);
    document.name = "still-editable";
    expect(document.name).toBe("still-editable");
});

test("close without saving waits for an already queued save", async () => {
    const gate = deferred();
    const { app, document, view } = fixture(async () => gate.promise);
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
    const saved = document.save();
    const close = document.close();
    await turn();
    expect(app.documents.has(document)).toBe(true);
    expect(app.views.contains(view)).toBe(true);
    await expect(document.save()).rejects.toThrow("closing or closed");
    gate.resolve();
    await saved;
    expect(await close).toBe(true);
    expect(app.documents.has(document)).toBe(false);
    expect(app.views.contains(view)).toBe(false);
});

test("save and close waits for the newest snapshot and closes once", async () => {
    const gate = deferred();
    const committed: string[] = [];
    const { app, document } = fixture(async (writes) => {
        const data = writes.find((write) => write.table === Constants.DocumentTable)?.value as {
            name: string;
        };
        if (data.name === "original") await gate.promise;
        committed.push(data.name);
    });
    Object.assign(app, {
        mainWindow: {
            confirmDocumentClose: async (_name: string, save: () => Promise<void>) => {
                await save();
                return true;
            },
        },
    });
    const first = document.save();
    document.name = "latest";
    const close = document.close();
    await turn();
    expect(app.documents.has(document)).toBe(true);
    gate.resolve();
    await first;
    expect(await close).toBe(true);
    expect(committed).toEqual(["original", "latest"]);
    expect(app.documents.has(document)).toBe(false);
});

test("a save command deferred by its UI is queued before close without saving", async () => {
    const gate = deferred();
    const { app, document, view } = fixture(async () => gate.promise);
    let action: (() => Promise<void>) | undefined;
    const capture = (callback: () => Promise<void>) => {
        action = callback;
    };
    PubSub.default.sub("showPermanent", capture);
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
        await new SaveDocument().execute(app);
        expect(action).toBeDefined();
        const close = document.close();
        await turn();
        expect(app.views.contains(view)).toBe(true);
        gate.resolve();
        expect(await close).toBe(true);
        await action!();
    } finally {
        gate.resolve();
        PubSub.default.remove("showPermanent", capture);
    }
});

test("a failed in-flight save prevents close without saving", async () => {
    const gate = deferred();
    const failure = new Error("write failed");
    const { app, document, view } = fixture(async () => {
        await gate.promise;
        throw failure;
    });
    let received: unknown;
    Object.assign(app, {
        mainWindow: {
            confirmDocumentClose: async (
                _name: string,
                _save: () => Promise<void>,
                discard: () => Promise<void>,
            ) => {
                try {
                    await discard();
                } catch (error) {
                    received = error;
                }
                return false;
            },
        },
    });
    const saved = expect(document.save()).rejects.toBe(failure);
    const close = document.close();
    gate.resolve();
    await saved;
    expect(await close).toBe(false);
    expect(received).toBe(failure);
    expect(app.documents.has(document)).toBe(true);
    expect(app.views.contains(view)).toBe(true);
});

test("closing an inactive document preserves the active view and disposes its own view", async () => {
    const { app, document, view } = fixture(async () => {});
    const dispose = rs.spyOn(view, "dispose");
    const other = new Document(app, "other");
    documents.push(other);
    const otherView = createMockView({ document: other });
    app.views.push(otherView);
    app.activeView = otherView;
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
    expect(await document.close()).toBe(true);
    expect(app.activeView).toBe(otherView);
    expect(dispose).toHaveBeenCalledTimes(1);
});
