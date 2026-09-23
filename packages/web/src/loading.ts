// Part of the Chili3d Project, under the AGPL-3.0 License.
// See LICENSE file in the project root for full license information.

export class Loading extends HTMLElement {
    private readonly message = document.createElement("p");

    constructor() {
        super();
        this.setAttribute("role", "status");
        this.style.cssText =
            "position:fixed;inset:0;z-index:99999;display:grid;place-content:center;background:#161c1f;color:#e7e4de;text-align:center;padding:24px;gap:12px;font-family:system-ui,sans-serif";
        const logo = document.createElement("img");
        logo.src = "favicon.svg";
        logo.alt = "";
        logo.style.cssText = "width:54px;height:54px;margin:0 auto 16px";
        const title = document.createElement("h1");
        title.textContent = "SolidFrame";
        title.style.cssText = "color:#e7e4de;font-size:34px;letter-spacing:-1.4px;margin:0";
        this.message.textContent = "Preparing your modeling workspace…";
        this.message.style.cssText =
            "color:#c9cecd;font-size:14px;margin:10px 0;max-width:520px;line-height:1.7;overflow-wrap:anywhere";
        const detail = document.createElement("small");
        detail.textContent = "The geometry engine loads on first use. CAD calculations run in your browser.";
        detail.style.cssText = "color:#929a9d;font-size:11px;max-width:420px;line-height:1.7";
        this.append(logo, title, this.message, detail);
    }

    showError(message: string) {
        this.setAttribute("role", "alert");
        this.message.textContent = `The workspace could not start: ${message}`;
        const retry = document.createElement("button");
        retry.textContent = "Reload workspace";
        retry.style.cssText =
            "margin:20px auto;padding:12px 22px;border:0;border-radius:4px;background:#ac5e39;color:white;cursor:pointer";
        retry.onclick = () => window.location.reload();
        this.append(retry);
    }
}

customElements.define("chili-loading", Loading);
