// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    type Act,
    Constants,
    History,
    type IApplication,
    type IDocument,
    Id,
    InternalClassName,
    type IPicker,
    type ISelection,
    type IVariableTable,
    type IVisual,
    Logger,
    ModelManager,
    Observable,
    ObservableCollection,
    PubSub,
    type Serialized,
    Serializer,
    VariableTable,
} from "@chili3d/core";
import { Picker } from "./picker";
import { SelectionManager } from "./selectionManager";

export class Document extends Observable implements IDocument {
    readonly visual: IVisual;
    readonly history: History;
    readonly selection: ISelection;
    readonly picker: IPicker;
    readonly acts = new ObservableCollection<Act>();
    readonly modelManager: ModelManager;
    /** Document-wide parameters shared by every body and sketch. */
    readonly variables: IVariableTable;
    userData: Record<string, unknown> = {};
    private pendingSave: Promise<void> = Promise.resolve();
    private readonly inFlightSaves = new Set<Promise<void>>();
    private pendingClose?: Promise<boolean>;
    private closeCommitted = false;

    get isCloseInProgress(): boolean {
        return this.closeCommitted;
    }

    static readonly version = __DOCUMENT_VERSION__;

    get name(): string {
        return this.getPrivateValue("name");
    }
    set name(name: string) {
        if (this.name === name) return;
        this.setProperty("name", name);
        if (this.modelManager.rootNode) this.modelManager.rootNode.name = name;
    }

    constructor(
        readonly application: IApplication,
        name: string,
        readonly id: string = Id.generate(),
    ) {
        super();
        this.setPrivateValue("name", name);
        this.modelManager = new ModelManager(this);
        this.history = new History();
        this.variables = new VariableTable(this);
        this.selection = new SelectionManager(this);
        this.picker = new Picker(this);
        this.visual = application.visualFactory.create(this);

        application.documents.add(this);
    }

    serialize(): Serialized {
        const serialized = {
            [InternalClassName]: "Document",
            version: __DOCUMENT_VERSION__,
            id: this.id,
            name: this.name,
            models: this.modelManager.serialize(),
            variables: this.variables.items,
            acts: this.acts.map((x) => Serializer.serializeObject(x)),
            userData: this.userData,
        };
        return serialized;
    }

    override disposeInternal(): void {
        super.disposeInternal();

        this.modelManager.dispose();
        this.visual.dispose();
        this.history.dispose();
        this.variables.dispose();
        this.selection.dispose();
        this.acts.forEach((x) => x.dispose());
        this.acts.clear();
    }

    async save(): Promise<void> {
        if (this.closeCommitted || this._isDisposed) throw new Error("Document is closing or closed");
        return this.enqueueSave();
    }

    private async enqueueSave(): Promise<void> {
        // serialize() can retain nested user data; edits must not change a queued snapshot.
        const data = structuredClone(this.serialize());
        const activeView = this.application.activeView;
        const view =
            activeView?.document === this
                ? activeView
                : this.application.views.find((candidate) => candidate.document === this);
        const recent = {
            id: this.id,
            name: data["name"],
            date: Date.now(),
            image: view?.toImage(),
        };
        const saved = this.pendingSave.then(() =>
            this.application.storage.putMany(Constants.DBName, [
                { table: Constants.DocumentTable, id: this.id, value: data },
                { table: Constants.RecentTable, id: this.id, value: recent },
            ]),
        );
        this.inFlightSaves.add(saved);
        void saved.then(
            () => this.inFlightSaves.delete(saved),
            () => this.inFlightSaves.delete(saved),
        );
        this.pendingSave = saved.catch(() => {
            // Release the queue after failure; the caller still receives the rejected save.
        });
        return saved;
    }

    close(): Promise<boolean> {
        if (this.pendingClose) return this.pendingClose;
        if (this._isDisposed) return Promise.resolve(false);
        const confirm = this.application.mainWindow?.confirmDocumentClose;
        if (!confirm) return Promise.resolve(false);
        const close = confirm.call(
            this.application.mainWindow,
            this.name,
            async () => {
                this.closeCommitted = true;
                try {
                    await this.settleCommands();
                    await this.enqueueSave();
                    this.finishClose();
                } catch (error) {
                    this.closeCommitted = false;
                    throw error;
                }
            },
            async () => {
                this.closeCommitted = true;
                try {
                    await this.settleCommands();
                    await Promise.all([...this.inFlightSaves]);
                    this.finishClose();
                } catch (error) {
                    this.closeCommitted = false;
                    throw error;
                }
            },
        );
        this.pendingClose = close;
        void close.then(
            () => {
                this.pendingClose = undefined;
            },
            () => {
                this.pendingClose = undefined;
            },
        );
        return close;
    }

    private async settleCommands() {
        for (const service of this.application.services) {
            await service.settleDocumentCommand?.(this);
        }
    }

    private finishClose() {
        const views = this.application.views.filter((x) => x.document === this);
        this.application.views.remove(...views);
        for (const view of views) view.dispose();
        if (this.application.activeView?.document === this) {
            this.application.activeView = this.application.views.at(0);
        }
        this.application.documents.delete(this);
        PubSub.default.pub("documentClosed", this);
        Logger.info(`document: ${this.name} closed`);
        this.dispose();
    }

    static async open(application: IApplication, id: string) {
        const data = (await application.storage.get(
            Constants.DBName,
            Constants.DocumentTable,
            id,
        )) as Serialized;
        if (data === undefined) {
            Logger.warn(`document: ${id} not find`);
            return;
        }
        const document = await Document.load(application, data);
        if (document !== undefined) {
            Logger.info(`document: ${document.name} opened`);
        }
        return document;
    }

    static async load(app: IApplication, data: Serialized): Promise<IDocument | undefined> {
        if ((data as any).version !== __DOCUMENT_VERSION__) {
            alert(
                "The file version has been upgraded, no compatibility treatment was done in the development phase",
            );
            return undefined;
        }
        const document = new Document(app, data["name"], data["id"]);
        try {
            document.history.disabled = true;
            // Before the models: a body's feature chain resolves its parameters against
            // the table, and deserializing a body rebuilds it.
            document.variables.setItems(data["variables"] ?? []);
            document.acts.push(
                ...data["acts"].map((x: Serialized) => Serializer.deserializeObject(document, x)),
            );
            if (data["userData"]) {
                document.userData = data["userData"];
            }

            await document.modelManager.deserialize(data["models"]);
            document.history.disabled = false;
            return document;
        } catch (error) {
            app.documents.delete(document);
            try {
                document.dispose();
            } catch (cleanupError) {
                Logger.error("Failed to dispose a partially loaded document", cleanupError);
            }
            throw error;
        }
    }
}
