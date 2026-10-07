// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Constants,
    I18n,
    type IApplication,
    Localize,
    ObservableCollection,
    PubSub,
    type RecentDocumentDTO,
} from "@chili3d/core";
import { a, button, collection, div, img, span, svg } from "@chili3d/element";
import style from "./home.module.css";
import { LanguageSelector } from "./languageSelector";
import { Navigation3DSelector } from "./navigation3DSelector";
import { ThemeSelector } from "./themeSelector";

export class Home extends HTMLElement {
    constructor(readonly app: IApplication) {
        super();
        this.className = style.root;
    }

    private hasOpen(documentId: string) {
        return [...this.app.documents].some((document) => document.id === documentId);
    }

    async render() {
        const documents = new ObservableCollection(
            ...(await this.app.storage.page(Constants.DBName, Constants.RecentTable, 0)),
        );
        this.append(this.sidebar(), this.workspace(documents));
        this.app.mainWindow?.appendChild(this);
    }

    private sidebar() {
        return div(
            { className: style.left },
            div(
                { className: style.logo },
                img({ src: "favicon.svg", alt: "", className: style.logoMark }),
                div(
                    span({ className: style.wordmark, textContent: "SolidFrame" }),
                    span({ className: style.version, textContent: "BROWSER CAD" }),
                ),
            ),
            div({ className: style.navigationLabel, textContent: "WORKSPACE" }),
            this.action("New document", "icon-plus", "doc.new", true),
            this.action(new Localize("command.fabrication.create"), "icon-box", "fabrication.create"),
            this.action("Open document", "icon-folder", "doc.open"),
            this.action("Open sample fixture", "icon-box", "doc.sample"),
            this.app.activeView?.document
                ? button(
                      { className: style.back, onclick: () => PubSub.default.pub("displayHome", false) },
                      svg({ icon: "icon-back" }),
                      "Return to model",
                  )
                : "",
            div(
                { className: style.sidebarNote },
                span({ textContent: "LOCAL PROJECT STORAGE" }),
                div({
                    textContent: "Save in this browser. Download a .cd file to back up or move a project.",
                }),
            ),
            this.settings(),
            div(
                { className: style.links },
                a({
                    href: "https://github.com/nazeeh111/SolidFrame",
                    target: "_blank",
                    rel: "noopener noreferrer",
                    textContent: "Source code ↗",
                }),
                a({
                    href: "about.html",
                    target: "_blank",
                    rel: "noopener noreferrer",
                    textContent: "About & licenses ↗",
                }),
            ),
        );
    }

    private action(
        text: string | Localize,
        icon: string,
        command: "doc.new" | "doc.open" | "doc.sample" | "fabrication.create",
        primary = false,
    ) {
        return button(
            {
                className: primary ? `${style.button} ${style.primary}` : style.button,
                onclick: () => PubSub.default.pub("executeCommand", command),
            },
            svg({ icon }),
            span({ textContent: text }),
        );
    }

    private settings() {
        return div(
            { className: style.settingsPanel },
            div(
                { className: style.settingItem },
                span({ textContent: new Localize("common.language") }),
                LanguageSelector({}),
            ),
            div(
                { className: style.settingItem },
                span({ textContent: new Localize("common.theme") }),
                ThemeSelector({}),
            ),
            div(
                { className: style.settingItem },
                span({ textContent: new Localize("common.3DNavigation") }),
                Navigation3DSelector({}),
            ),
        );
    }

