// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

import {
    Binding,
    type CommandKeys,
    CommandStore,
    Config,
    type IApplication,
    type ICommand,
    type IConverter,
    type IView,
    Localize,
    Logger,
    PubSub,
    Result,
    type Ribbon,
    type RibbonGroup,
    type RibbonTab,
} from "@chili3d/core";
import { a, button, collection, div, img, span, svg } from "@chili3d/element";
import style from "./ribbon.module.css";
import { RibbonPushButton } from "./ribbonButton";
import { RibbonGroupElement } from "./ribbonGroup";
import { createRibbonIcon } from "./ribbonIcon";

export const QuickButton = (command: ICommand) => {
    const data = CommandStore.getComandData(command);
    if (!data) {
        Logger.warn("commandData is undefined");
        return span({ textContent: "null" });
    }

    const labeled = data.key === "doc.save" || data.key === "doc.saveToFile";
    const icon = createRibbonIcon(data.icon);
    icon.classList.add(style.icon);
    return button(
        {
            type: "button",
            className: data.key === "doc.save" ? style.saveCommand : "",
            title: new Localize(`command.${data.key}`),
            onclick: () => PubSub.default.pub("executeCommand", data.key),
        },
        icon,
        ...(labeled ? [span({ textContent: new Localize(`command.${data.key}`) })] : []),
    );
};

class ViewActiveConverter implements IConverter<IView> {
    constructor(
        readonly target: IView,
        readonly style: string,
        readonly activeStyle: string,
    ) {}

    convert(value: IView): Result<string> {
        return Result.ok(this.target === value ? `${this.style} ${this.activeStyle}` : this.style);
    }
}

class ActivedRibbonTabConverter implements IConverter<RibbonTab> {
    constructor(
        readonly tab: RibbonTab,
        readonly style: string,
        readonly activeStyle: string,
    ) {}

    convert(value: RibbonTab): Result<string> {
        return Result.ok(this.tab === value ? `${this.style} ${this.activeStyle}` : this.style);
    }
}

class DisplayConverter<T> implements IConverter<T> {
    constructor(readonly predicate: (value: T) => boolean) {}

    convert(value: T): Result<string> {
        return Result.ok(this.predicate(value) ? "" : "none");
    }
}

export class RibbonUI extends HTMLElement {
    #scrollObserver?: ResizeObserver;
    constructor(
        readonly app: IApplication,
        readonly dataContent: Ribbon,
    ) {
        super();
        this.className = style.root;
        this.append(this.header(), this.workspaceBar(), this.ribbonTabs());
        this.addEventListener("keydown", (event) => {
            // Tab belongs to focused controls; the viewport uses it to cycle picked shapes.
            if (["Tab", "Enter", " "].includes(event.key)) {
                event.stopPropagation();
                if (event.repeat && event.key !== "Tab") event.preventDefault();
            }
        });
    }

    private header() {
        return div({ className: style.titleBar }, this.leftPanel(), this.centerPanel(), this.rightPanel());
    }

    private leftPanel() {
        return div(
            { className: style.left },
            button(
                {
                    type: "button",
                    className: style.appIcon,
                    title: "SolidFrame home",
                    onclick: () => PubSub.default.pub("displayHome", true),
                },
                img({ className: style.icon, src: "favicon.svg", alt: "" }),
                span({ id: "appName", textContent: "SolidFrame" }),
            ),
            div(
                { className: style.ribbonTitlePanel },
                collection({
                    className: style.quickCommands,
                    sources: this.dataContent.quickCommands,
                    template: (command: CommandKeys) => QuickButton(command as any),
                }),
            ),
        );
    }

    private workspaceBar() {
        return div({ className: style.workspaceBar }, this.createRibbonHeader());
    }

    private createRibbonHeader() {
        return collection({
            className: style.tabHeaders,
            sources: this.dataContent.tabs,
            template: (tab: RibbonTab) => {
                const converter = new ActivedRibbonTabConverter(tab, style.tabHeader, style.activedTab);
                return button({
                    type: "button",
                    className: new Binding(this.dataContent, "activeTab", converter),
                    textContent: new Localize(tab.tabName),
                    style: {
                        display: new Binding(
                            tab,
                            "visible",
                            new DisplayConverter((visible: boolean) => visible),
                        ),
                    },
                    onclick: () => {
                        this.dataContent.activeTab = tab;
                    },
                });
            },
        });
    }

