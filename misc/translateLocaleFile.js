const fs = require("fs");
const path = require("path");
const translate = require("@vitalets/google-translate-api");

const lang = process.argv[2];

if (!lang) {
  console.error("❌ Please specify a target language, e.g. `node translate-locale.js ru`");
  process.exit(1);
}

const baseDir = path.resolve("./locales");
const enPath = path.join(baseDir, "en.json");
const targetPath = path.join(baseDir, `${lang}.json`);

const en = JSON.parse(fs.readFileSync(enPath, "utf8"));
let target = {};
try {
  target = JSON.parse(fs.readFileSync(targetPath, "utf8"));
  console.log(`🌐 Loaded existing ${lang}.json`);
} catch {
  console.warn(`⚠️ ${lang}.json not found, starting fresh.`);
}

async function deepTranslate(enData, targetData) {
  if (typeof enData === "string") {
    if (!targetData || typeof targetData !== "string" || targetData === enData) {
      try {
        const { text } = await translate(enData, { from: "en", to: lang });
        await new Promise((r) => setTimeout(r, 150));
        return text;
      } catch (err) {
        console.warn("⚠️ Translation failed for:", enData);
        return enData;
      }
    }
    return targetData;
  }

  if (Array.isArray(enData)) {
    return Promise.all(
      enData.map((item, i) =>
        deepTranslate(item, Array.isArray(targetData) ? targetData[i] : undefined)
      )
    );
  }

  if (typeof enData === "object" && enData !== null) {
    const result = {};
    for (const key of Object.keys(enData)) {
      result[key] = await deepTranslate(enData[key], targetData?.[key]);
    }
    return result;
  }

  return targetData ?? enData;
}

(async () => {
  console.log(`🌍 Translating en.json → ${lang}.json ...`);
  const translated = await deepTranslate(en, target);

  const outputPath = targetPath.replace(".json", "-translated.json");
  fs.writeFileSync(outputPath, JSON.stringify(translated, null, 2), "utf8");
  console.log(`✅ Translation completed: ${outputPath}`);
})();