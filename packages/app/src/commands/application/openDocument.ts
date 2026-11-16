// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    command,
    I18n,
    type IApplication,
    type ICommand,
    readFileAsync,
    type Serialized,
} from "@chili3d/core";

@command({
    key: "doc.open",
    icon: "icon-open",
    isApplicationCommand: true,
})
export class OpenDocument implements ICommand {
    async execute(app: IApplication): Promise<void> {
        const progress = app.mainWindow?.showProgress;
        if (!progress) throw new Error("Cannot open document: progress display is unavailable");
        await progress.call(
            app.mainWindow,
            async () => {
                const files = await readFileAsync(".cd", false);
                if (!files.isOk) {
                    if (files.error === "cancel") return;
                    throw new Error(`Cannot read document: ${files.error}`);
                }
                const json: Serialized = JSON.parse(files.value[0].data);
                const document = await app.loadDocument(json);
                document?.application.activeView?.cameraController.fitContent();
            },
            "toast.excuting{0}",
            I18n.translate("command.doc.open"),
        );
    }
}
