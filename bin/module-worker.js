const { parentPort, workerData } = require('worker_threads');
const vm = require('vm');
const DOMPurify = require('isomorphic-dompurify');
const sanitize = DOMPurify.sanitize;

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
const PURIFY_CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: true,
  FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "meta"],
  FORBID_ATTR: [/^on/i],
  KEEP_CONTENT: true,
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp|tel|data|#):|[^a-z]|[a-z+.-]+:)/i
};

// minimal helpers copied from wiki-renderer.js helpers (Either, Assert, etc.)
// We'll provide a small safe subset for modules.

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((prop) => deepFreeze(obj[prop]));
  }
  return obj;
}

function pipe(value, ...functions) {
  return functions.reduce((res, fn) => fn(res), value);
}

function flow(...functions) {
  return (value) => pipe(value, ...functions);
}

const Either = {
  is(it) {
    return typeof it === 'object' && it != null && it._type === 'Either';
  },
  error(error) { return { _type: 'Either', ok: false, error }; },
  ok(value) { return { _type: 'Either', ok: true, value }; },
  assert(condition, error) {
    return (value) => { return !condition ? Either.ok(value) : Either.error(error); };
  },
  map(fn) { return (either) => either.ok ? Either.ok(fn(either.value)) : either; },
  flattern(either) { if (!either.ok) return either; if (!either.value.ok) return either.value; return Either.ok(either.value.value); },
  chain(fn) { return (either) => pipe(either, Either.map(fn), Either.flattern); },
  unwrap(either) { if (!either.ok) { if (either.error instanceof Error) throw either.error; throw new Error(either.error); } return either.value; },
  tryCatch(fn) { return (it) => { try { return Either.ok(fn(it)); } catch (error) { return Either.error(error); } }; },
};

const Decode = {
  default(fallback) { return Either.chain(value => value == null ? fallback : value); },
  number: (() => {
    function convert(value) {
      if (typeof value === 'string') value = value.trim();
      if ('' === value) return Either.ok(null);
      const valueOf = value.valueOf();
      const asNumber = typeof valueOf === 'number' ? valueOf : Number(valueOf);
      if (isNaN(asNumber)) return Either.error(new TypeError('not a number', { cause: { value } }));
      return Either.ok(asNumber);
    }
    const decoder = (value, ...asserts) => pipe(value, convert, Either.chain(Assert.required), ...asserts.map(Either.chain), Either.unwrap);
    decoder.optional = (value, ...asserts) => pipe(value, convert, ...asserts.map(Either.chain), Either.unwrap);
    return decoder;
  })(),
  string: (() => {
    const convert = (value) => { if (value == null) return Either.ok(value); return Either.ok(typeof value === 'string' ? value : value.toString()); };
    const decoder = (value, ...asserts) => pipe(value, convert, Either.chain(Assert.required), ...asserts.map(Either.chain), Either.unwrap);
    decoder.optional = (value, ...asserts) => pipe(value, ...asserts.map(Either.chain), Either.unwrap);
    return decoder;
  })(),
  object: (() => { const decoder = (scheme, value, ...asserts) => pipe(value, Assert.required, Either.chain(Assert.scheme(scheme)), ...asserts.map(Either.chain), Either.unwrap); decoder.optional = (scheme, value, ...asserts) => pipe(value, Either.chain(Assert.scheme(scheme)), ...asserts.map(Either.chain), Either.unwrap); return decoder; })()
};

const Assert = {
  required(it) { return Either.assert(it == null || it === '', new TypeError('required', { cause: { value: it } }))(it); },
  number(it) { return Either.assert(typeof it !== 'number' || isNaN(it), new TypeError('not a number', { cause: { value: it } }))(it); },
  string(it) { return Either.assert(typeof it !== 'string', new TypeError('not a string', { cause: { value: it } }))(it); },
  object(it) { return Either.assert(typeof it !== 'object' || it == null, new TypeError('not a object', { cause: { value: it } }))(it); },
  range(min, max) { return (it) => { return pipe(it, Assert.number, Either.chain(Either.assert(it < min || max < it, new Error(`out of range [${min}, ${max}]`, { cause: { value: it, min, max, range: [min, max] } })))) } },
  oneOf(entries) { return (it) => Either.assert(!entries.includes(it), new Error('expected to be one of', { cause: { value: it, entries } }))(it); },
  keyOf(obj) { const keys = Object.keys(obj); return Assert.oneOf(keys); },
  scheme(obj) { const keys = Object.keys(obj); return (it) => { let failed = false; let out = {}; let errors = {}; keys.forEach(key => { const value = it[key]; const check = obj[key]; const res = pipe(value, Either.tryCatch(check)); if (res.ok) out[key] = res.value; else { failed = true; errors[key] = res.error; } }); return Either.assert(failed, new Error('object assert exeption', { cause: { value: it, errors } }))(out); }; }
};

