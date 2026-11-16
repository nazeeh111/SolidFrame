# Local document save contract

Saving is a snapshot operation. `Document.save()` synchronously captures serialized model data,
nested user data, name, timestamp and a thumbnail from one of that document's views. Edits made
after that call belong to a subsequent save. A document without a view has no thumbnail.

`SaveDocument` retains the document selected when the command is invoked and starts its snapshot
before the loading UI callback. A deferred callback cannot switch the save target or leave that
save outside the document’s queue when a close is requested.

Each live `Document` instance orders its saves through a promise tail. A failed save rejects
its caller and releases the tail so another save can proceed. Different instances, including
separately loaded copies with the same ID and other browser tabs, do not share this queue.
Conflict resolution across those editors is outside this contract. A close without saving waits
for already-started saves, while Save and close queues a final snapshot. Cancel and save failure
leave the document open; the close dialog prevents edits while its chosen action is in progress.
Before either close action takes a snapshot or disposes the document, the command service settles
its active operation: cancelable commands are cancelled and awaited, while other running commands
are awaited. Command completion errors keep the document open. A command retains its starting
document and view, and closing a different document does not cancel it. New commands targeting a
document are blocked after its close action begins.

`IStorage.putMany` commits the document and its recent-entry metadata in one atomic transaction.
The IndexedDB adapter includes both object stores in a `readwrite` transaction and resolves
only on `complete`. Request success is not commit. An asynchronous request error aborts the
transaction; a synchronous enqueue error explicitly aborts previously queued writes. Both
failure paths reject only after `abort`, leaving the previous committed records intact.
Existing `put` delegates to this same write path.

The document schema, database stores, file version, `.cd` serialization and CAD export formats
are unchanged. History remains independent of persistence. This is licensed maintenance of the
Chili3d-derived product, not a clean-room replacement.

## Verification

Unit regressions:

```sh
npm ci --ignore-scripts
npm test -- packages/app/test/documentSave.test.ts packages/storage/test/indexedDBStorage.test.ts
```

Browser integration uses the existing checked-in WASM and real IndexedDB:

```sh
npx rspack dev --config scripts/save-browser.config.mjs
```

Open `http://127.0.0.1:8183` in a fresh disposable Chromium profile. In that page's console:

```js
await globalThis.saveFixture.ready;
await globalThis.saveFixture.run();
```

The fixture creates synthetic CAD documents in that origin's `solidframe-db`, triggers one local
`.cd` download, and leaves the reopened editable box visible for inspection. It also creates and
deletes a uniquely named database for transaction-failure checks. Use a fresh profile so this
fixture never shares user documents. The fixture and its entry configuration are not part of the
production entry point.

Checks cover request-success-then-abort, an asynchronous uniqueness failure, a synchronous
second-enqueue cloning failure, save/edit/switch/reopen, failed-save rollback/reopen, deferred
command ownership, ordered saves, native `.cd` roundtrip/edit/undo, and real OCCT STL/STEP exports.
The unit-test IndexedDB shim intentionally does not model isolation or rollback; only the browser
fixture establishes those behaviors. These checks do not simulate physical disk exhaustion,
browser crashes or power loss.

API references checked through Context7's MDN content:
- https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction
- https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event
