// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { command, I18n, type IApplication, type ICommand, PubSub, Result, Transaction } from "@chili3d/core";
import { defaultFabricationParameters } from "../bodys/fabricationParameters";
import { buildFabricationShape, FabricationPartNode } from "../bodys/fabricationPart";
import { showFabricationDialog } from "./fabricationDialog";

@command({ key: "fabrication.create", icon: "icon-box", isApplicationCommand: true })
export class CreateFabricationPart implements ICommand {
    async execute(application: IApplication): Promise<void> {
        const originalDocument = application.activeView?.document;
        await showFabricationDialog(defaultFabricationParameters(), "create", async (parameters) => {
            if (originalDocument && !application.documents.has(originalDocument)) {
                return Result.err(I18n.translate("fabrication.documentClosed"));
            }
            const candidate = buildFabricationShape(parameters);
            if (!candidate.isOk) return Result.err(candidate.error);
            let node: FabricationPartNode | undefined;
            try {
                // A failed geometry operation must not leave an empty document behind.
                const document =
                    originalDocument ??
                    application.activeView?.document ??
                    (await application.newDocument(I18n.translate("fabrication.documentName")));
                node = new FabricationPartNode({ document, parameters, initialShape: candidate.value });
                const part = node;
                Transaction.execute(document, I18n.translate("command.fabrication.create"), () => {
                    document.modelManager.addNode(part);
                });
            } catch {
                if (node) node.dispose();
                else candidate.value.dispose();
                return Result.err(I18n.translate("fabrication.failed"));
            }
            node.document.selection.setSelectedNodes([node], false);
            node.document.visual.update();
            if (application.activeView?.document === node.document) {
                application.activeView.cameraController.fitContent();
            }
            PubSub.default.pub("displayHome", false);
            return Result.ok(true);
        });
    }
}

@command({ key: "fabrication.edit", icon: "icon-edit" })
export class EditFabricationPart implements ICommand {
    async execute(application: IApplication): Promise<void> {
        const document = application.activeView?.document;
        const selected = document?.selection.getSelectedNodes() ?? [];
        const part = selected[0];
        if (!document || selected.length !== 1 || !(part instanceof FabricationPartNode)) {
            PubSub.default.pub("showToast", "fabrication.selectPart");
            return;
        }
        await showFabricationDialog(part.parameters, "edit", async (parameters) => {
            if (!application.documents.has(document)) {
                return Result.err(I18n.translate("fabrication.documentClosed"));
            }
            if (document.modelManager.findNode((node) => node === part) !== part) {
                return Result.err(I18n.translate("fabrication.selectPart"));
            }
            const result = part.applyParameters(parameters);
            if (!result.isOk) return result;
            document.visual.update();
            // Applying an unchanged valid draft is also a successful submission.
            return Result.ok(true);
        });
    }
}
