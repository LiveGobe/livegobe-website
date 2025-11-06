// wikiRenderer.js
const DOMPurify = require("isomorphic-dompurify");
const { staticUrl } = require("./utils");
const fs = require("fs");
const path = require("path");

// Helper to get existing uploaded files for a wiki
function getExistingFiles(wikiName) {
  const uploadsDir = path.join(__dirname, "..", "public", "wikis", wikiName, "uploads");
  if (!fs.existsSync(uploadsDir)) return new Set();

  const files = fs.readdirSync(uploadsDir);
  return new Set(files);
}

/* ---------------------------
   Sanitizer Configuration
---------------------------- */
const ALLOWED_TAGS = [
  "a", "b", "i", "u", "s", "strong", "em", "br", "p", "span", "div",
  "section", "header", "footer", "article", "figure", "figcaption",
  "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th",
  "blockquote", "pre", "code", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
  "img", "button", "video", "audio", "source"
];

const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "width", "height",
  "colspan", "rowspan", "class", "id", "style",
  "role", "aria-label"
];

const BUILTIN_TEMPLATES = {
  "!": "&#33;", // !
  "=": "&#61;",
  "(": "&#40;",
  ")": "&#41;",
  "[": "&#91;", // [
  "]": "&#93;", // ]
  "{": "&#123;",
  "}": "&#125;",
  "<": "&lt;",
  ">": "&gt;",
  ":": "&#58;"
};

const BLOCK_TAGS = [
  "address","article","aside","blockquote","canvas","dd","div","dl","dt","fieldset",
  "figcaption","figure","footer","form","h1","h2","h3","h4","h5","h6","header",
  "hr","li","main","nav","noscript","ol","p","pre","section","table","tfoot","ul","video"
];
const BLOCK_TAG_RE = new RegExp(`<(?:${BLOCK_TAGS.join("|")})(\\s|>|/>)`, "i");

const PURIFY_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: true,
  FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "meta"],
  FORBID_ATTR: [/^on/i],
  KEEP_CONTENT: true,
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp|tel|data|#):|[^a-z]|[a-z+.-]+:)/i
};

DOMPurify.setConfig(PURIFY_CONFIG);
const sanitize = DOMPurify.sanitize;

/* ---------------------------
   LGML Module Executor (no in-memory cache)
   - Each invocation reads Module:Page from DB via options.getPage
   - Executes module code in a small vm sandbox (no require/process)
   - Supports async module functions (awaits returned promises)
----------------------------*/
const vm = require("vm");

/**
 * Execute a module function, e.g. {{#invoke:ModuleName|funcName|arg1|arg2}}
 * Safe sandbox with strict isolation.
 */
async function executeWikiModule(options = {}, moduleName, functionName, args = []) {
  if (!options || typeof options.getPage !== "function") {
    throw new Error("executeWikiModule: options.getPage is required");
  }

  const normalized = (moduleName || "").trim().replace(/\s+/g, "_");
  if (!normalized) return `<span class="lgml-error">LGML: missing module name</span>`;

  // Track recursion depth
  const depth = options._depth || 0;
  if (depth > 5) {
    return `<span class="lgml-error">LGML: nested module limit exceeded</span>`;
  }

  let modulePage;
  try {
    modulePage = await options.getPage("Module", normalized);
  } catch (err) {
    console.error(`[LGML] DB error fetching Module:${normalized}`, err);
    return `<span class="lgml-error">LGML: error loading module ${normalized}</span>`;
  }

  if (!modulePage || !modulePage.content) {
    return `<span class="lgml-error">LGML: Module "${normalized}" not found</span>`;
  }

  // --- Parse arguments ---
  const namedArgs = {};
  const positionalArgs = [];
  for (const arg of args) {
    const trimmed = arg.trim();
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      namedArgs[key] = value;
    } else {
      positionalArgs.push(trimmed);
    }
  }

  // --- Sandbox setup ---
  const sandbox = {
    module: { exports: {} },
    exports: {},
    Math,
    Date,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,

    // Safe "require" for LGML modules
    require: async function (name) {
      try {
        const mod = String(name || "").trim().replace(/\s+/g, "_");
        if (!mod) throw new Error("Empty module name");
        if (mod === normalized) throw new Error(`Recursive require: Module:${mod}`);

        const subOptions = { ...options, _depth: depth + 1 };
        const subResult = await executeWikiModule(subOptions, mod, "__default__");
        return subResult?.__exports__ || {};
      } catch (err) {
        console.error(`[LGML] require("${name}") failed in ${normalized}:`, err);
        return {};
      }
    },

    __resolveLink(target) {
      try {
        const wikiName = options.wikiName || "";
        return resolveLink(target, { wikiName, currentNamespace: options.currentNamespace });
      } catch {
        return "#";
      }
    }
  };

  try {
    vm.createContext(sandbox, { name: `LGML:Module:${normalized}` });

    const script = new vm.Script(modulePage.content, {
      filename: `Module:${normalized}`,
      displayErrors: false,
      timeout: 1000
    });

    script.runInContext(sandbox, { timeout: 1000 });

    const exported = sandbox.module.exports && Object.keys(sandbox.module.exports).length
      ? sandbox.module.exports
      : sandbox.exports || {};

    // Internal mode (used by require)
    if (functionName === "__default__") {
      return { __exports__: exported };
    }

    const fn = exported[functionName];
    if (!fn || typeof fn !== "function") {
      return `<span class="lgml-error">LGML: function "${functionName}" not found in Module:${normalized}</span>`;
    }

    let result;
    try {
      if (positionalArgs.length === 0 && Object.keys(namedArgs).length > 0) {
        result = await fn(namedArgs);
      } else {
        result = await fn.apply(null, positionalArgs.length ? positionalArgs : [namedArgs]);
      }
    } catch (fnErr) {
      console.error(`[LGML] Error running ${normalized}.${functionName}:`, fnErr);
      return `<span class="lgml-error">LGML: error in ${normalized}.${functionName}</span>`;
    }

    if (result == null) return "";
    if (typeof result === "string") return result;
    try { return String(result); } catch { return JSON.stringify(result); }

  } catch (err) {
    console.error(`[LGML] Failed to execute Module:${normalized}:`, err);
    return `<span class="lgml-error">LGML: execution error in ${normalized}</span>`;
  }
}

