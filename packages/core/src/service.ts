// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { IApplication } from "./application";
import type { IDocument } from "./document";

export interface IService {
    register(app: IApplication): void;
    start(): void;
    stop(): void;
    settleDocumentCommand?(document: IDocument): Promise<void>;
}
