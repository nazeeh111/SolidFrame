// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import type { CommandIcon } from "@chili3d/core";
import { createIcon } from "@chili3d/element";
import style from "./ribbonButton.module.css";

/** Keep custom plugin artwork unchanged while treating built-in command symbols consistently. */
export function createRibbonIcon(icon: CommandIcon): Element {
    const element = createIcon(icon);
    if (typeof icon === "string") element.classList.add(style.builtInIcon);
    return element;
}
