// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

// Browser-only integration entry. Run with scripts/save-browser.config.mjs.
// Uses a dedicated localhost origin and synthetic records, never a user's database.
import { AppBuilder } from "@chili3d/builder";
import { Constants, type IApplication, Plane, PubSub, Transaction } from "@chili3d/core";
import { IndexedDBStorage } from "@chili3d/storage";
import { BoxNode } from "../src/bodys/box";
import { SaveDocument } from "../src/commands/application/saveDocument";
import { SaveDocumentToFile } from "../src/commands/application/toFile";
import { Document } from "../src/document";

function check(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

async function rejects(action: Promise<unknown>, name: string) {
    const error = await action.then(
        () => undefined,
        (error: unknown) => error,
    );
    check(error instanceof DOMException && error.name === name, `Expected ${name}, got ${String(error)}`);
}

function gate() {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { promise, release };
}

async function storageChecks(report: string[]) {
    const storage = new IndexedDBStorage();
    const db = `save-contract-${crypto.randomUUID()}`;
    await storage.createDBIfNeeded(db, ["documents", "recents"]);
    const writes = (name: string) => [
        { table: "documents", id: "fixture", value: { name } },
        { table: "recents", id: "fixture", value: { name } },
    ];
    await storage.putMany(db, writes("last-good"));
    try {
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open(db, 2);
            request.onupgradeneeded = () => {
                request
                    .transaction!.objectStore("recents")
                    .createIndex("unique-name", "name", { unique: true });
            };
            request.onsuccess = () => {
                request.result.close();
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
        await rejects(
            storage.putMany(db, [
                writes("bad")[0],
                { table: "recents", id: "duplicate", value: { name: "last-good" } },
            ]),
            "ConstraintError",
        );
        check(
            (await storage.get(db, "documents", "fixture")).name === "last-good",
            "asynchronous request failure rolls back document",
        );
        check((await storage.get(db, "recents", "duplicate")) === undefined, "failed record absent");
        report.push("Asynchronous second-request ConstraintError rolls back the first write");

        await rejects(
            storage.putMany(db, [
                writes("bad")[0],
                { table: "recents", id: "fixture", value: { uncloneable: () => {} } },
            ]),
            "DataCloneError",
        );
        for (const table of ["documents", "recents"]) {
            check((await storage.get(db, table, "fixture")).name === "last-good", `${table} rolled back`);
        }
        report.push("Second enqueue DataCloneError rolls back both stores");

        // Abort from the second request's success handler: both requests succeeded,
        // but the transaction has not yet committed.
        const originalPut = IDBObjectStore.prototype.put;
        const originalTransaction = IDBDatabase.prototype.transaction;
        const events: string[] = [];
        IDBDatabase.prototype.transaction = function (...args: Parameters<IDBDatabase["transaction"]>) {
            const transaction = originalTransaction.apply(this, args);
            if (this.name === db) {
                // Register before storage's onabort so this observer precedes promise reactions.
                transaction.addEventListener("abort", () => events.push("transaction-abort"));
            }
            return transaction;
        };
        IDBObjectStore.prototype.put = function (value, key) {
            const request = originalPut.call(this, value, key);
            if (this.transaction.db.name === db && this.name === "recents") {
                const transaction = this.transaction;
                request.addEventListener("success", () => {
                    events.push("request-success");
                    transaction.abort();
                });
            }
            return request;
        };
        try {
            await rejects(storage.putMany(db, writes("aborted")), "AbortError");
            events.push("promise-rejected");
        } finally {
            IDBObjectStore.prototype.put = originalPut;
            IDBDatabase.prototype.transaction = originalTransaction;
        }
        check(
            events.join(",") === "request-success,transaction-abort,promise-rejected",
            `Settlement order: ${events.join(",")}`,
        );
        for (const table of ["documents", "recents"]) {
            check((await storage.get(db, table, "fixture")).name === "last-good", `${table} abort rollback`);
        }
        report.push(
            "Request success followed by abort rejects only after transaction end; both stores intact",
        );
        await storage.putMany(db, writes("recovered"));
        check((await storage.get(db, "documents", "fixture")).name === "recovered", "retry commit");
        check((await storage.get(db, "recents", "fixture")).name === "recovered", "retry recents");
        report.push("Successful retry commits both records");
    } finally {
        await new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(db);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

async function cadChecks(app: IApplication, report: string[]) {
    const first = (await app.newDocument("Save fixture A")) as Document;
    const box = new BoxNode({ document: first, plane: Plane.XY, dx: 10, dy: 20, dz: 30 });
    first.modelManager.addNode(box);
    check(box.shape.isOk, "initial OCCT box");
    const viewA = app.activeView!;
    viewA.cameraController.fitContent();
    const second = await app.newDocument("Save fixture B");
    const viewB = app.activeView!;
    app.activeView = viewA;
    const expectedImage = viewA.toImage();
    first.userData = { nested: { revision: 1 } };
    const storage = app.storage;
    const originalBatch = storage.putMany.bind(storage);
    const blocked = gate();
    let starts = 0;
    storage.putMany = async (db, writes) => {
        starts++;
        await blocked.promise;
        return originalBatch(db, writes);
    };
    const firstSave = first.save();
    Transaction.execute(first, "Edit box depth", () => {
        box.dz = 45;
    });
    first.name = "Save fixture A edited";
    (first.userData["nested"] as { revision: number }).revision = 2;
    app.activeView = viewB;
    try {
        blocked.release();
        await firstSave;
    } finally {
        storage.putMany = originalBatch;
    }
    const saved = await storage.get(Constants.DBName, Constants.DocumentTable, first.id);
    const recent = await storage.get(Constants.DBName, Constants.RecentTable, first.id);
    check(saved.name === "Save fixture A" && saved.userData.nested.revision === 1, "snapshot detached");
    check(recent.name === saved.name && recent.image === expectedImage, "metadata belongs to A");
    const reopened = await Document.open(app, first.id);
    check(reopened, "saved document reopens");
    const reopenedBox = reopened.modelManager.rootNode.firstChild as BoxNode;
    check(reopenedBox && reopenedBox.dz === 30 && reopenedBox.shape.isOk, "reopened pre-edit OCCT geometry");
    reopened.dispose();
    app.documents.delete(reopened);
    report.push("Real CAD save/edit/switch/reopen preserves pre-edit 10×20×30 box and owned thumbnail");

    // Exercise command ownership even when the UI defers running the action.
    const originalPub = PubSub.default.pub;
    let action: (() => Promise<void>) | undefined;
    const toasts: string[] = [];
    PubSub.default.pub = ((channel: string, ...args: unknown[]) => {
        if (channel === "showPermanent") action = args[0] as () => Promise<void>;
        else if (channel === "showToast") toasts.push(String(args[0]));
    }) as typeof originalPub;
    try {
        app.activeView = viewA;
        await new SaveDocument().execute(app);
        app.activeView = viewB;
        check(action, "deferred command received");
        await (action as () => Promise<void>)();
        check(
            (await storage.get(Constants.DBName, Constants.DocumentTable, first.id)).name === first.name,
            "command saved originally selected A",
        );
        check(
            (await storage.get(Constants.DBName, Constants.DocumentTable, second.id)) === undefined,
            "command did not save B",
        );
        check(toasts.includes("toast.document.saved"), "success notification");
        report.push("Deferred save command saves A after switching to B");

        const beforeFailure = await storage.get(Constants.DBName, Constants.DocumentTable, first.id);
        const beforeRecent = await storage.get(Constants.DBName, Constants.RecentTable, first.id);
        const originalPut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (value, key) {
            if (this.name === Constants.RecentTable && key === first.id) {
                return originalPut.call(this, { bad: () => {} }, key);
            }
            return originalPut.call(this, value, key);
        };
        first.name = "Failed save must stay editable";
        toasts.length = 0;
        try {
            app.activeView = viewA;
            await new SaveDocument().execute(app);
            check(action, "failed save action");
            await rejects(action(), "DataCloneError");
        } finally {
            IDBObjectStore.prototype.put = originalPut;
        }
        check(!toasts.includes("toast.document.saved"), "no false saved notification");
        check(
            JSON.stringify(await storage.get(Constants.DBName, Constants.DocumentTable, first.id)) ===
                JSON.stringify(beforeFailure),
            "CAD payload unchanged after failed save",
        );
        check(
            JSON.stringify(await storage.get(Constants.DBName, Constants.RecentTable, first.id)) ===
                JSON.stringify(beforeRecent),
            "CAD recent unchanged after failed save",
        );
        check(app.documents.has(first) && box.dz === 45, "failed save preserves live edits");
        const recovered = await Document.open(app, first.id);
        check(recovered && recovered.name === beforeFailure.name, "failed save reopens previous commit");
        const recoveredBox = recovered.modelManager.rootNode.firstChild as BoxNode;
        check(recoveredBox.dz === 45 && recoveredBox.shape.isOk, "last committed CAD geometry");
        recovered.dispose();
        app.documents.delete(recovered);
        report.push(
            "Failed CAD save rolls back both records, emits no saved toast, and reopens the previous CAD commit",
        );
    } finally {
        PubSub.default.pub = originalPub;
    }

    const orderGate = gate();
    starts = 0;
    const names: string[] = [];
    storage.putMany = async (db, writes) => {
        starts++;
        if (starts === 1) await orderGate.promise;
        names.push((writes[0].value as { name: string }).name);
        return originalBatch(db, writes);
    };
    first.name = "Queued first";
    const one = first.save();
    first.name = "Queued second";
    const two = first.save();
    first.name = "Unsaved third";
    try {
        await Promise.resolve();
        check(starts === 1, "second save waits for predecessor");
        orderGate.release();
        await Promise.all([one, two]);
    } finally {
        orderGate.release();
        storage.putMany = originalBatch;
    }
    check(names.join(",") === "Queued first,Queued second", "commit order");
    check(
        (await storage.get(Constants.DBName, Constants.DocumentTable, first.id)).name === "Queued second",
        "latest requested snapshot wins, excluding unsaved later edit",
    );
    report.push("Overlapping saves preserve call order and recover after the preceding failure");

    // Verify the native save-to-file command through its actual download bytes.
    app.activeView = viewA;
    const originalCreateURL = URL.createObjectURL;
    const downloads: Blob[] = [];
    URL.createObjectURL = (blob) => {
        check(blob instanceof Blob, "download is a Blob");
        downloads.push(blob);
        return originalCreateURL(blob);
    };
    action = undefined;
    PubSub.default.pub = ((channel: string, ...args: unknown[]) => {
        if (channel === "showPermanent") action = args[0] as () => Promise<void>;
    }) as typeof originalPub;
    try {
        await new SaveDocumentToFile().execute(app);
        check(action, "native file action");
        await (action as () => Promise<void>)();
    } finally {
        PubSub.default.pub = originalPub;
        URL.createObjectURL = originalCreateURL;
    }
    check(downloads.length === 1, "one native .cd download");
    const data = JSON.parse(await downloads[0].text());
    check(data.version === Document.version && data.id === first.id, "native .cd schema unchanged");
    const loaded = await app.loadDocument(data);
    check(loaded, ".cd reopens");
    const loadedBox = loaded.modelManager.rootNode.firstChild as BoxNode;
    check(loadedBox && loadedBox.dz === 45 && loadedBox.shape.isOk, ".cd restores editable geometry");
    Transaction.execute(loaded, "Edit reopened box", () => {
        loadedBox.dx = 12;
    });
    check(loadedBox.shape.isOk && loadedBox.dx === 12, "reopened model editable");
    loaded.history.undo();
    check(Number(loadedBox.dx) === 10 && loadedBox.shape.isOk, "undo on reopened model");
    report.push("Native .cd download reopens editable 10×20×45 CAD geometry; edit/undo still works");

    const stl = await app.dataExchange.export(".stl", [loadedBox]);
    const step = await app.dataExchange.export(".step", [loadedBox]);
    check(stl && step, "exports returned bytes");
    const stlText = await new Blob(stl).text();
    const stepText = await new Blob(step).text();
    check(stlText.includes("facet normal") && stepText.includes("ISO-10303-21"), "STL and STEP contents");
    loaded.visual.update();
    app.activeView?.cameraController.fitContent();
    report.push(
        `Real OCCT STL (${stlText.length} chars) and STEP (${stepText.length} chars) exports succeed`,
    );
    return { documentId: first.id, stlBytes: stlText.length, stepBytes: stepText.length };
}

const ready = new AppBuilder().useIndexedDB().useWasmOcc().useParametric().useThree().useUI().build();

Object.assign(globalThis, {
    saveFixture: {
        ready,
        async run() {
            const report: string[] = [];
            const app = await ready;
            await storageChecks(report);
            const cad = await cadChecks(app, report);
            return { passed: report.length, report, ...cad };
        },
    },
});
