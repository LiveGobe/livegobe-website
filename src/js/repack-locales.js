import { parse as parseCookie } from "cookie";
import { staticUrl } from "./utils";

class i18n {
    static locales = {};
    static initialized = false;
    static language = undefined;
    static options = {
        cookieName: "lang",
        queryName: "lang",
        localName: "lang",
        link: "/api/locales",
        method: "query",
        func: async function(i18n) {
            const query = new URLSearchParams(window.location.search).get(i18n.options.queryName);
            const cookie = parseCookie(document.cookie)[i18n.options.cookieName];
            const local = localStorage.getItem(i18n.options.localName);
            const acceptLanguage = navigator.language.slice(0, 2);
            const currentLanguage = query ? query : local ? local : cookie ? cookie : acceptLanguage;

            let link = i18n.options.method == "query" ? `${i18n.options.link}?${i18n.options.queryName}=${currentLanguage}` : `${i18n.options.link}/${currentLanguage}`;
            let res = await fetch(link, { credentials: "include" })
            if (!res.ok) return;

            let body = await res.json();
            if (!body.success) throw body.message;
            i18n.language = body.language;
            i18n.locales = body.locales;
        }
    };
    static async init(options = {}) {
        if (this.initialized) return;
        this.options.cookieName = options.cookieName || this.options.cookieName;
        this.options.queryName = options.queryName || this.options.queryName;
        this.options.localName = options.localName || this.options.localName;
        this.options.link = options.link || this.options.link;
        this.options.method = options.method || this.options.method;
        this.options.func = options.func || this.options.func;

        try {
            await this.options.func(this);
            this.initialized = true;
        } catch(e) {
            throw e;
        }
    }

    static translate(key, values) {
        try {
            key.startsWith('.') && (key = key.substr(1));
            key.endsWith('.') && (key = key.slice(0, -1));
            let text = key.split(".").reduce((obj, key) => obj[key], this.locales);
            text ||= key;
            return values ? text.replace(/\{([^}]+)\}/g, (m, key) => values[key] ? values[key] : m) : text;
        } catch(e) {
            return key;
        }
    }

    static link = function(src) {
        const index = src.lastIndexOf(".");
        return staticUrl(src.substr(0, index) + `-${this.language}` + src.substr(index));
    };

    static t = this.translate;
    static l = this.link;
}



export default i18n;