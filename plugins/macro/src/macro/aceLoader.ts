// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

const ACE_VERSION = "1.44.0";
const ACE_BASE = `https://cdn.jsdelivr.net/npm/ace-builds@${ACE_VERSION}/src-min-noconflict`;

export interface AceEditor {
    getValue(): string;
    setTheme(theme: string): void;
    destroy(): void;
    focus(): void;
}

export interface AceApi {
    version: string;
    config: { set(key: string, value: string): void };
    edit(element: HTMLElement, options: { mode: string; selectionStyle: string }): AceEditor;
}

let pending: Promise<AceApi> | undefined;

function currentAce(): AceApi | undefined {
    return (globalThis as typeof globalThis & { ace?: AceApi }).ace;
}

function configure(ace: AceApi): AceApi {
    if (
        ace.version !== ACE_VERSION ||
        typeof ace.edit !== "function" ||
        typeof ace.config?.set !== "function"
    ) {
        throw new Error("A different or incomplete syntax editor is already loaded.");
    }
    ace.config.set("basePath", ACE_BASE);
    return ace;
}

export function loadAce(): Promise<AceApi> {
    const existing = currentAce();
    if (existing) {
        return Promise.resolve().then(() => configure(existing));
    }
    if (pending) return pending;

    pending = new Promise<AceApi>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `${ACE_BASE}/ace.js`;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.onload = () => {
            script.onload = null;
            script.onerror = null;
            try {
                const ace = currentAce();
                if (!ace) throw new Error("The syntax editor did not initialize.");
                resolve(configure(ace));
            } catch (error) {
                script.remove();
                reject(error);
            }
        };
        script.onerror = () => {
            script.onload = null;
            script.onerror = null;
            script.remove();
            reject(new Error("The syntax editor could not be downloaded."));
        };
        document.head.appendChild(script);
    }).finally(() => {
        pending = undefined;
    });
    return pending;
}
