// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import { I18n, type IApplication, type Locale, type Plugin } from "@chili3d/core";
import { PluginManager } from "../src/pluginManager";

test("unloading one plugin preserves another plugin's translations", async () => {
    const language = "review-plugin-isolation";
    const locale: Locale = {
        display: "Plugin isolation fixture",
        language,
        translation: { "common.cancel": "Cancel" } as Locale["translation"],
    };
    const resource = (translation: Record<string, string>): Plugin => ({
        i18nResources: [
            { display: locale.display, language, translation: translation as Locale["translation"] },
        ],
    });
    I18n.addLanguage(locale);
    try {
        const manager = new PluginManager({} as IApplication);
        const first = resource({ "plugin.first.title": "First tool" });
        const second = resource({ "plugin.second.title": "Second tool", constructor: "Constructor tool" });
        manager["registerPlugin"](first);
        manager["registerPlugin"](second);
        manager.plugins.set("first", first);
        manager.plugins.set("second", second);
        expect(locale.translation["plugin.first.title"]).toBe("First tool");
        expect(locale.translation["plugin.second.title"]).toBe("Second tool");
        expect(Object.getOwnPropertyDescriptor(locale.translation, "constructor")?.value).toBe(
            "Constructor tool",
        );

        await manager.unload("first");

        expect(manager.isLoaded("first")).toBe(false);
        expect(manager.isLoaded("second")).toBe(true);
        expect(locale.translation["plugin.first.title"]).toBeUndefined();
        expect(locale.translation["plugin.second.title"]).toBe("Second tool");
        expect(Object.getOwnPropertyDescriptor(locale.translation, "constructor")?.value).toBe(
            "Constructor tool",
        );
        expect(locale.translation["common.cancel"]).toBe("Cancel");
    } finally {
        I18n.removeLanguage(language);
    }
});