    private workspace(documents: ObservableCollection<RecentDocumentDTO>) {
        return div(
            { className: style.right },
            div(
                { className: style.page },
                div(
                    { className: style.pageTop },
                    span({ textContent: "PROJECTS" }),
                    span({ textContent: `SOLIDFRAME · ${__APP_VERSION__}` }),
                ),
                div(
                    { className: style.hero },
                    div(
                        { className: style.heroCopy },
                        div({ className: style.eyebrow, textContent: "SKETCHES AND SOLIDS" }),
                        div({
                            className: style.welcome,
                            textContent: "Sketch and model\nin 3D.",
                        }),
                        div({
                            className: style.subtitle,
                            textContent:
                                "Create constrained sketches, edit solid dimensions, and export STEP, IGES, or STL files.",
                        }),
                        div(
                            { className: style.heroActions },
                            this.action("Start a new model", "icon-plus", "doc.new", true),
                        ),
                    ),
                    div(
                        { className: style.specimen },
                        img({
                            src: "fixture.svg",
                            alt: "Isometric illustration of the editable workholding fixture",
                            className: style.specimenImage,
                        }),
                        div(
                            { className: style.specimenCaption },
                            span({ textContent: "01 / WORKHOLDING FIXTURE" }),
                            span({ textContent: "100 × 70 MM" }),
                        ),
                    ),
                ),
                div(
                    { className: style.featureStrip },
                    span({ textContent: "SOLID MODELING" }),
                    span({ textContent: "PARAMETRIC SKETCHES" }),
                    span({ textContent: "STEP · IGES · STL" }),
                    span({ textContent: "LOCAL PROJECTS" }),
                ),
                div(
                    { className: style.contentRow },
                    div(
                        { className: style.recentColumn },
                        div(
                            { className: style.sectionHeader },
                            div({ className: style.sectionTitle, textContent: "Recent projects" }),
                            span({
                                className: style.count,
                                textContent: String(documents.length).padStart(2, "0"),
                            }),
                        ),
                        this.documentCollection(documents),
                    ),
                    div(
                        { className: style.sample },
                        div({ className: style.eyebrow, textContent: "EDITABLE SAMPLE" }),
                        div({ className: style.sampleTitle, textContent: "Workholding fixture" }),
                        div({
                            className: style.sampleDescription,
                            textContent:
                                "Select a jaw, pin, or plate in the model tree. Change its dimensions in Properties, then save the project.",
                        }),
                        this.action("Open editable sample", "icon-box", "doc.sample"),
                        div({
                            className: style.sampleFoot,
                            textContent: "7 editable parts · dimensions in millimetres",
                        }),
                    ),
                ),
                div(
                    { className: style.footer },
                    span({ textContent: "Editable project format: .cd" }),
                    span({ textContent: "No account required" }),
                ),
            ),
        );
    }

    private documentCollection(documents: ObservableCollection<RecentDocumentDTO>) {
        if (documents.length === 0) {
            return div({
                className: style.empty,
                textContent: new Localize("home.recent.empty"),
            });
        }
        return collection({
            className: style.documents,
            sources: documents,
            template: (item) => this.recentDocument(item, documents),
        });
    }

    private recentDocument(item: RecentDocumentDTO, documents: ObservableCollection<RecentDocumentDTO>) {
        return div(
            {
                className: style.document,
                onclick: () => this.handleDocumentClick(item),
            },
            img({ className: style.img, src: item.image }),
            this.documentDescription(item),
            this.deleteIcon(item, documents),
        );
    }

    private documentDescription(item: RecentDocumentDTO) {
        return div(
            { className: style.description },
            span({ className: style.title, textContent: item.name }),
            span({
                className: style.date,
                textContent: new Date(item.date).toLocaleDateString(),
            }),
        );
    }

    private deleteIcon(item: RecentDocumentDTO, documents: ObservableCollection<RecentDocumentDTO>) {
        return svg({
            className: style.delete,
            icon: "icon-times",
            onclick: async (e) => {
                e.stopPropagation();
                if (window.confirm(I18n.translate("prompt.deleteDocument{0}", item.name))) {
                    await Promise.all([
                        this.app.storage.delete(Constants.DBName, Constants.DocumentTable, item.id),
                        this.app.storage.delete(Constants.DBName, Constants.RecentTable, item.id),
                    ]);
                    documents.remove(item);
                }
            },
        });
    }

    private handleDocumentClick(item: RecentDocumentDTO) {
        if (this.hasOpen(item.id)) {
            PubSub.default.pub("displayHome", false);
        } else {
            PubSub.default.pub(
                "showPermanent",
                async () => {
                    const document = await this.app.openDocument(item.id);
                    document?.application.activeView?.cameraController.fitContent();
                },
                "toast.excuting{0}",
                I18n.translate("command.doc.open"),
            );
        }
    }
}

customElements.define("chili-home", Home);