const Enum = { create(obj) { return Object.keys(obj).reduce((a, c) => (a[c] = c, a), {}); } };

// Freeze helper objects to avoid modification by module code
deepFreeze(pipe); deepFreeze(flow); deepFreeze(Either); deepFreeze(Decode); deepFreeze(Assert); deepFreeze(Enum);

function sanitizeOutput(v) {
  if (v == null) return '';
  if (typeof v === 'string') return sanitize(v, PURIFY_CONFIG);
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

// Worker state
const moduleCache = new Map(); // per-worker cache of compiled export objects
const initialDepth = (workerData && workerData.options && typeof workerData.options.depth === 'number') ? workerData.options.depth : 0;
const maxDepth = (workerData && workerData.options && typeof workerData.options._maxDepth === 'number') ? workerData.options._maxDepth : 10;

// Helper: request a page from parent via message, returning content or null
function fetchPage(kind, name) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    function onMessage(msg) {
      if (!msg || msg.type !== 'getPageResponse' || msg.id !== id) return;
      parentPort.off('message', onMessage);
      resolve(msg.content || null);
    }
    parentPort.on('message', onMessage);
    parentPort.postMessage({ type: 'getPage', id, kind, name });
  });
}

// Basic resolveLink implementation (mirrors main file behavior)
function sanitizeAnchor(name) {
  return name.replace(/[^a-zA-Z0-9_\-:.]/g, '');
}
function resolveLink(target, { wikiName, currentNamespace = 'Main' } = {}) {
  if (!target) return '#';
  target = target.trim();
  if (target.startsWith('#')) return `#${sanitizeAnchor(target.slice(1))}`;
  let namespace = currentNamespace;
  let page = target;
  let anchor = null;
  if (page.includes('#')) {
    const [pagePart, anchorPart] = page.split('#', 2);
    page = pagePart; anchor = sanitizeAnchor(anchorPart);
  }
  if (page.includes(':')) {
    const parts = page.split(':'); namespace = parts.shift(); page = parts.join(':');
  }
  const pagePath = page.replace(/\s+/g, '_');
  const urlPath = namespace === 'Main' ? pagePath : `${namespace}:${pagePath}`;
  const safeWikiName = (wikiName || '').replace(/ /g, '-');
  const safeUrlPath = urlPath
    .split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/')
    .replace(/%3A/g, ':');
  const base = `/wikis/${safeWikiName}/${safeUrlPath}`;
  return anchor ? `${base}#${anchor}` : base;
}

