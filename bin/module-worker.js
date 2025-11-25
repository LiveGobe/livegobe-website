'use strict';

const { parentPort, workerData } = require('worker_threads');
const vm = require('vm');
const acorn = require('acorn');
const acornWalk = require('acorn-walk');
const DOMPurify = require('isomorphic-dompurify');
const sanitize = DOMPurify.sanitize;

// --- STATIC CONSTANTS ---

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

// Hoisted once (important)
const PURIFY_CONFIG = Object.freeze({
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: true,
  FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "meta"],
  FORBID_ATTR: [/^on/i],
  KEEP_CONTENT: true,
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp|tel|data|#):|[^a-z]|[a-z+.-]+:)/i
});

// Hoisted for performance
const BUILTIN_MODULES = new Set(require('module').builtinModules || []);
const REQUIRE_PATH_RE = /^(?:\.\.?[\/\\]|[\/\\]|[A-Za-z]:[\/\\])/;

// --- HELPERS (unchanged logic) ---

function shallowFreeze(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.freeze(obj);
}

function pipe(value, ...fns) {
  for (const fn of fns) value = fn(value);
  return value;
}

function flow(...fns) {
  return (v) => pipe(v, ...fns);
}

const Either = {
  is(it) { return it && it._type === "Either"; },
  error(error) { return { _type: 'Either', ok: false, error }; },
  ok(value) { return { _type: 'Either', ok: true, value }; },
  assert(cond, error) {
    return v => cond ? Either.error(error) : Either.ok(v);
  },
  map(fn) {
    return e => e.ok ? Either.ok(fn(e.value)) : e;
  },
  flattern(e) {
    return !e.ok ? e : (!e.value.ok ? e.value : Either.ok(e.value.value));
  },
  chain(fn) {
    return e => Either.flattern(Either.map(fn)(e));
  },
  unwrap(e) {
    if (!e.ok) throw (e.error instanceof Error ? e.error : new Error(e.error));
    return e.value;
  },
  tryCatch(fn) {
    return it => {
      try { return Either.ok(fn(it)); }
      catch (error) { return Either.error(error); }
    };
  }
};

const Assert = {
  required(it) {
    return Either.assert(it == null || it === '', new TypeError('required', { cause: { value: it } }))(it);
  },
  number(it) {
    return Either.assert(typeof it !== 'number' || isNaN(it), new TypeError('not a number', { cause: { value: it } }))(it);
  },
  string(it) {
    return Either.assert(typeof it !== 'string', new TypeError('not a string', { cause: { value: it } }))(it);
  },
  object(it) {
    return Either.assert(typeof it !== 'object' || it == null, new TypeError('not a object', { cause: { value: it } }))(it);
  },
  range(min, max) {
    return it => pipe(
      it,
      Assert.number,
      Either.chain(
        Either.assert(it < min || it > max,
          new Error(`out of range [${min}, ${max}]`, { cause: { value: it, min, max } })
        )
      )
    );
  },
  oneOf(list) {
    return it => Either.assert(!list.includes(it), new Error("expected to be one of", { cause: { value: it, entries: list } }))(it);
  },
  keyOf(obj) { return Assert.oneOf(Object.keys(obj)); },

  scheme(scheme) {
    const keys = Object.keys(scheme);
    return it => {
      let failed = false;
      const out = {};
      const errors = {};

      for (const key of keys) {
        const val = it[key];
        const check = scheme[key];
        const res = pipe(val, Either.tryCatch(check));
        if (res.ok) out[key] = res.value;
        else {
          failed = true;
          errors[key] = res.error;
        }
      }

      return Either.assert(failed,
        new Error('object assert exeption', { cause: { value: it, errors } })
      )(out);
    };
  }
};

const Decode = {
  default(fallback) {
    return Either.chain(v => v == null ? fallback : v);
  },

  number: (() => {
    function convert(v) {
      if (typeof v === 'string') v = v.trim();
      if (v === '') return Either.ok(null);
      const n = typeof v.valueOf === 'function' ? Number(v.valueOf()) : Number(v);
      return isNaN(n) ? Either.error(new TypeError('not a number', { cause: { value: v } })) : Either.ok(n);
    }

    const decoder = (value, ...asserts) =>
      pipe(value, convert, Either.chain(Assert.required), ...asserts.map(Either.chain), Either.unwrap);

    decoder.optional = (value, ...asserts) =>
      pipe(value, convert, ...asserts.map(Either.chain), Either.unwrap);

    return decoder;
  })(),

  string: (() => {
    const convert = v => Either.ok(v == null ? v : String(v));

    const decoder = (val, ...asserts) =>
      pipe(val, convert, Either.chain(Assert.required), ...asserts.map(Either.chain), Either.unwrap);

    decoder.optional = (val, ...asserts) =>
      pipe(val, convert, ...asserts.map(Either.chain), Either.unwrap);

    return decoder;
  })(),

  object: (() => {
    const decoder = (scheme, val, ...asserts) =>
      pipe(val, Assert.required, Either.chain(Assert.scheme(scheme)), ...asserts.map(Either.chain), Either.unwrap);

    decoder.optional = (scheme, val, ...asserts) =>
      pipe(val, Either.chain(Assert.scheme(scheme)), ...asserts.map(Either.chain), Either.unwrap);

    return decoder;
  })()
};

