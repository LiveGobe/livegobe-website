const prompt = require("prompt");
const fs = require("node:fs");
const colors = require("@colors/colors/safe");
const path = require("node:path");
const deepmerge = require("deepmerge");

prompt.message = "";
prompt.delimiter = "";

prompt.start();

const prompts = {
    lang: {
        name: "lang",
        description: colors.yellow("Localization file name (e.g. en, ru...):"),
        type: "string",
        required: true
    }
}

// Ask for environment
prompt.get(prompts.lang, function(err, lang) {
    if (err) {
        console.log(err);
        return;
    }
    lang = lang.lang;

    if (!fs.existsSync(path.join(__dirname, "../locales", `${lang}-missing.json`))) return console.log(colors.yellow("No missing locales for " + lang))

    try {
        fs.writeFileSync(path.join(__dirname, "../locales", `${lang}.json`), JSON.stringify(deepmerge(require(path.join(__dirname, "../locales", `${lang}.json`)), require(path.join(__dirname, "../locales", `${lang}-missing.json`))), null, 2));
        console.log(colors.yellow(`Locale file ${lang} was updated`));
        fs.rmSync(path.join(__dirname, "../locales", `${lang}-missing.json`))
    } catch(e) {
        console.log(e);
    }
});