/* ---------------------------
   Magic Words Expansion (Scoped)
---------------------------- */
function expandMagicWords(text, context = {}) {
  const {
    pageName = "Unknown",
    namespace = "Main",
    wikiName = "LiveGobe Wiki",
    transcludingPage = null
  } = context;

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);

  const effectivePage = transcludingPage || pageName;

  const replacements = {
    PAGENAME: effectivePage.replace(/_/g, " "),
    NAMESPACE: namespace,
    FULLPAGENAME:
      namespace === "Main"
        ? effectivePage.replace(/_/g, " ")
        : `${namespace}:${effectivePage.replace(/_/g, " ")}`,
    SITENAME: wikiName,
    DATE: dateStr,
    TIME: timeStr,
  };

  return text.replace(/\{\{([A-Z_]+)\}\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(replacements, name)
      ? replacements[name]
      : match; // leave unknown ones as-is
  });
}

/* ---------------------------
   Tokenizer (lists support)
---------------------------- */
function tokenize(text, options = {}) {
  const tokens = [];
  const lines = text.split(/\r?\n/);

  const linkRegex =
    /(\[\[([^\]|]+)(?:\|([^\]]+))?\]\])|(\[([a-zA-Z]+:\/\/[^\]\s]+)(?:\s+([^\]]+))?\])/g;

  let inCodeBlock = false;
  let codeBuffer = [];

  function tokenizeTables(startIndex) {
    const table = { 
      type: "tableBlock", 
      attrs: lines[startIndex].replace(/^\{\|\s*/, "").trim(),
      caption: null,
      rows: []
    };
    let currentRow = [];
    let i = startIndex + 1;

    while (i < lines.length && !/^\|\}/.test(lines[i])) {
      const l = lines[i];

      // --- New row ---
      if (/^\|-$/.test(l.trim())) {
        if (currentRow.length > 0) {
          table.rows.push(currentRow);
          currentRow = [];
        }
        i++;
        continue;
      }

      // --- Caption ---
      if (/^\|\+/.test(l)) {
        table.caption = l.replace(/^\|\+\s*/, "");
        i++;
        continue;
      }

      // --- Header cells (start with !) ---
      if (/^!/.test(l)) {
        const parts = l.split(/!!/);
        for (const part of parts) {
          const raw = part.trim().replace(/^!\s*/, "");
          let align = null;
          let text = raw;

          // Detect alignment markers
          if (/^:.*:$/.test(raw)) {
            align = "center";
            text = raw.slice(1, -1).trim();
          } else if (/^:/.test(raw)) {
            align = "left";
            text = raw.slice(1).trim();
          } else if (/:$/.test(raw)) {
            align = "right";
            text = raw.slice(0, -1).trim();
          }

          currentRow.push({
            isHeader: true,
            align,
            text,
          });
        }
        i++;
        continue;
      }

      // --- Data cells (start with |) ---
      if (/^\|/.test(l)) {
        const parts = l.split(/\|\|/);
        for (const part of parts) {
          const raw = part.trim().replace(/^\|\s*/, "");
          let align = null;
          let text = raw;

          if (/^:.*:$/.test(raw)) {
            align = "center";
            text = raw.slice(1, -1).trim();
          } else if (/^:/.test(raw)) {
            align = "left";
            text = raw.slice(1).trim();
          } else if (/:$/.test(raw)) {
            align = "right";
            text = raw.slice(0, -1).trim();
          }

          currentRow.push({
            isHeader: false,
            align,
            text,
          });
        }
        i++;
        continue;
      }

      i++;
    }

    if (currentRow.length > 0) table.rows.push(currentRow);

    // Skip closing |}
    return { table, nextIndex: i + 1 };
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.replace(/\r$/, "");

    // --- Table start ---
    if (/^\{\|/.test(line)) {
      const { table, nextIndex } = tokenizeTables(i);
      tokens.push(table);
      i = nextIndex - 1; // skip past the table
      continue;
    }

    // --- Multiline code block (``` ... ```) ---
    if (/^```/.test(line.trim())) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBuffer = [];
      } else {
        tokens.push({ type: "codeBlock", content: codeBuffer.join("\n") });
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) continue;

    // --- Horizontal rule ---
    if (/^(?:-{4,}|\*{3,})$/.test(trimmed)) {
      tokens.push({ type: "hr" });
      continue;
    }

    // --- Blockquote ---
    if (/^>\s?/.test(trimmed)) {
      tokens.push({ type: "blockquote", content: trimmed.replace(/^>\s?/, "") });
      continue;
    }

    // --- Indented code block (4 spaces or tab) ---
    if (/^(?:\t| {4})/.test(rawLine)) {
      tokens.push({ type: "codeBlock", content: rawLine.replace(/^(?:\t| {4})/, "") });
      continue;
    }

    // --- Headings ===
    const headingMatch = trimmed.match(/^(={2,6})\s*(.+?)\s*\1$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const id = text.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-:.]/g, "");
      tokens.push({ type: "heading", level, text, id });
      continue;
    }

    // --- List items ---
    const listMatch = trimmed.match(/^([*#-]+)\s+(.*)$/);
    if (listMatch) {
      const markers = listMatch[1];
      const level = markers.length;
      const ordered = markers[0] === "#";
      const content = tokenizeInline(listMatch[2], linkRegex, options);
      tokens.push({ type: "listItem", ordered, level, content });
      continue;
    }

    // --- Gallery block ---
    if (/^<gallery/i.test(trimmed)) {
      const galleryLines = [];

      const attrMatch = trimmed.match(/^<gallery([^>]*)>/i);
      const attrString = attrMatch ? attrMatch[1] : "";
      const attrs = {};
      attrString.replace(/(\w+)\s*=\s*(['"]?)([^'"]+)\2/g, (_, key, __, value) => {
        attrs[key.toLowerCase()] = value.trim();
      });

      while (lines.length && i + 1 < lines.length && !/<\/gallery>/i.test(lines[i + 1])) {
        galleryLines.push(lines[++i].trim());
      }

      tokens.push({
        type: "galleryBlock",
        attrs,
        entries: galleryLines.filter(Boolean)
      });
      continue;
    }

    // --- Regular text or inline ---
    const parts = tokenizeInline(trimmed, linkRegex, options);

    // Detect start of an HTML block
    const htmlOpen = /^<([a-zA-Z][\w-]*)\b[^>]*>/.exec(trimmed);
    if (htmlOpen) {
      const tag = htmlOpen[1].toLowerCase();
      if (BLOCK_TAGS.includes(tag)) {
        const blockLines = [trimmed];

        // read additional lines until closing tag is found
        while (lines[i + 1] && !new RegExp(`</${tag}>`, "i").test(lines[i + 1])) {
          blockLines.push(lines[++i]);
        }

        // include closing tag if found
        if (lines[i + 1]) blockLines.push(lines[++i]);

        // ✅ Make sure htmlBlock content is a *string*
        tokens.push({ type: "htmlBlock", content: blockLines.join("\n") });
        continue;
      }
    }

    // fallback: normal text block (inline tokens)
    tokens.push({ type: "textBlock", content: Array.isArray(parts) ? parts : [parts] });
  }

  return tokens;
}

// Helper to tokenize inline text (links + text)
function tokenizeInline(line, linkRegex, options = {}) {
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(line)) !== null) {
    // Push preceding text
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: line.slice(lastIndex, match.index) });
    }

    // Internal link [[Page|Label]] or [[Category:Name]]
    if (match[1]) {
      const target = match[2];
      const label = match[3] || target;

      // Detect category
      if (/^Category:/i.test(target)) {
        const categoryName = target.replace(/^Category:/i, "").trim();
        parts.push({ type: "category", name: categoryName });
        options.categories = options.categories || new Set();
        options.categories.add(categoryName);
      } else if (/^Tag:/i.test(target)) {
        const tagName = target.replace(/^Tag:/i, "").trim();
        parts.push({ type: "tag", name: tagName });
        options.tags.add(tagName);
        options.tags = options.tags || new Set();
        options.tags.add(tagName);
      } else {
        parts.push({ type: "link", target, label });
      }
    }
    // External link [https://example.com Label]
    else if (match[4]) {
      parts.push({ type: "externalLink", url: match[5], label: match[6] || match[5] });
    }

    lastIndex = linkRegex.lastIndex;
  }

  // Push remaining text
  if (lastIndex < line.length) {
    parts.push({ type: "text", value: line.slice(lastIndex) });
  }

  return parts;
}

/* ---------------------------
   Inline Renderer (with Media + link= support)
---------------------------- */
function renderInline(parts, { wikiName, currentNamespace, existingFiles = new Set(), existingPages = new Set() }) {
  // ✅ Normalize input to always be an array
  if (!Array.isArray(parts)) {
    if (typeof parts === "string" && parts.trim() !== "") {
      parts = [{ type: "text", value: parts }];
    } else {
      return "";
    }
  }
  
  return parts.map(part => {
    if (part.type === "text") return formatText(part.value);

    if (part.type === "link") {
      const target = (part.target || "").trim();
      if (!target) return "";

      if (/^File:/i.test(target)) {
        const paramSource = [
          target.slice(5),
          part.label || ""
        ].join("|");

        const rawParams = paramSource
          .split("|")
          .map(s => s.trim())
          .filter(Boolean);

        if (!rawParams.length) return "";

        const fileName = rawParams.shift();
        const lower = (fileName || "").toLowerCase();

        let width = null;
        let height = null;
        let isThumb = false;
        let alignClass = "";
        let inlineMode = false;
        const leftover = [];
        let linkTarget = null;

        for (const param of rawParams) {
          if (!param) continue;
          const clean = param.trim();
          if (!clean) continue;

          const dimMatch = clean.match(/^(\d+)(?:px)?\s*[x×]\s*(\d+)(?:px)?$/i);
          if (dimMatch) { width = dimMatch[1]; height = dimMatch[2]; continue; }

          const widthMatch = clean.match(/^(\d+)(?:px)?$/i);
          if (widthMatch) { width = widthMatch[1]; continue; }

          if (/^thumb(nail)?$/i.test(clean)) { isThumb = true; continue; }
          if (/^(left|right|center|none)$/i.test(clean)) { alignClass = `wiki-align-${clean.toLowerCase()}`; continue; }
          if (/^(inline|plain|noframe)$/i.test(clean)) { inlineMode = true; continue; }

          const linkMatch = clean.match(/^link=(.+)$/i);
          if (linkMatch) { linkTarget = linkMatch[1].trim(); continue; }

          leftover.push(clean);
        }

        let caption = leftover.join("|").trim();
        if (!caption) caption = (fileName || "").split("/").pop();

        const fileExists = existingFiles.has(fileName);
        const altText = caption;
        const filePath = fileExists ? staticUrl(`wikis/${wikiName}/uploads/${encodeURIComponent(fileName)}`) : "";

        const imgAttrParts = [`alt="${sanitize(altText, PURIFY_CONFIG)}"`];
        if (width) imgAttrParts.push(`width="${sanitize(String(width), PURIFY_CONFIG)}"`);
        if (height) imgAttrParts.push(`height="${sanitize(String(height), PURIFY_CONFIG)}"`);
        if (fileExists) imgAttrParts.unshift(`src="${filePath}"`);
        const imgAttrs = imgAttrParts.join(" ");

        let figureClass = "wiki-media";
        if (!fileExists) figureClass += " wiki-missing"; // add class for styling missing file
        else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(lower)) figureClass += " wiki-image";
        else if (/\.(mp4|webm|ogg)$/i.test(lower)) figureClass += " wiki-video";
        else if (/\.(mp3|wav|ogg)$/i.test(lower)) figureClass += " wiki-audio";

        if (isThumb) figureClass += " wiki-thumb";
        if (alignClass) figureClass += ` ${alignClass}`;

        let mediaHtml = "";

        if (!fileExists) {
          // Missing file: red box linking to upload page
          const uploadUrl = `/wikis/${wikiName}/Special:Upload?file=${encodeURIComponent(fileName)}`;
          mediaHtml = `<a href="${uploadUrl}" class="wiki-missing-link">
                        <span class="wiki-media wiki-missing" style="color:red; border:1px solid red; padding:0.25rem; display:inline-block;">
                          [${sanitize(fileName, PURIFY_CONFIG)}]
                        </span>
                      </a>`;
        } else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(lower)) {
          mediaHtml = inlineMode
            ? `<img ${imgAttrs} class="wiki-media-inline ${alignClass}" />`
            : `<figure class="${figureClass}">
                 <img ${imgAttrs} />
                 ${caption ? `<figcaption>${sanitize(caption, PURIFY_CONFIG)}</figcaption>` : ""}
               </figure>`;
        } else if (/\.(mp4|webm|ogg)$/i.test(lower)) {
          const type = lower.split(".").pop();
          mediaHtml = inlineMode
            ? `<video controls ${width ? `width="${width}"` : ""} ${height ? `height="${height}"` : ""} class="wiki-media-inline ${alignClass}">
                 <source src="${filePath}" type="video/${type}">
               </video>`
            : `<figure class="${figureClass}">
                 <video controls ${width ? `width="${width}"` : ""} ${height ? `height="${height}"` : ""}>
                   <source src="${filePath}" type="video/${type}" />
                 </video>
                 ${caption ? `<figcaption>${sanitize(caption, PURIFY_CONFIG)}</figcaption>` : ""}
               </figure>`;
        } else if (/\.(mp3|wav|ogg)$/i.test(lower)) {
          const type = lower.split(".").pop();
          mediaHtml = inlineMode
            ? `<audio controls class="wiki-media-inline ${alignClass}">
                 <source src="${filePath}" type="audio/${type}">
               </audio>`
            : `<figure class="${figureClass}">
                 <audio controls>
                   <source src="${filePath}" type="audio/${type}" />
                 </audio>
                 ${caption ? `<figcaption>${sanitize(caption, PURIFY_CONFIG)}</figcaption>` : ""}
               </figure>`;
        } else {
          mediaHtml = `<span class="wiki-media wiki-unknown">${sanitize(fileName, PURIFY_CONFIG)}</span>`;
        }

        if (linkTarget) {
          const href = /^https?:\/\//i.test(linkTarget)
            ? encodeURI(linkTarget)
            : resolveLink(linkTarget, { wikiName, currentNamespace });
          mediaHtml = `<a href="${href}">${mediaHtml}</a>`;
        }

        return mediaHtml;
      }

      const label = sanitize(part.label || part.target, PURIFY_CONFIG);

      // --- Handle pure anchor links like [[#Section]]
      if (target.startsWith("#")) {
        const anchor = target.slice(1);
        return `<a href="#${sanitize(anchor, PURIFY_CONFIG)}" class="wiki-link">${label}</a>`;
      }

      // --- Separate anchor for existence check ---
      let pageOnly = target;
      if (target.includes("#")) {
        pageOnly = target.split("#", 1)[0]; // strip off #Anchor for DB existence check
      }

      // Normalize for consistent lookups
      const normalized = pageOnly.replace(/\s+/g, "_");

      // Check page existence
      const pageExists = existingPages.has(normalized);

      // --- Build final href (resolveLink handles anchors properly) ---
      const href = resolveLink(target, { wikiName, currentNamespace });
      const finalHref = pageExists ? href : `${href}?mode=edit`;

      // --- Choose link class ---
      const linkClass = pageExists ? "wiki-link" : "wiki-link wiki-missing";

      // --- Return full link ---
      return `<a href="${finalHref}" class="${linkClass}">
                ${label}
              </a>`;
    }

    if (part.type === "externalLink") {
      const safeUrl = encodeURI(part.url.trim());
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">
                ${sanitize(part.label || safeUrl, PURIFY_CONFIG)}
              </a>`;
    }

    return "";
  }).join("");
}

