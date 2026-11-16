// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { resolve } from "node:path";
import base from "../rspack.config.ts";

export default {
    ...base,
    entry: { main: resolve(import.meta.dirname, "../packages/app/test/save.browser.ts") },
    output: { ...base.output, path: resolve(import.meta.dirname, "../build/save-browser") },
    devServer: { host: "127.0.0.1", port: 8183 },
};