// Worker: compile and execute module content safely inside its VM context
async function executeModuleInWorker(normalized, code, functionName, args, envOptions, currentDepth = initialDepth) {
  // Local AST check to avoid executing disallowed constructs inside the worker
  function isModuleSafeLocal(code) {
    if (!code || typeof code !== 'string') return false;
    try {
      const ast = require('acorn').parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
      let ok = true;
      require('acorn-walk').simple(ast, {
        Identifier(node) {
          const name = node.name;
          if (['process', 'global', 'globalThis', 'Buffer', 'XMLHttpRequest', 'fetch'].includes(name)) ok = false;
        },
        CallExpression(node) {
          if (node.callee && node.callee.type === 'Identifier' && node.callee.name === 'eval') ok = false;
          if (node.callee && node.callee.type === 'Identifier' && node.callee.name === 'require') {
            const arg = node.arguments && node.arguments[0];
            if (!arg || arg.type !== 'Literal' || !/^Module:?/i.test(String(arg.value))) ok = false;
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
  if (moduleCache.has(normalized)) {
    const cached = moduleCache.get(normalized);
    // If caller asked for __default__, return the exports as plain object
    if (functionName === '__default__') return { __exports__: cached };
    const fn = cached && cached[functionName];
    if (!fn || typeof fn !== 'function') {
      return sanitizeOutput(`<span class="lgml-error">LGML: function \"${functionName}\" not found in Module:${normalized}</span>`);
    }
    try {
      const result = await Promise.resolve(fn.apply(null, args));
      return sanitizeOutput(result);
    } catch (err) {
      const message = err && err.message ? `: ${err.message}` : '';
      return sanitizeOutput(`<span class="lgml-error">LGML: error in ${normalized}.${functionName}${message}</span>`);
    }
  }

  // Build safe context
  const sandbox = {
    module: { exports: {} },
    exports: {},
    Math: deepFreeze(Math),
    Date: Date,
    JSON: JSON,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Array: Array,
    Object: Object,
    Promise: Promise,
    Function: undefined,
    eval: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,
    pipe, flow, Either, Decode, Assert, Enum,
    // helpers will be attached by stringified copies from workerData if provided
    __resolveLink: (t) => resolveLink(t, envOptions || {}),
    require: async function (name) {
      try {
        const mod = String(name || '').trim().replace(/\s+/g, '_');
        if (!mod) throw new Error('Empty module name');
        if (mod === normalized) throw new Error(`Recursive require: Module:${mod}`);
        // Simple recursion guard via local depth
          if (typeof currentDepth === 'number' && currentDepth >= maxDepth) throw new Error('Nested module limit exceeded');
        // Ask parent for the module code
        const content = await fetchPage('Module', mod);
        if (!content || !content.content) return {}; // module not found
        // compile and execute submodule inside same worker
        const res = await executeModuleInWorker(mod, content.content, '__default__', [], envOptions, currentDepth + 1);
        // `res` is likely a sanitized string or { __exports__: ... }
        // but for require we want the exports object
        // executeModuleInWorker returns { __exports__ } for __default__ case
        if (res && typeof res === 'object' && res.__exports__) return res.__exports__;
        return {};
      } catch (e) {
        parentPort.postMessage({ type: 'log', message: `require(\"${name}\") failed in ${normalized}: ${String(e)}` });
        return {};
      }
    }
  };

  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox, { name: `LGML:Module:${normalized}` });

  const wrapped = `\n(async (module, exports) => {\n  try {\n    'use strict';\n    ${code}\n  } catch (e) {\n    console.error(\"LGML module error:\", e);\n    throw e;\n  }\n  if (typeof exports === \"object\" && exports !== module.exports) { Object.assign(module.exports, exports); }\n})(module, module.exports)\n`;

  try {
    const script = new vm.Script(wrapped, { filename: `Module:${normalized}`, displayErrors: true, timeout: 1000 });
    const res = script.runInContext(sandbox, { timeout: 1000 });
    await res;

    let exported = sandbox.module.exports || sandbox.exports;
    if (sandbox.exports !== sandbox.module.exports) exported = sandbox.exports;

    // Cache per-worker exports
    try { moduleCache.set(normalized, exported); } catch (e) {}

    // If plain export -> return object wrapper
    const isPlainExport = exported && typeof exported === 'object' && !Object.values(exported).some(v => typeof v === 'function');

    if (functionName === '__default__' || isPlainExport) return { __exports__: exported };

    const fn = exported[functionName];
    if (!fn || typeof fn !== 'function') {
      return sanitizeOutput(`<span class=\"lgml-error\">LGML: function \"${functionName}\" not found in Module:${normalized}</span>`);
    }

    let result;
    try {
      if (!Array.isArray(args) || args.length === 0) result = await fn({});
      else result = await fn.apply(null, args);
    } catch (fnErr) {
      const message = fnErr.message ? `: ${fnErr.message}` : '';
      return sanitizeOutput(`<span class=\"lgml-error\">LGML: error in ${normalized}.${functionName}${message}</span>`);
    }

    if (result == null) return '';
    if (typeof result === 'string') return result;
    try { return String(result); } catch { return JSON.stringify(result); }

  } catch (err) {
    const stack = err.stack || '';
    const message = err.message ? `: ${err.message}` : '';
    return sanitizeOutput(`<span class=\"lgml-error\">LGML: execution error in ${normalized}${message}</span>`);
  }
}

(async () => {
  try {
    const moduleName = String(workerData.moduleName || '').trim();
    const functionName = workerData.functionName || '__default__';
    const args = workerData.args || [];
    const code = workerData.code || '';
    const envOptions = workerData.options || {};
    const result = await executeModuleInWorker(moduleName, code, functionName, args, envOptions);
    parentPort.postMessage({ type: 'result', result });
  } catch (error) {
    parentPort.postMessage({ type: 'error', error: error?.message || String(error), stack: error?.stack });
  }
})();