/* ---------------------------
   Table Parser (Enhanced)
   - Supports rowspan, colspan, style, alignment (:---:), and escape templates
---------------------------- */
function parseTables(text, expandTemplatesFn) {
  // Match `{| ... |}` blocks
  const tableRegex = /\{\|([\s\S]*?)\|\}/g;

  return text.replace(tableRegex, (match, content) => {
    const lines = content.trim().split(/\r?\n/);
    let html = "";

    // Extract table-level attributes
    let firstLine = lines[0]?.trim();
    let tableAttrs = "";
    if (firstLine && !firstLine.startsWith("|") && !firstLine.startsWith("!")) {
      tableAttrs = firstLine;
      lines.shift();
    }

    html += `<table ${tableAttrs || 'class="wiki-table"'}>`;

    let currentRow = [];

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      // --- Caption ---
      if (line.startsWith("|+")) {
        html += `<caption>${line.substring(2).trim()}</caption>`;
        continue;
      }

      // --- Row separator ---
      if (line.startsWith("|-")) {
        if (currentRow.length > 0) {
          html += `<tr>${currentRow.join("")}</tr>`;
          currentRow = [];
        }
        continue;
      }

      // --- Header row ---
      if (line.startsWith("!")) {
        const parts = line.substring(1).split("!!");
        currentRow.push(...parts.map((h) => renderCell(h, true, expandTemplatesFn)));
        continue;
      }

      // --- Data row ---
      if (line.startsWith("|")) {
        const parts = line.substring(1).split("||");
        currentRow.push(...parts.map((c) => renderCell(c, false, expandTemplatesFn)));
        continue;
      }

      // --- Continuation line (multi-line cell) ---
      if (currentRow.length > 0) {
        const last = currentRow.pop();
        const updated = last.replace(/(<\/t[dh]>)/, " " + line + "$1");
        currentRow.push(updated);
      }
    }

    if (currentRow.length > 0) html += `<tr>${currentRow.join("")}</tr>`;
    html += "</table>";
    return html;
  });

  // --- Helper: render individual cell ---
  function renderCell(cell, isHeader, expandTemplatesFn) {
    let attr = "";
    let text = cell.trim();

    // --- Expand escape templates inside the cell if function provided ---
    if (expandTemplatesFn) text = expandTemplatesFn(text);

    // --- Split inline attributes before first "|" ---
    const attrMatch = text.match(/^([^|]+?)\s*\|\s*(.+)$/);
    if (attrMatch) {
      attr = attrMatch[1].trim();
      text = attrMatch[2].trim();
    }

    // --- Extract rowspan / colspan from attributes ---
    const spanMatch = attr.match(/(rowspan|colspan)\s*=\s*(['"]?)(\d+)\2/gi);
    let rowspan = "", colspan = "";
    if (spanMatch) {
      for (const m of spanMatch) {
        const [, key,, val] = m.match(/(rowspan|colspan)\s*=\s*(['"]?)(\d+)\2/);
        if (key.toLowerCase() === "rowspan") rowspan = val;
        if (key.toLowerCase() === "colspan") colspan = val;
      }
    }
    attr = attr.replace(/\b(rowspan|colspan)\s*=\s*(['"]?).*?\2/gi, "").trim();

    // --- Alignment markers ---
    let align = "";
    if (/^:.*:$/.test(text)) {
      align = "center";
      text = text.slice(1, -1).trim();
    } else if (/^:/.test(text)) {
      align = "left";
      text = text.slice(1).trim();
    } else if (/:$/.test(text)) {
      align = "right";
      text = text.slice(0, -1).trim();
    }

    const alignStyle = align ? `text-align:${align};` : "";
    const hasStyle = /style\s*=/.test(attr);
    const tag = isHeader ? "th" : "td";

    // --- Merge alignment into existing style ---
    if (alignStyle && hasStyle) {
      attr = attr.replace(/style\s*=\s*(['"])(.*?)\1/, (_, q, val) => `style=${q}${val.trim()} ${alignStyle}${q}`);
    } else if (alignStyle && !hasStyle) {
      attr = attr ? `${attr} style="${alignStyle}"` : `style="${alignStyle}"`;
    }

    // --- Append rowspan / colspan ---
    if (rowspan) attr += ` rowspan="${rowspan}"`;
    if (colspan) attr += ` colspan="${colspan}"`;

    attr = attr.trim();
    return `<${tag}${attr ? " " + attr : ""}>${text}</${tag}>`;
  }
}

/* ---------------------------
   Parser / Renderer
---------------------------- */
function parse(tokens, options = {}) {
  const { wikiName, currentNamespace = "Main", existingFiles = new Set() } = options;
  const toc = [];
  let html = "";

  const listStack = []; // stack of { level, ordered }

  function closeListsTo(level, ordered) {
    while (listStack.length) {
      const top = listStack[listStack.length - 1];
      if (top.level > level || (ordered !== undefined && top.ordered !== ordered)) {
        html += `</${top.ordered ? "ol" : "ul"}>\n`;
        listStack.pop();
      } else break;
    }
  }

  for (const t of tokens) {
    if (t.type === "heading") {
      closeListsTo(0);
      const sanitizedText = sanitize(t.text, PURIFY_CONFIG);
      html += `<h${t.level} id="${t.id}">${sanitizedText}</h${t.level}>\n`;
      toc.push({ level: t.level, text: sanitizedText, id: t.id });
      continue;
    }

    if (t.type === "listItem") {
      const top = listStack[listStack.length - 1];

      if (!top || t.level > top.level) {
        html += `<${t.ordered ? "ol" : "ul"}>\n`;
        listStack.push({ level: t.level, ordered: t.ordered });
      } else if (t.level < top.level) {
        closeListsTo(t.level - 1);
        const parent = listStack[listStack.length - 1];
        if (!parent || parent.ordered !== t.ordered) {
          html += `<${t.ordered ? "ol" : "ul"}>\n`;
          listStack.push({ level: t.level, ordered: t.ordered });
        }
      } else if (t.level === top.level && t.ordered !== top.ordered) {
        closeListsTo(t.level - 1);
        html += `<${t.ordered ? "ol" : "ul"}>\n`;
        listStack.push({ level: t.level, ordered: t.ordered });
      }

      const inner = renderInline(t.content, { wikiName, currentNamespace, existingFiles, existingPages: options.existingPages });
      html += `<li>${inner}</li>\n`;
      continue;
    }

    closeListsTo(0);

    if (t.type === "blockquote") {
      html += `<blockquote>${formatText(sanitize(t.content, PURIFY_CONFIG))}</blockquote>\n`;
      continue;
    }

    if (t.type === "codeBlock") {
      const code = sanitize(t.content, { ALLOWED_TAGS: [], KEEP_CONTENT: true });
      html += `<pre><code>${code}</code></pre>\n`;
      continue;
    }

    if (t.type === "hr") {
      html += `<hr />\n`;
      continue;
    }

    // --- Gallery block ---
    if (t.type === "galleryBlock") {
      const { attrs, entries } = t;
      const columns = parseInt(attrs.columns || attrs.perrow || 4, 10);
      const width = attrs.widths ? `--item-width: ${parseInt(attrs.widths, 10)}px;` : "";

      const items = entries.map(entry => {
        const [fileSpec, caption] = entry.split("|").map(s => s.trim());
        const fileName = fileSpec.replace(/^File:/i, "").trim();
        const lower = fileName.toLowerCase();
        const filePath = staticUrl(`wikis/${wikiName}/uploads/${encodeURIComponent(fileName)}`);
        const fileExists = existingFiles.has(fileName);

        let mediaTag;
        if (!fileExists) {
          const uploadUrl = `/wikis/${wikiName}/Special:Upload?file=${encodeURIComponent(fileName)}`;
          mediaTag = `<a href="${uploadUrl}" class="wiki-missing-link" title="File not found – click to upload">
                        <span class="wiki-media wiki-missing" style="color:red; border:1px solid red; padding:0.25rem; display:inline-block;">
                          [${sanitize(fileName, PURIFY_CONFIG)}]
                        </span>
                      </a>`;
        } else if (/\.(png|jpe?g|gif|webp|svg)$/i.test(lower)) {
          mediaTag = `<img src="${filePath}" alt="${sanitize(caption || fileName, PURIFY_CONFIG)}">`;
        } else if (/\.(mp4|webm|ogg)$/i.test(lower)) {
          mediaTag = `<video controls src="${filePath}"></video>`;
        } else if (/\.(mp3|wav|ogg)$/i.test(lower)) {
          mediaTag = `<audio controls src="${filePath}"></audio>`;
        } else {
          mediaTag = `<span class="wiki-media wiki-unknown">${sanitize(fileName, PURIFY_CONFIG)}</span>`;
        }

        return `<figure class="wiki-gallery-item">
                  ${mediaTag}
                  ${caption ? `<figcaption>${sanitize(caption, PURIFY_CONFIG)}</figcaption>` : ""}
                </figure>`;
      }).join("\n");

      html += `<div class="wiki-gallery" style="--columns:${columns};${width}">${items}</div>\n`;
      continue;
    }

    const inner = renderInline(t.content, {
      wikiName,
      currentNamespace,
      existingFiles,
      existingPages: options.existingPages
    });

    if (t.type === "htmlBlock") {
      // Pure HTML blocks are inserted as-is
      html += sanitize(inner, PURIFY_CONFIG) + "\n";
    } else if (BLOCK_TAG_RE.test(inner.trim())) {
      // Skip wrapping if inline HTML already contains a block element
      html += sanitize(inner, PURIFY_CONFIG) + "\n";
    } else if (inner.trim()) {
      // Normal paragraph
      html += `<p>${sanitize(inner, PURIFY_CONFIG)}</p>\n`;
    }
  }

  closeListsTo(0);

  let tocHtml = "";
  if (!/__NOTOC__/i.test(html)) {
    const visibleToc = toc.filter(h => h.level >= 2 && h.level <= 4);
    tocHtml = visibleToc.length
      ? `<div class="toc">\n<ul>\n${visibleToc.map(h => `<li class="toc-level-${h.level}"><a href="#${h.id}">${sanitize(h.text, PURIFY_CONFIG)}</a></li>`).join("\n")}\n</ul>\n</div>\n`
      : "";
  } else html = html.replace(/__NOTOC__/gi, "");

  return `<div class="wiki-container">${tocHtml}<div class="wiki-content">${html}</div></div>`;
}

/* ---------------------------
   Text formatting: bold, italic, strikethrough, code
---------------------------- */
function formatText(str) {
  return str
    .replace(/'''''(.*?)'''''/g, "<strong><em>$1</em></strong>")
    .replace(/'''(.*?)'''/g, "<strong>$1</strong>")
    .replace(/''(.*?)''/g, "<em>$1</em>")
    .replace(/~~(.*?)~~/g, "<s>$1</s>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/* ---------------------------
   Link Resolver
---------------------------- */
function resolveLink(target, { wikiName, currentNamespace = "Main" } = {}) {
  if (!target) return "#";
  target = target.trim();

  // Anchor-only link [[#Section]]
  if (target.startsWith("#")) return `#${sanitizeAnchor(target.slice(1))}`;

  // Page with section [[Page#Section]]
  let namespace = currentNamespace;
  let page = target;
  let anchor = null;

  if (page.includes("#")) {
    const [pagePart, anchorPart] = page.split("#", 2);
    page = pagePart;
    anchor = sanitizeAnchor(anchorPart);
  }

  if (page.includes(":")) {
    const parts = page.split(":");
    namespace = parts.shift();
    page = parts.join(":");
  }

  const pagePath = page.replace(/\s+/g, "_");
  const urlPath = namespace === "Main" ? pagePath : `${namespace}:${pagePath}`;

  // ✅ Encode only slashes and spaces, not colons
  const safeWikiName = wikiName.replace(/ /g, "-");
  const safeUrlPath = urlPath
    .split("/")
    .map(seg => encodeURIComponent(seg))
    .join("/")
    .replace(/%3A/g, ":") // restore colons for namespaces

  const base = `/wikis/${safeWikiName}/${safeUrlPath}`;

  return anchor ? `${base}#${anchor}` : base;
}

/* ---------------------------
   Helpers
---------------------------- */
function sanitizeAnchor(name) {
  return name.replace(/[^a-zA-Z0-9_\-:.]/g, "");
}

// Helper to detect block-level HTML
function isBlockHTML(chunk) {
  const trimmed = chunk.trim();
  return BLOCK_TAGS.some(tag =>
    trimmed.startsWith(`<${tag}`) || trimmed.startsWith(`</${tag}`)
  );
}

/* ---------------------------
   Nowiki Helper
---------------------------- */
function wrapNowiki(content) {
    if (!content) return "";
    // Escape any nested <nowiki> tags to prevent breaking
    return `<nowiki>${content.replace(/<\/?nowiki>/g, m => m === '<nowiki>' ? '&lt;nowiki&gt;' : '&lt;/nowiki&gt;')}</nowiki>`;
}

/* ---------------------------
   Template Expansion
---------------------------- */
const MAX_TEMPLATE_DEPTH = 10;

async function expandTemplates(text, options = {}, depth = 0, visited = new Set()) {
    const { getPage, pageName, currentNamespace, currentPageId, WikiPage } = options;
    if (!getPage || depth > MAX_TEMPLATE_DEPTH) return text;

    // Match any double-brace block (including #invoke)
    const templateRegex = /\{\{([^{}]+?)\}\}(?!\})/g;

    async function replaceTemplate(match, inner) {
        const trimmed = inner.trim();

        // === LGML: #invoke ===
        // Syntax: {{#invoke:ModuleName|functionName|arg1|arg2|...}}
        if (/^#invoke:/i.test(trimmed)) {
            const invokeParts = trimmed.split("|");
            const invokeHeader = invokeParts.shift(); // "#invoke:ModuleName"
            const moduleName = invokeHeader.split(":")[1]?.trim();
            const functionName = (invokeParts.shift() || "").trim();
            const args = invokeParts.map(p => p.trim());

            if (!moduleName || !functionName)
                return `<span class="error">[Invalid #invoke syntax]</span>`;

            // --- Skip if /doc page ---
            if (moduleName.endsWith("/doc")) {
                return `<span class="error">[Cannot invoke documentation page: ${moduleName}]</span>`;
            }

            try {
                const result = await executeWikiModule(options, moduleName, functionName, args);
                return result ?? "";
            } catch (err) {
                console.error(`[LGML] Error in #invoke ${moduleName}.${functionName}:`, err);
                return `<span class="error">[LGML execution error]</span>`;
            }
        }

        // === Normal Template Handling ===
        const parts = trimmed.split("|");
        const name = parts.shift().trim();
        const normalizedName = name.replace(/ /g, "_");

        // === Magic words ===
        const upperName = normalizedName.toUpperCase();
        switch (upperName) {
            case "PAGENAME": return pageName?.replace(/_/g, " ") || "";
            case "NAMESPACE": return currentNamespace || "";
            case "FULLPAGENAME":
                return currentNamespace
                    ? `${currentNamespace}:${pageName?.replace(/_/g, " ")}`
                    : pageName?.replace(/_/g, " ");
        }

        // === Built-in templates ===
        if (BUILTIN_TEMPLATES.hasOwnProperty(normalizedName)) {
            return BUILTIN_TEMPLATES[normalizedName];
        }

        // === Prevent recursion ===
        const templateKey = `Template:${normalizedName}`;
        if (visited.has(templateKey))
            return `<span class="error">[Recursive template: ${normalizedName}]</span>`;
        visited.add(templateKey);

        // === Fetch template ===
        const templatePage = await getPage("Template", normalizedName);
        if (!templatePage || !templatePage.content) {
            return `<span class="missing-template">{{${name}}}</span>`;
        }

        // === Process includeonly/noinclude/onlyinclude ===
        let content = processIncludeBlocks(templatePage.content, false);

        // === Replace parameters ===
        content = content.replace(/\{\{\{([^{}]+)\}\}\}/g, (_, key) => {
            key = key.trim();
            const named = parts.find(p => p.startsWith(key + "="));
            if (named) return named.split("=").slice(1).join("=").trim();

            const index = parseInt(key);
            if (!isNaN(index) && parts[index - 1]) return parts[index - 1].trim();

            return `{{{${key}}}}`;
        });

        // === Recursively expand nested templates ===
        const expanded = await expandTemplates(content, options, depth + 1, visited);

        visited.delete(templateKey);
        return expanded;
    }

    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = templateRegex.exec(text)) !== null) {
        result += text.slice(lastIndex, match.index);
        result += await replaceTemplate(match[0], match[1]);
        lastIndex = templateRegex.lastIndex;
    }

    result += text.slice(lastIndex);
    return result;
}

function processIncludeBlocks(content, isTemplateView) {
  if (!content) return "";

  // 1. <onlyinclude> takes precedence — if present, only its contents are included.
  const onlyIncludeMatches = content.matchAll(/<onlyinclude>([\s\S]*?)<\/onlyinclude>/gi);
  const onlyIncludeParts = Array.from(onlyIncludeMatches, m => m[1].trim());
  if (onlyIncludeParts.length) {
    return isTemplateView
      ? wrapNowiki(content.replace(/<\/?onlyinclude>/gi, "")) // show raw tags in template view
      : onlyIncludeParts.join("\n"); // only the included content
  }

  if (isTemplateView) {
    // Viewing the template page directly → wrap in nowiki
    return wrapNowiki(
      content
        .replace(/<includeonly>[\s\S]*?<\/includeonly>/gi, "") // hide include-only sections
        .replace(/<\/?noinclude>/gi, "") // keep noinclude content visible
        .replace(/<\/?onlyinclude>/gi, "") // remove onlyinclude tags
    );
  } else {
    // Transcluded view
    return content
      .replace(/<noinclude>[\s\S]*?<\/noinclude>/gi, "") // remove noinclude blocks
      .replace(/<\/?includeonly>/gi, ""); // include include-only contents
  }
}

/* ---------------------------
   <nowiki> Protection (Fully Safe)
---------------------------- */
function protectNowikiBlocks(text) {
  const nowikiBlocks = [];

  const protectedText = text.replace(/<nowiki>([\s\S]*?)<\/nowiki>/gi, (_, inner) => {
    const trimmed = inner.replace(/^\n+|\n+$/g, "");
    const id = nowikiBlocks.length;
    nowikiBlocks.push(trimmed);
    // Use invisible sentinel brackets so paragraph logic treats it as inline text
    return `@@NOWIKI${id}@@`;
  });

  return { protectedText, nowikiBlocks };
}

function restoreNowikiBlocks(text, nowikiBlocks) {
  return text.replace(/@@NOWIKI(\d+)@@/g, (_, i) => {
    const content = nowikiBlocks[i]
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Decide format based on newlines
    if (content.includes("\n")) {
      return `<pre class="nowiki">${content}</pre>`;
    } else {
      return `<span class="nowiki">${content}</span>`;
    }
  });
}

/* ---------------------------
   Main Render Function (with <nowiki> support)
---------------------------- */
async function renderWikiText(text, options = {}) {
  if (!text) return { html: "", categories: [] };

  const { wikiName, pageName, currentNamespace, WikiPage, currentPageId } = options;

  // --- Skip parser for Special pages ---
  const isSpecial = currentNamespace === "Special" || pageName.startsWith("Special:");
  if (isSpecial) {
    return { html: text, categories: [] }; // return raw content unparsed
  }
  
  const pageCategories = new Set(); // collect categories
  const pageTags = new Set();       // collect tags

  // --- Prepare existing files set ---
  const existingFiles = getExistingFiles(wikiName);
  options.existingFiles = existingFiles;

  // --- Extract <nowiki> first ---
  const { protectedText, nowikiBlocks } = protectNowikiBlocks(text);
  let working = protectedText;

  const isTemplateView = currentNamespace === "Template";

  // --- Process includes & templates ---
  working = processIncludeBlocks(working, isTemplateView);
  working = expandMagicWords(working, options);
  working = await expandTemplates(working, { ...options });

  //if (isTemplateView) working = wrapNowiki(working);

  if (WikiPage && currentPageId) {
    await WikiPage.updateOne(
      { _id: currentPageId },
      { $set: { templatesUsed: [] } } // optional: track templates
    ).catch(() => {});
  }

  // --- Tokenize and parse normally ---
  working = parseTables(working);
  const tokens = tokenize(working, { categories: pageCategories, tags: pageTags });
  const html = parse(tokens, options); // parse now returns object

  // --- Restore <nowiki> after parsing ---
  const restoredHtml = restoreNowikiBlocks(html, nowikiBlocks);

  // Return both HTML and categories
  return { html: restoredHtml, categories: Array.from(pageCategories), tags: Array.from(pageTags) };
}

module.exports = { renderWikiText, resolveLink };