    private centerPanel() {
        return div(
            { className: style.center },
            collection({
                className: style.views,
                sources: this.app.views,
                template: (view) => this.createViewItem(view),
            }),
            button(
                {
                    type: "button",
                    className: style.new,
                    title: new Localize("command.doc.new"),
                    onclick: () => PubSub.default.pub("executeCommand", "doc.new"),
                },
                svg({ icon: "icon-plus" }),
            ),
        );
    }

    private createViewItem(view: IView) {
        return div(
            {
                className: new Binding(
                    this.app,
                    "activeView",
                    new ViewActiveConverter(view, style.tab, style.active),
                ),
            },
            button(
                {
                    type: "button",
                    className: style.name,
                    title: new Binding(view.document, "name"),
                    onclick: () => {
                        this.app.activeView = view;
                    },
                },
                span({ textContent: new Binding(view.document, "name") }),
            ),
            button(
                {
                    type: "button",
                    className: style.close,
                    title: new Localize("common.closeDocument"),
                    onclick: (e) => {
                        e.stopPropagation();
                        view.close();
                    },
                },
                svg({ icon: "icon-times" }),
            ),
        );
    }

    private rightPanel() {
        return div(
            { className: style.right },
            a(
                {
                    href: "https://github.com/nazeeh111/SolidFrame",
                    target: "_blank",
                    rel: "noopener noreferrer",
                },
                svg({ title: "Github", className: style.icon, icon: "icon-github" }),
            ),
        );
    }

    private ribbonTabs() {
        const panel = collection({
            className: style.tabContentPanel,
            sources: this.dataContent.tabs,
            template: (tab: RibbonTab) => this.ribbonTab(tab),
        });
        const back = button({
            type: "button",
            className: style.scrollButton,
            title: "Scroll tools left",
            ariaLabel: "Scroll tools left",
            textContent: "‹",
            onclick: () => panel.scrollBy({ left: -Math.max(160, panel.clientWidth * 0.75) }),
        });
        const next = button({
            type: "button",
            className: style.scrollButton,
            title: "Scroll tools right",
            ariaLabel: "Scroll tools right",
            textContent: "›",
            onclick: () => panel.scrollBy({ left: Math.max(160, panel.clientWidth * 0.75) }),
        });
        const update = () => {
            back.disabled = panel.scrollLeft <= 1;
            next.disabled = panel.scrollLeft + panel.clientWidth >= panel.scrollWidth - 1;
        };
        panel.addEventListener("focusin", (event) => {
            const target = event.target as HTMLElement;
            // Fully reveal a focused tool, including after a viewport resize.
            queueMicrotask(() => target.scrollIntoView({ block: "nearest", inline: "nearest" }));
        });
        panel.addEventListener("scroll", update);
        this.#scrollObserver = new ResizeObserver(update);
        return div({ className: style.ribbonScroller }, back, panel, next);
    }

    private ribbonTab(tab: RibbonTab) {
        return collection({
            className: style.groupPanel,
            dataset: { tab: tab.tabName },
            sources: tab.groups,
            style: {
                display: new Binding(
                    this.dataContent,
                    "activeTab",
                    new DisplayConverter((tb: RibbonTab) => tab === tb),
                ),
            },
            template: (group: RibbonGroup) => new RibbonGroupElement(group),
        });
    }

    connectedCallback(): void {
        this.querySelectorAll(`.${style.tabContentPanel}, .${style.groupPanel}`).forEach((element) => {
            this.#scrollObserver?.observe(element);
        });
        Config.instance.onPropertyChanged(this.handleConfigChanged);
    }

    disconnectedCallback(): void {
        this.#scrollObserver?.disconnect();
        Config.instance.removePropertyChanged(this.handleConfigChanged);
    }

    private readonly handleConfigChanged = (prop: keyof Config) => {
        if (prop === "navigation3D") {
            this.querySelectorAll(customElements.getName(RibbonPushButton)!).forEach((x) => {
                (x as RibbonPushButton).updateShortcut();
            });
        }
    };
}

customElements.define("chili-ribbon", RibbonUI);
