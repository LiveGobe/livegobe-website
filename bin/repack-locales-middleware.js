const fs = require('node:fs');
const path = require('node:path');
const cookieParser = require("cookie");
const langParser = require("accept-language-parser");
const { staticUrl } = require("./utils");
const locales = {};

module.exports = function(options = {}) {
    // Default options
    options.defaultLanguage ||= "en";
    options.cookieName ||= "lang";
    options.queryName ||= "lang";
    options.supportedLanguages ||= ["en"];
    options.directory = path.resolve(options.directory || "locales");

    locales[options.directory] ||= {};

    // Load .json files with locale data
    options.supportedLanguages.forEach(lang => {
        if (locales[options.directory][lang]) return;
        try {
            let file = fs.readFileSync(path.join(options.directory, `${lang}.json`));
            locales[options.directory][lang] = JSON.parse(file);
        } catch(e) {
            if (e.code == "ENOENT") console.warn(`Could not find locale file ${options.directory}\\${lang}.json`);
            else console.warn(`Could not parse locale file ${options.directory}\\${lang}.json`);
            locales[options.directory][lang] = undefined;
        }
    });

    // Create a middleware function
    return function(req, res, next) {
        const missingLocales = {};
        const getLocale = function(key, values) {
            try {
                key.startsWith('.') && (key = key.substr(1));
                key.endsWith('.') && (key = key.slice(0, -1));
                let text = key.split(".").reduce((obj, key) => obj[key], req.locales);
                if (!text) throw new Error("No translation found");
                return values ? text.replace(/\{([^}]+)\}/g, (m, key) => values[key] ? values[key] : m) : text;
            } catch(e) {
                if (process.env.NODE_ENV != "production") {
                    let keys = key.split(".");
                    keys.reduce((o, s, i) => { return i == keys.length - 1 ? o[s] = "" : o[s] ||= {} }, missingLocales);
                    fs.writeFileSync(path.join(options.directory, `${req.language}-missing.json`), JSON.stringify(missingLocales));
                }
                return key;
            }
        };
        const getLink = function(src) {
            const index = src.lastIndexOf(".");
            return staticUrl(src.substr(0, index) + `-${req.language}` + src.substr(index));
        };
        const query = req.query[options.queryName];
        const cookie = cookieParser.parse(req.headers.cookie || "")[options.cookieName];
        const acceptLanguage = langParser.parse(req.header("accept-language")).find(l => options.supportedLanguages.includes(l.code));
        const language = options.supportedLanguages.includes(query) ? query : options.supportedLanguages.includes(cookie) ? cookie : acceptLanguage ? acceptLanguage.code : options.defaultLanguage;
        req.language = res.locals.language = language;
        req.locales = res.locals.locales = locales[options.directory][language];
        req.t = req.translate = res.locals.t = res.locals.translate = getLocale;
        req.l = req.link = res.locals.l = res.locals.link = getLink;

        next();
    };
}