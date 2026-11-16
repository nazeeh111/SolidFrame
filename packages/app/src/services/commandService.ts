// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    CancelableCommand,
    type CommandKeys,
    CommandStore,
    type IApplication,
    type ICommand,
    type IDocument,
    type IService,
    type IView,
    isCancelableCommand,
    Logger,
    PubSub,
} from "@chili3d/core";

export class CommandService implements IService {
    private _checking: boolean = false;
    private dispatching = false;
    private _app: IApplication | undefined;
    private running?: {
        command: ICommand;
        document: IDocument | undefined;
        finished: Promise<void>;
        phase: "setup" | "running";
        cancelRequested: boolean;
    };

    private get app(): IApplication {
        if (this._app === undefined) {
            throw new Error("Executor is not initialized");
        }
        return this._app;
    }

    start(): void {
        PubSub.default.sub("executeCommand", this.executeCommand);
        PubSub.default.sub("activeViewChanged", this.onActiveViewChanged);
        Logger.info(`${CommandService.name} started`);
    }

    stop(): void {
        PubSub.default.remove("executeCommand", this.executeCommand);
        PubSub.default.remove("activeViewChanged", this.onActiveViewChanged);
        Logger.info(`${CommandService.name} stoped`);
    }

    register(app: IApplication) {
        this._app = app;
        Logger.info(`${CommandService.name} registed`);
    }

    private readonly onActiveViewChanged = async (view: IView | undefined) => {
        const running = this.running;
        if (running?.phase === "setup" && running.command === this.app.executingCommand) {
            // Setup can be invalidated synchronously before execute() has begun.
            running.cancelRequested = true;
            return;
        }
        if (this.app.executingCommand && isCancelableCommand(this.app.executingCommand))
            await this.app.executingCommand.cancel();
    };

    private readonly executeCommand = async (commandName: CommandKeys) => {
        if (this.dispatching) return;
        this.dispatching = true;
        let execution: Promise<void> | undefined;
        try {
            const document = this.app.activeView?.document;
            const command = commandName === "special.last" ? this.app.lastCommand : commandName;
            if (!command || document?.isCloseInProgress || !(await this.canExecute(command))) return;
            // Checking can await cancellation. Do not start on a different or closing document.
            if (this.app.activeView?.document !== document || document?.isCloseInProgress) return;
            Logger.info(`executing command ${command}`);
            execution = this.executeAsync(command, document);
        } finally {
            // Release after the running record is installed, so another command can cancel it.
            this.dispatching = false;
        }
        await execution;
    };

    private async executeAsync(commandName: CommandKeys, document: IDocument | undefined) {
        const commandCtor = CommandStore.getCommand(commandName)!;
        if (!commandCtor) {
            Logger.error(`Can not find ${commandName} command`);
            return;
        }

        const command = new commandCtor();
        let finish!: () => void;
        let fail!: (error: unknown) => void;
        const finished = new Promise<void>((resolve, reject) => {
            finish = resolve;
            fail = reject;
        });
        // A command may fail without a close waiter; its UI error is reported below.
        void finished.catch(() => {});
        let commandFailure: unknown;
        let failed = false;
        const running: NonNullable<typeof this.running> = {
            command,
            document,
            finished,
            phase: "setup",
            cancelRequested: false,
        };
        this.running = running;
        this.app.executingCommand = command;
        PubSub.default.pub("showProperties", this.app.activeView?.document!, []);
        // Property observers may synchronously switch or close the target.
        if (
            running.cancelRequested ||
            this.app.activeView?.document !== document ||
            document?.isCloseInProgress
        ) {
            if (command instanceof CancelableCommand) {
                command.abandonBeforeExecute();
                if (running.cancelRequested)
                    void command.cancel().catch((error: unknown) => Logger.error(error));
            }
            this.app.executingCommand = undefined;
            if (this.running === running) this.running = undefined;
            finish();
            return;
        }

        running.phase = "running";
        await Promise.try(command.execute.bind(command), this.app)
            .catch((err) => {
                failed = true;
                commandFailure = err;
                PubSub.default.pub("displayError", err as string);
                Logger.error(err);
            })
            .finally(() => {
                this.app.lastCommand = commandName;
                this.app.executingCommand = undefined;
                if (this.running === running) this.running = undefined;
                if (failed) fail(commandFailure);
                else finish();
            });
    }

    async settleDocumentCommand(document: IDocument): Promise<void> {
        const running = this.running;
        if (!running || running.document !== document) return;
        if (running.phase === "setup") {
            running.cancelRequested = true;
            await running.finished;
            return;
        }
        if (isCancelableCommand(running.command)) await running.command.cancel();
        await running.finished;
    }

    private async canExecute(commandName: CommandKeys) {
        if (this._checking) return false;
        this._checking = true;
        try {
            return await this.checking(commandName);
        } finally {
            this._checking = false;
        }
    }

    private async checking(commandName: CommandKeys) {
        const commandData = CommandStore.getComandData(commandName);
        if (!commandData?.isApplicationCommand && this.app.activeView === undefined) {
            Logger.error("No active document");
            return false;
        }
        if (!this.app.executingCommand) {
            return true;
        }
        if (CommandStore.getComandData(this.app.executingCommand)?.key === commandName) {
            PubSub.default.pub("showToast", "toast.command.{0}excuting", commandName);
            return false;
        }
        if (isCancelableCommand(this.app.executingCommand)) {
            const running = this.running;
            await this.app.executingCommand.cancel();
            if (running) await running.finished.catch(() => {});
            return true;
        }
        return false;
    }
}
