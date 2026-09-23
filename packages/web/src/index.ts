// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { AppBuilder } from "@chili3d/builder";
import type { IApplication } from "@chili3d/core";
import { Loading } from "./loading";
import { runStartupActions } from "./startupActions";

const loading = new Loading();
document.body.appendChild(loading);

async function handleApplicaionBuilt(app: IApplication) {
    document.body.removeChild(loading);

    await runStartupActions(app, window.location.search, (message) => alert(message));
}

// prettier-ignore
new AppBuilder()
    .useIndexedDB()
    .useWasmOcc()
    .useParametric()
    .useThree()
    .useUI()
    .build()
    .then(handleApplicaionBuilt)
    .catch((err) => {
        loading.showError(err instanceof Error ? err.message : String(err));
    });
