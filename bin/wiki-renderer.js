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

// Matches:
//  1) Internal link [[Target|Label]]
//  2) External link [URL Label]
const LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([a-z]+:\/\/[^\]\s]+)(?:\s+([^\]]+))?\]/gi;


const BLOCK_TAGS = [
  "div", "section", "article", "aside", "nav",
  "header", "footer",
  "figure", "figcaption",
  "blockquote",
  "pre"
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
const { Worker } = require("worker_threads");
const acorn = require('acorn');
const walk = require('acorn-walk');
const workerPath = path.join(__dirname, 'module-worker.js');

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

  const depth = options._depth || 0;
  if (depth > 5) {
    return `<span class="lgml-error">LGML: nested module limit exceeded</span>`;
  }

  // --- Per-request module cache (so multiple requires in same render reuse compiled exports)
  // options._moduleCache is a Map keyed by normalized module name -> exported object
  if (!options._moduleCache) options._moduleCache = new Map();
  const moduleCache = options._moduleCache;

  // If we've already loaded this module for this request, reuse it
  if (moduleCache.has(normalized)) {
    const cachedExport = moduleCache.get(normalized);
    // If caller asked for __default__, return exports container
    if (functionName === "__default__") return { __exports__: cachedExport };
    // Otherwise, try to call requested function on cached export.
    // Reconstruct named/positional args locally (same logic as below) so we can
    // invoke the cached function without depending on later variables.
    const localNamed = {};
    const localPos = [];
    for (const a of args) {
      const trimmed = (a || "").trim();
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        localNamed[key] = value;
      } else {
        if (trimmed !== "") localPos.push(trimmed);
      }
    }

    const fn = cachedExport && cachedExport[functionName];
    if (!fn || typeof fn !== "function") {
      return `<span class="lgml-error">LGML: function "${functionName}" not found in Module:${normalized}</span>`;
    }

    try {
      if (localPos.length === 0 && Object.keys(localNamed).length > 0)
        return await fn(localNamed);
      return await fn.apply(null, localPos.length ? localPos : [localNamed]);
    } catch (fnErr) {
      const lineInfo = fnErr.stack?.match(new RegExp(`${normalized}:(\\d+):(\\d+)`));
      const line = lineInfo ? ` at line ${lineInfo[1]}, column ${lineInfo[2]}` : "";
      const message = fnErr.message ? `: ${fnErr.message}` : "";
      return sanitize(`<span class="lgml-error">LGML: error in ${normalized}.${functionName}${line}${message}</span>`, PURIFY_CONFIG);
    }
  }

  // --- Load module page ---
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

  // --- Parse LGML args ---
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

  /* Padreramnt1 Implementations */
  function pipe(value, ...functions) {
      return functions.reduce((res, fn) => fn(res), value)
  }

  function flow(...functions) {
      return (value) => pipe(value, ...functions)
  }

  const Either = {
      is(it) {
          return typeof it === 'object' && null != it && 'Either' === it._type
      },
      error(error) {
          return {
              _type: 'Either',
              ok: false,
              error,
          }
      },
      ok(value) {
          return {
              _type: 'Either',
              ok: true,
              value,
          }
      },
      assert(condition, error) {
          return (value) => {
              return !condition
                  ? Either.ok(value)
                  : Either.error(error)
          }
      },
      map(fn) {
          return (either) => {
              if (either.ok) {
                  return Either.ok(fn(either.value))
              }
              return either
          }
      },
      flattern(either) {
          if (!either.ok) {
              return either
          }
          if (!either.value.ok) {
              return either.value
          }
          return Either.ok(either.value.value)
      },
      chain(fn) {
          return (either) => {
              return pipe(
                  either,
                  Either.map(fn),
                  Either.flattern,
              )
          }
      },
      unwrap(either) {
          if (!either.ok) {
              if (either.error instanceof Error) {
                  throw either.error
              }
              throw new Error(either.error)
          }
          return either.value
      },
      tryCatch(fn) {
          return (it) => {
              try {
                  return Either.ok(fn(it))
              } catch (error) {
                  return Either.error(error)
              }
          }
      },
  }

  const Decode = {
      default(fallback) {
          return Either.chain(value => null == value ? fallback : value)
      },
      number: (() => {
          function convert(value) {
              if (typeof value === 'string') {
                  value = value.trim()
              }
              if ('' === value) {
                  return Either.ok(null)
              }
              const valueOf = value.valueOf()
              const asNumber = typeof valueOf === 'number' ? valueOf : Number(valueOf)
              if (isNaN(asNumber)) {
                  return Either.error(new TypeError(`not a number`, { cause: { value } }))
              }
              return Either.ok(asNumber)
          }

          const decoder = (value, ...asserts) => {
              return pipe(
                  value,
                  convert,
                  Either.chain(Assert.required),
                  ...asserts.map(Either.chain),
                  Either.unwrap
              )
          }
          decoder.optional = (value, ...asserts) => {
              return pipe(
                  value,
                  convert,
                  ...asserts.map(Either.chain),
                  Either.unwrap
              )
          }
          return decoder
      })(),
      string: (() => {
          const convert = (value) => {
              if (null == value) {
                  return Either.ok(value)
              }
              return Either.ok(typeof value === 'string' ? value : value.toString())
          }
          const decoder = (value, ...asserts) => {
              return pipe(
                  value,
                  convert,
                  Either.chain(Assert.required),
                  ...asserts.map(Either.chain),
                  Either.unwrap,
              )
          }
          decoder.optional = (value, ...asserts) => {
              return pipe(
                  value,
                  ...asserts.map(Either.chain),
                  Either.unwrap,
              )
          }
          return decoder
      })(),
      object: (() => {
          const decoder = (scheme, value, ...asserts) => {
              return pipe(
                  value,
                  Assert.required,
                  Either.chain(Assert.scheme(scheme)),
                  ...asserts.map(Either.chain),
                  Either.unwrap,
              )
          }
          decoder.optional = (scheme, value, ...asserts) => {
              return pipe(
                  value,
                  Either.chain(Assert.scheme(scheme)),
                  ...asserts.map(Either.chain),
                  Either.unwrap,
              )
          }
          return decoder
      })()
  }

  const Assert = {
      required(it) {
          return Either.assert(null == it || '' == it, new TypeError('required', {
              cause: {
                  value: it
              }
          }))(it)
      },
      number(it) {
          return Either.assert(typeof it !== 'number' || isNaN(it), new TypeError('not a number', {
              cause: {
                  value: it
              }
          }))(it)
      },
      string(it) {
          return Either.assert(typeof it !== 'string', new TypeError(`not a string`, {
              cause: {
                  value: it
              }
          }))(it)
      },
      object(it) {
          return Either.assert(typeof it !== 'object' || null == it, new TypeError(`not a object`, {
              cause: {
                  value: it
              }
          }))(it)
      },
      range(min, max) {
          return (it) => {
              return pipe(
                  it,
                  Assert.number,
                  Either.chain(Either.assert(it < min || max < it), new Error(`out of range [${min}, ${max}]`, {
                      cause: {
                          value: it,
                          min,
                          max,
                          range: [min, max]
                      }
                  })),
              )
          }
      },
      oneOf(entries) {
          return (it) => {
              return Either.assert(!entries.includes(it), new Error(`expected to be one of`, {
                  cause: {
                      value: it,
                      entries
                  }
              }))(it)
          }
      },
      keyOf(obj) {
          const keys = Object.keys(obj)
          return Assert.oneOf(keys)
      },
      scheme(obj) {
          const keys = Object.keys(obj)
          return (it) => {
              let failed = false;
              let out = {};
              let errors = {}
              keys.forEach(key => {
                  const value = it[key]
                  const check = obj[key]
                  const res = pipe(value, Either.tryCatch(check))
                  if (res.ok) {
                      out[key] = res.value
                  } else {
                      failed = true
                      errors[key] = res.error
                  }
              })
              return Either.assert(failed, new Error(`object assert exeption`, {
                  cause: {
                      value: it,
                      errors
                  }
              }))(out)
          }
      }
  }

  const Enum = {
      create(obj) {
          return Object.keys(obj).reduce((a, c) => (a[c] = c, a), {})
      }
  }
  /* END of Padreramnt1 Implementation */

  // --- AST quick safety check (disallow imports, eval, new Function, process, Buffer, globalThis) ---
  function isModuleSafe(code) {
    if (!code || typeof code !== 'string') return false;
    try {
      const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true });
      let ok = true;
      walk.simple(ast, {
        Identifier(node) {
          const name = node.name;
          if (['process', 'global', 'globalThis', 'Buffer', 'XMLHttpRequest', 'fetch'].includes(name)) ok = false;
        },
        CallExpression(node) {
          if (node.callee && node.callee.type === 'Identifier' && node.callee.name === 'eval') ok = false;
          if (node.callee && node.callee.type === 'Identifier' && node.callee.name === 'require') {
            const arg = node.arguments && node.arguments[0];
            // require must be a string literal; allow any literal name but block relative/absolute paths and builtin modules
            if (!arg || arg.type !== 'Literal') ok = false;
            else {
              const val = String(arg.value || '').trim();
              // disallow relative imports or filesystem paths (./, ../, /) or windows absolute paths (C:\)
              if (/^(?:\.\.?[\/\\]|[\/\\]|[A-Za-z]:[\/\\])/.test(val)) ok = false;
              try {
                const builtins = require('module').builtinModules || [];
                if (builtins.includes(val)) ok = false;
              } catch (e) {
                // ignore builtin detection errors
              }
            }
          }
        },
        NewExpression(node) {
          if (node.callee && node.callee.type === 'Identifier' && node.callee.name === 'Function') ok = false;
        },
        ImportDeclaration() { ok = false; },
        ImportExpression() { ok = false; },
        ExportNamedDeclaration() { ok = false; },
        ExportDefaultDeclaration() { ok = false; },
        ExportAllDeclaration() { ok = false; }
      });
      return ok;
    } catch (e) {
      return false;
    }
  }

  // --- Use a worker to run the module code for isolation and resource limits ---
  try {
    // --- Wrap module in async IIFE to support top-level await ---
    if (!isModuleSafe(modulePage.content)) {
      return `<span class="lgml-error">LGML: Module ${normalized} contains disallowed constructs</span>`;
    }

    // Sanitize/serialize some options to send to worker
    const workerOptions = {
      wikiName: options.wikiName,
      currentNamespace: options.currentNamespace,
      depth,
      _maxDepth: 10
    };

    const worker = new Worker(workerPath, {
      workerData: {
        moduleName: normalized,
        functionName,
        args: positionalArgs.length === 0 && Object.keys(namedArgs).length > 0 ? [namedArgs] : positionalArgs.length ? positionalArgs : [namedArgs],
        code: modulePage.content,
        options: workerOptions
      },
      resourceLimits: { maxOldGenerationSizeMb: 256 }
    });

    let timer;
    const timeoutMs = 2000; // overall execution timeout
    const result = await new Promise((resolve, reject) => {
      const onMessage = async (msg) => {
        if (!msg || !msg.type) return;
        if (msg.type === 'getPage') {
          // a worker requests a page from DB
          try {
            const { id, kind, name } = msg;
            const p = await options.getPage(kind, name);
            worker.postMessage({ type: 'getPageResponse', id, content: p });
          } catch (e) {
            worker.postMessage({ type: 'getPageResponse', id, content: null });
          }
          return;
        }
        if (msg.type === 'log') {
          try { console.error('[LGML Worker] ', msg.message); } catch (e) {}
          return;
        }
        if (msg.type === 'result') {
          clearTimeout(timer);
          resolve(msg.result);
        } else if (msg.type === 'error') {
          clearTimeout(timer);
          reject(new Error(msg.error || 'Module execution error'));
        }
      };
      worker.on('message', onMessage);
      worker.on('error', (err) => { clearTimeout(timer); reject(err); });
      worker.on('exit', (code) => { if (code !== 0) clearTimeout(timer); });
      timer = setTimeout(() => {
        try { worker.terminate(); } catch (e) {}
        reject(new Error('Module execution timeout'));
      }, timeoutMs);
    }).catch((err) => {
      return sanitize(`<span class="lgml-error">LGML: execution error in ${normalized}: ${String(err)}</span>`, PURIFY_CONFIG);
    });


    // the worker returned a sanitized or serialized result
    if (result == null) return "";
    if (typeof result === 'object' && result.__exports__) {
      // cache the plain exports (if serializable) and return
      try { if (options && options._moduleCache && typeof options._moduleCache.set === 'function') options._moduleCache.set(normalized, result.__exports__); } catch (e) {}
      return { __exports__: result.__exports__ };
    }
    if (typeof result === 'string') return result;
    try { return String(result); } catch { return JSON.stringify(result); }

  } catch (err) {
    const stack = err.stack || "";
    const lineInfo =
      stack.match(new RegExp(`Module:${normalized}:(\\d+):(\\d+)`)) ||
      stack.match(new RegExp(`Module:${normalized}:(\\d+)`));
    const line = lineInfo ? ` at line ${lineInfo[1]}${lineInfo[2] ? `, column ${lineInfo[2]}` : ""}` : "";
    const message = err.message ? `: ${err.message}` : "";
    return sanitize(`<span class="lgml-error">LGML: execution error in ${normalized}${line}${message}</span>`, PURIFY_CONFIG);
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

      if (/^\|-$/.test(l.trim())) {
        if (currentRow.length > 0) {
          table.rows.push(currentRow);
          currentRow = [];
        }
        i++;
        continue;
      }

      if (/^\|\+/.test(l)) {
        table.caption = l.replace(/^\|\+\s*/, "");
        i++;
        continue;
      }

      if (/^!/.test(l)) {
        const parts = l.split(/!!/);
        for (const part of parts) {
          const raw = part.trim().replace(/^!\s*/, "");
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
            isHeader: true,
            align,
            text,
          });
        }
        i++;
        continue;
      }

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
    return { table, nextIndex: i + 1 };
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.replace(/\r$/, "");

    if (/^\{\|/.test(line)) {
      const { table, nextIndex } = tokenizeTables(i);
      tokens.push(table);
      i = nextIndex - 1;
      continue;
    }

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

    if (/^(?:-{4,}|\*{3,})$/.test(trimmed)) {
      tokens.push({ type: "hr" });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      tokens.push({ type: "blockquote", content: trimmed.replace(/^>\s?/, "") });
      continue;
    }

    if (/^(?:\t| {4})/.test(rawLine)) {
      tokens.push({ type: "codeBlock", content: rawLine.replace(/^(?:\t| {4})/, "") });
      continue;
    }

    const headingMatch = trimmed.match(/^(={2,6})\s*(.+?)\s*\1$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const id = text.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-:.]/g, "");
      tokens.push({ type: "heading", level, text, id });
      continue;
    }

    const listMatch = trimmed.match(/^([*#-]+)\s+(.*)$/);
    if (listMatch) {
      const markers = listMatch[1];
      const level = markers.length;
      const ordered = markers[0] === "#";
      const content = tokenizeInline(listMatch[2], LINK_REGEX, options);
      tokens.push({ type: "listItem", ordered, level, content });
      continue;
    }

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

    const parts = tokenizeInline(trimmed, LINK_REGEX, options);

    /* -------------------------------------------------------------
       FIXED: Safe HTML block detection (no greediness)
    ------------------------------------------------------------- */
    // Detect start of a block-level HTML element
    const htmlOpen = trimmed.match(/^<([a-zA-Z][\w-]*)\b[^>]*>\s*$/);

    if (htmlOpen) {
      const tag = htmlOpen[1].toLowerCase();

      // Only treat known block-level elements as htmlBlock
      if (BLOCK_TAGS.includes(tag)) {
        const blockLines = [trimmed];
        const stack = [tag];

        while (i + 1 < lines.length && stack.length > 0) {
          const nextLine = lines[++i];

          // A line containing ONLY "<tag ...>"
          const nextOpen = nextLine.trim().match(/^<([a-zA-Z][\w-]*)\b[^>]*>\s*$/);
          // A line containing ONLY "</tag>"
          const nextClose = nextLine.trim().match(/^<\/([a-zA-Z][\w-]*)>\s*$/);

          if (nextOpen) {
            const t = nextOpen[1].toLowerCase();
            if (BLOCK_TAGS.includes(t)) stack.push(t);
          } else if (nextClose) {
            const t = nextClose[1].toLowerCase();
            if (stack[stack.length - 1] === t) {
              stack.pop();
            } else {
              const idx = stack.lastIndexOf(t);
              if (idx !== -1) stack.splice(idx);
            }
          }

          blockLines.push(nextLine);
        }

        tokens.push({
          type: "htmlBlock",
          content: blockLines.join("\n")
        });

        continue;
      }
    }

    // default text
    tokens.push({ type: "textBlock", content: Array.isArray(parts) ? parts : [parts] });
  }

  return tokens;
}


// Helper to tokenize inline text (links + text)
function tokenizeInline(line, linkRegex, options = {}) {
  const parts = [];
  let lastIndex = 0;
  let match;

  options.categories ||= new Set();
  options.tags ||= new Set();

  while ((match = linkRegex.exec(line)) !== null) {

    if (match.index > lastIndex) {
      parts.push({ type: "text", value: line.slice(lastIndex, match.index) });
    }

    // Internal [[Target|Label]]
    if (match[1]) {
      const target = match[1];
      const label = match[2] || target;

      if (/^Category:/i.test(target)) {
        const categoryName = target.replace(/^Category:/i, "").trim();
        parts.push({ type: "category", name: categoryName });
        options.categories.add(categoryName);

      } else if (/^Tag:/i.test(target)) {
        const tagName = target.replace(/^Tag:/i, "").trim();
        parts.push({ type: "tag", name: tagName });
        options.tags.add(tagName);

      } else {
        parts.push({ type: "link", target, label });
      }
    }

    // External link
    else if (match[3]) {
      parts.push({
        type: "externalLink",
        url: match[3],
        label: match[4] || match[3]
      });
    }

    lastIndex = linkRegex.lastIndex;
  }

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
      return `<a href="${finalHref}" class="${linkClass}">${label}</a>`;
    }

    if (part.type === "externalLink") {
      const safeUrl = encodeURI(part.url.trim());
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${sanitize(part.label || safeUrl, PURIFY_CONFIG)}</a>`;
    }

    return "";
  }).join("");
}

/* ---------------------------
   Table Parser (Enhanced)
   - Supports rowspan, colspan, style, alignment (:---:), and escape templates
---------------------------- */
async function parseTables(text, expandTemplatesFn, options = {}) {
  const tableRegex = /\{\|([\s\S]*?)\|\}/g;
  const matches = [...text.matchAll(tableRegex)];
  if (matches.length === 0) return text;

  let result = text;

  for (const match of matches) {
    const fullMatch = match[0];
    const content = match[1];
    const html = await renderTable(content, expandTemplatesFn, options);
    result = result.replace(fullMatch, html);
  }

  return result;
}

async function renderTable(content, expandTemplatesFn, options = {}) {
  const lines = content.trim().split(/\r?\n/);
  let html = "";

  // --- Extract table-level attributes ---
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
      html += `<caption>${sanitize(renderInline(
        tokenizeInline(line.substring(2).trim(), LINK_REGEX, {
          wikiName: options.wikiName,
          currentNamespace: options.currentNamespace,
          existingFiles: options.existingFiles,
          existingPages: options.existingPages
        }),
        {
          wikiName: options.wikiName,
          currentNamespace: options.currentNamespace,
          existingFiles: options.existingFiles,
          existingPages: options.existingPages
        }
      ), PURIFY_CONFIG)}</caption>`;
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
      const renderedCells = await Promise.all(
        parts.map(h => renderCell(h, true, expandTemplatesFn, options))
      );
      currentRow.push(...renderedCells);
      continue;
    }

    // --- Data row ---
    if (line.startsWith("|")) {
      const parts = line.substring(1).split("||");
      const renderedCells = await Promise.all(
        parts.map(c => renderCell(c, false, expandTemplatesFn, options))
      );
      currentRow.push(...renderedCells);
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
}

async function renderCell(cell, isHeader, expandTemplatesFn, options = {}) {
  let attr = "";
  let text = cell.trim();

  // --- Expand escape templates inside the cell if function provided ---
  if (expandTemplatesFn) text = await expandTemplatesFn(text, { ...options });

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
  return `<${tag}${attr ? " " + attr : ""}>${sanitize(renderInline(
    tokenizeInline(text, LINK_REGEX, {
      wikiName: options.wikiName,
      currentNamespace: options.currentNamespace,
      existingFiles: options.existingFiles,
      existingPages: options.existingPages
    }),
    {
      wikiName: options.wikiName,
      currentNamespace: options.currentNamespace,
      existingFiles: options.existingFiles,
      existingPages: options.existingPages
    }
  ), PURIFY_CONFIG)}</${tag}>`;
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
      // Ignore <table> blocks completely
      if (/^<table\b/i.test(t.content.trim())) {
        // just output the raw HTML (sanitized)
        html += sanitize(t.content, PURIFY_CONFIG) + "\n";
      } else {
        // Parse the inner text of other HTML blocks
        const htmlMatch = t.content.match(/^<([a-zA-Z][\w-]*)([^>]*)>([\s\S]*?)<\/\1>$/i);

        if (htmlMatch) {
          const tag = htmlMatch[1];
          const attrs = htmlMatch[2]; // keep original attributes
          const innerText = htmlMatch[3]; // the text inside the HTML block

          // 1️⃣ Tokenize/parse the inner text
          const innerTokens = tokenizeInline(innerText, LINK_REGEX, {
            wikiName,
            currentNamespace,
            existingFiles,
            existingPages: options.existingPages,
          });

          // 2️⃣ Render parsed tokens
          const parsedInner = renderInline(innerTokens, {
            wikiName,
            currentNamespace,
            existingFiles,
            existingPages: options.existingPages,
          });

          // 3️⃣ Sanitize and wrap with original tag/attributes
          html += `<${tag}${attrs}>${sanitize(parsedInner, PURIFY_CONFIG)}</${tag}>\n`;
        } else {
          // fallback: treat as raw HTML
          html += sanitize(t.content, PURIFY_CONFIG) + "\n";
        }
      }
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

    // --- PREPASS: Protect built-in escape templates (like {{!}}, {{[}}, etc.) ---
    for (const [name, entity] of Object.entries(BUILTIN_TEMPLATES)) {
      // Escape any regex special characters in the template name
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\{\\{${escapedName}\\}\\}`, 'g');
      text = text.replace(regex, entity);
    }

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

  // Ensure a per-request module cache exists. This Map stores module exports
  // keyed by module name so repeated `require`/#invoke calls reuse the same
  // compiled module during a single render request.
  if (!options._moduleCache) options._moduleCache = new Map();

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
  working = await parseTables(working, expandTemplates, { ...options });
  const tokens = tokenize(working, { categories: pageCategories, tags: pageTags });
  let html = parse(tokens, options); // parse now returns object
  
  // Detect and strip __NOINDEX__
  let noIndex = false;
  if (/__NOINDEX__/i.test(html)) {
    noIndex = true;
    html = html.replace(/__NOINDEX__/gi, "");
  }

  // --- Restore <nowiki> after parsing ---
  const restoredHtml = restoreNowikiBlocks(html, nowikiBlocks);

  // Return both HTML and categories
  return { html: restoredHtml, categories: Array.from(pageCategories).map(c => c.replace(/ /g, "_")).filter(Boolean), tags: Array.from(pageTags), noIndex };
}

module.exports = { renderWikiText, resolveLink };