const Enum = { create(o) { const out = {}; for (const k of Object.keys(o)) out[k] = k; return out; } };

// Freeze top-level helpers
shallowFreeze(pipe); shallowFreeze(flow);
shallowFreeze(Either); shallowFreeze(Decode);
shallowFreeze(Assert); shallowFreeze(Enum);

// --- Sanitization helper ---
function sanitizeOutput(v) {
  if (v == null) return '';
  if (typeof v === 'string') return sanitize(v, PURIFY_CONFIG);
  try { return JSON.stringify(v); }
  catch { return String(v); }
}

// --- Worker State ---
const moduleCache = new Map();
const initialDepth = workerData?.options?.depth ?? 0;
const maxDepth = workerData?.options?._maxDepth ?? 10;

// --- Page Fetch ---
function fetchPage(kind, name) {
  return new Promise(resolve => {
    const id = Math.random().toString(36).slice(2);

    function onMessage(msg) {
      if (msg?.type === 'getPageResponse' && msg.id === id) {
        parentPort.off('message', onMessage);
        resolve(msg.content || null);
      }
    }

    parentPort.on('message', onMessage);
    parentPort.postMessage({ type: 'getPage', id, kind, name });
  });
}

// --- Link resolution ---
function sanitizeAnchor(t) {
  return t.replace(/[^a-zA-Z0-9_\-:.]/g, '');
}

function resolveLink(target, { wikiName, currentNamespace = 'Main' } = {}) {
  if (!target) return '#';
  target = target.trim();
  if (target.startsWith('#')) return "#" + sanitizeAnchor(target.slice(1));

  let namespace = currentNamespace;
  let page = target;
  let anchor = null;

  const hashI = page.indexOf('#');
  if (hashI !== -1) {
    anchor = sanitizeAnchor(page.slice(hashI + 1));
    page = page.slice(0, hashI);
  }

  const nsI = page.indexOf(':');
  if (nsI !== -1) {
    namespace = page.slice(0, nsI);
    page = page.slice(nsI + 1);
  }

  const pagePath = page.replace(/\s+/g, '_');
  const urlPath = namespace === 'Main' ? pagePath : `${namespace}:${pagePath}`;

  const safeWiki = (wikiName || '').replace(/ /g, '-');
  const safeUrl = urlPath.split('/')
    .map(seg => encodeURIComponent(seg))
    .join('/')
    .replace(/%3A/g, ':');

  const base = `/wikis/${safeWiki}/${safeUrl}`;
  return anchor ? `${base}#${anchor}` : base;
}

// --- SECURITY: Hoisted AST checker ---

const acornParseOptions = {
  ecmaVersion: 'latest',
  sourceType: 'script',
  allowAwaitOutsideFunction: true
};

function isModuleSafeLocal(code) {
  if (typeof code !== 'string') return false;

  let ast;
  try {
    ast = acorn.parse(code, acornParseOptions);
  } catch { return false; }

  let ok = true;

  acornWalk.simple(ast, {
    Identifier(n) {
      const name = n.name;
      if (name === 'process' || name === 'global' || name === 'globalThis' ||
        name === 'Buffer' || name === 'XMLHttpRequest' || name === 'fetch')
        ok = false;
    },

    CallExpression(n) {
      const c = n.callee;
      if (!c || c.type !== 'Identifier') return;

      if (c.name === 'eval') ok = false;

      if (c.name === 'require') {
        const arg = n.arguments?.[0];
        if (!arg || arg.type !== 'Literal') ok = false;
        else {
          const val = String(arg.value || '').trim();
          if (REQUIRE_PATH_RE.test(val)) ok = false;
          else if (BUILTIN_MODULES.has(val)) ok = false;
        }
      }
    },

    NewExpression(n) {
      if (n.callee?.type === 'Identifier' && n.callee.name === 'Function') {
        ok = false;
      }
    },

    ImportDeclaration() { ok = false; },
    ImportExpression() { ok = false; },
    ExportNamedDeclaration() { ok = false; },
    ExportDefaultDeclaration() { ok = false; },
    ExportAllDeclaration() { ok = false; }
  });

  return ok;
}

// --- EXECUTOR ---

