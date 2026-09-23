// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { parseStartupParams } from "./startupParams";

/** URL parameters may open geometry, but can never authorize executable plugins. */
export async function runStartupActions(
    app: { loadFileFromUrl(url: string): Promise<void> },
    search: string,
    notify: (message: string) => void,
): Promise<void> {
    const { plugins, fileUrl } = parseStartupParams(search);
    if (plugins.length) {
        notify(
            "SolidFrame ignored a plugin in this link. Only open plugin files you trust using the explicit import controls.",
        );
    }
    if (!fileUrl) return;
    try {
        const url = new URL(fileUrl, window.location.href);
        const filename = decodeURIComponent(url.pathname).toLowerCase();
        if (
            !["http:", "https:"].includes(url.protocol) ||
            !/\.(cd|step|stp|iges|igs|brep|stl)$/.test(filename)
        ) {
            notify(
                "This link is not a supported model file. Open a CD, STEP, IGES, BREP, or STL file instead.",
            );
            return;
        }
        await app.loadFileFromUrl(url.href);
    } catch {
        notify("The model link could not be opened. Check the address or import a local copy.");
    }
}