// Hoisted vm.Script compile options
const VM_SCRIPT_OPTIONS = {
  filename: '',
  displayErrors: true,
  timeout: 1000
};

async function executeModuleInWorker(normalized, code, functionName, args, envOptions, depth = initialDepth) {
  if (!isModuleSafeLocal(code)) {
    return sanitizeOutput(`<span class="lgml-error">LGML: Module ${normalized} contains disallowed constructs</span>`);
  }

  // CACHE HIT
  if (moduleCache.has(normalized)) {
    const cached = moduleCache.get(normalized);

    if (functionName === '__default__')
      return { __exports__: cached };

    const fn = cached?.[functionName];
    if (typeof fn !== 'function') {
      return sanitizeOutput(`<span class="lgml-error">LGML: function "${functionName}" not found in Module:${normalized}</span>`);
    }

    try {
      const result = await fn(...args);
      return sanitizeOutput(result);
    } catch (e) {
      return sanitizeOutput(`<span class="lgml-error">LGML: error in ${normalized}.${functionName}: ${e.message || ''}</span>`);
    }
  }

  // Build sandbox
  const moduleObj = { exports: {} };

  const sandbox = {
    module: moduleObj,

    // exports ALWAYS points to moduleObj.exports
    get exports() { return moduleObj.exports; },
    set exports(v) { moduleObj.exports = v; },
    Math: shallowFreeze(Math),
    Date,
    JSON,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Promise,

    Function: undefined,
    eval: undefined,
    setTimeout: undefined,
    setInterval: undefined,
    setImmediate: undefined,

    pipe, flow, Either, Decode, Assert, Enum,

    __resolveLink: t => resolveLink(t, envOptions || {}),

    require: async name => {
      try {
        const raw = String(name || '').trim();
        if (!raw) throw new Error('Empty module name');
        if (REQUIRE_PATH_RE.test(raw)) throw new Error('Relative or absolute requires are not allowed');

        if (BUILTIN_MODULES.has(raw)) throw new Error('Requiring builtin modules is not allowed');

        const cleaned = raw.replace(/^Module:?/i, '').replace(/\s+/g, '_');
        if (cleaned === normalized) throw new Error(`Recursive require: Module:${cleaned}`);

        if (depth >= maxDepth) throw new Error('Nested module limit exceeded');

        const content = await fetchPage('Module', cleaned);
        if (!content?.content) return {};

        const res = await executeModuleInWorker(cleaned, content.content, '__default__', [], envOptions, depth + 1);

        return (res && typeof res === 'object' && res.__exports__) ? res.__exports__ : {};
      } catch {
        return {};
      }
    }
  };

  // After execution, if user overwrote `exports = {...}`,
  // sync it back into module.exports.
  function syncExportsBack() {
    if (sandbox.exports !== moduleObj.exports) {
      moduleObj.exports = sandbox.exports;
    }
  }

  const context = vm.createContext(sandbox, { name: `LGML:Module:${normalized}` });

  const wrappedCode =
    `\n(async (module) => {\n'use strict';\n${code}\n})(module)\n`;

  try {
    VM_SCRIPT_OPTIONS.filename = `Module:${normalized}`;
    const script = new vm.Script(wrappedCode, VM_SCRIPT_OPTIONS);
    const runFn = script.runInContext(context, { timeout: 1000 });
    await runFn;

    // Sync exports if user assigned `exports = {...}`
    syncExportsBack();

    const exported = moduleObj.exports;

    moduleCache.set(normalized, exported);

    const plain = exported && typeof exported === 'object' &&
      !Object.values(exported).some(v => typeof v === 'function');

    if (functionName === '__default__' || plain)
      return { __exports__: exported };

    const fn = exported[functionName];
    if (typeof fn !== 'function')
      return sanitizeOutput(`<span class="lgml-error">LGML: function "${functionName}" not found in Module:${normalized}</span>`);

    let result;
    try {
      result = args.length ? await fn(...args) : await fn({});
    } catch (e) {
      return sanitizeOutput(`<span class="lgml-error">LGML: error in ${normalized}.${functionName}: ${e.message || ''}</span>`);
    }

    return (typeof result === 'string') ? result : String(result);

  } catch (err) {
    return sanitizeOutput(
      `<span class="lgml-error">LGML: execution error in ${normalized}: ${err.message || ''}</span>`
    );
  }
}

// --- MAIN EXECUTION ---
(async () => {
  try {
    const name = String(workerData.moduleName || '').trim();
    const fn = workerData.functionName || '__default__';
    const args = workerData.args || [];
    const code = workerData.code || '';
    const env = workerData.options || {};

    const result = await executeModuleInWorker(name, code, fn, args, env);
    parentPort.postMessage({ type: 'result', result });

  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      error: error.message || String(error),
      stack: error.stack
    });
  }
})();