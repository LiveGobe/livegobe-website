// module_worker_thread_opt_patched.js
'use strict';

const { parentPort, workerData } = require('worker_threads');
const vm = require('vm');
const acorn = require('acorn');
const acornWalk = require('acorn-walk');
const DOMPurify = require('isomorphic-dompurify');
const sanitizeHtml = DOMPurify.sanitize;

// --- Configurable constants ---
const COMPILE_TIMEOUT_MS = 800;   // vm.Script compile timeout (ms)
const RUN_TIMEOUT_MS = 1200;     // function execution timeout (ms)
const RESULT_SANITIZE_THRESHOLD = 64; // only run DOMPurify when string length > this or contains '<'

// Allowed sanitize config (same as before)
const ALLOWED_TAGS = [
  "a","b","i","u","s","strong","em","br","p","span","div",
  "section","header","footer","article","figure","figcaption",
  "ul","ol","li","table","thead","tbody","tr","td","th",
  "blockquote","pre","code","hr","h1","h2","h3","h4","h5","h6",
  "img","button","video","audio","source"
];
const ALLOWED_ATTR = [
  "href","src","alt","title","width","height",
  "colspan","rowspan","class","id","style",
  "role","aria-label"
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

// --- Shared caches (per-worker/thread lifetime) ---
const safeModuleCheckCache = new Map(); // code -> boolean
const scriptCache = new Map();          // normalizedModuleName -> vm.Script
const moduleExportsCache = new Map();   // normalizedModuleName -> exports object (plain, serializable)
const moduleLoadPromises = new Map();   // normalizedModuleName -> Promise resolving to exports

// builtin modules list once
let builtinModules = [];
try { builtinModules = require('module').builtinModules || []; } catch (e) { builtinModules = []; }

// --- Lightweight helpers (frozen once) ---
function deepFreezeOnce(obj, flagName) {
  try {
    if (global[flagName]) return;
    function deepFreeze(o) {
      if (!o || typeof o !== 'object' || Object.isFrozen(o)) return;
      Object.freeze(o);
      Object.getOwnPropertyNames(o).forEach(p => deepFreeze(o[p]));
    }
    deepFreeze(obj);
    global[flagName] = true;
  } catch (e) { /* ignore */ }
}

// minimal pipe/flow/Either/Assert subset from your original file — keep small and freeze
const pipe = (value, ...fns) => fns.reduce((v, fn) => fn(v), value);
const flow = (...fns) => (v) => pipe(v, ...fns);

const Either = {
  ok: (v) => ({ _type: 'Either', ok: true, value: v }),
  error: (e) => ({ _type: 'Either', ok: false, error: e }),
  is: (it) => typeof it === 'object' && it != null && it._type === 'Either',
  map: (fn) => (either) => either.ok ? Either.ok(fn(either.value)) : either,
  flattern: (either) => {
    if (!either.ok) return either;
    if (!either.value.ok) return either.value;
    return Either.ok(either.value.value);
  },
  chain: (fn) => (either) => pipe(either, Either.map(fn), Either.flattern),
  tryCatch: (fn) => (it) => { try { return Either.ok(fn(it)); } catch (e) { return Either.error(e); } },
  unwrap: (either) => { if (!either.ok) { throw either.error instanceof Error ? either.error : new Error(either.error); } return either.value; }
};

const Assert = {
  required(it) { return Either.assert ? Either.assert(it == null || it === '', new TypeError('required'))(it) : it; } // fallback
};
// freeze the small helper set once so modules can't mutate them
deepFreezeOnce(pipe, '__lgml_pipe_frozen__');
deepFreezeOnce(flow, '__lgml_flow_frozen__');
deepFreezeOnce(Either, '__lgml_either_frozen__');
deepFreezeOnce(Assert, '__lgml_assert_frozen__');

// --- Utility: cheap HTML-like string detection ---
function looksLikeHtmlString(s) {
  if (typeof s !== 'string') return false;
  if (s.length > RESULT_SANITIZE_THRESHOLD) return s.includes('<') || s.includes('&lt;');
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

// sanitize only when needed
function sanitizeOutput(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    if (!looksLikeHtmlString(value)) return value;
    try { return sanitizeHtml(value, PURIFY_CONFIG); } catch (e) { return ''; }
  }
  // for objects/primitive numbers/booleans/arrays: return as-is (parent will stringify if needed)
  return value;
}

// --- Lightweight AST safety check with caching ---
// NOTE: changed to allow safe require("ModuleName") but forbid relative/absolute paths and builtins
function isModuleSafeCached(code) {
  if (!code || typeof code !== 'string') return false;
  const key = code;
  const cached = safeModuleCheckCache.get(key);
  if (cached !== undefined) return cached;

  let ok = true;
  try {
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true });
    acornWalk.simple(ast, {
      Identifier(node) {
        const name = node.name;
        if (name === 'process' || name === 'global' || name === 'globalThis' || name === 'Buffer' || name === 'XMLHttpRequest' || name === 'fetch') ok = false;
      },
      CallExpression(node) {
        if (node.callee && node.callee.type === 'Identifier') {
          const n = node.callee.name;
          if (n === 'eval') { ok = false; return; }
          if (n === 'require') {
            const arg = node.arguments && node.arguments[0];
            if (!arg || arg.type !== 'Literal') { ok = false; return; }
            const val = String(arg.value || '').trim();
            // forbid file paths or drive letters
            if (/^(?:\.\.?[\/\\]|[\/\\]|[A-Za-z]:[\/\\])/.test(val)) { ok = false; return; }
            // forbid Node builtins
            if (builtinModules.includes(val)) { ok = false; return; }
            // allow plain name or Module:Name
            return;
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
  } catch (e) {
    ok = false;
  }
  safeModuleCheckCache.set(key, ok);
  return ok;
}

// --- IPC helpers: fetchPage (asks parent) ---
function fetchPageFromParent(kind, name) {
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

// --- Load a module (with promise cache to prevent duplicate compilation) ---
async function loadModuleExports(normalized, envOptions = {}, currentDepth = 0, maxDepth = 10) {
  if (!normalized) return {};
  if (moduleExportsCache.has(normalized)) return moduleExportsCache.get(normalized);
  if (moduleLoadPromises.has(normalized)) return moduleLoadPromises.get(normalized);

  const p = (async () => {
    // stop excessively deep recursion
    if (currentDepth >= maxDepth) return {};
    // ask parent for Module page
    const page = await fetchPageFromParent('Module', normalized);
    if (!page || !page.content) return {};
    const code = page.content;

    // Security: AST check (cached)
    if (!isModuleSafeCached(code)) {
      return {}; // module refused
    }

    // Build sandbox
    const sandbox = createBaseSandbox(normalized, envOptions, currentDepth + 1, maxDepth);

    // Wrap code (async IIFE) but keep wrapper stable for caching
    const wrapped = `(async function(module, exports, __lgmlApi){ "use strict";\n${code}\n})(module, module.exports, __lgmlApi);`;

    // compile (cache per normalized name)
    let script = scriptCache.get(normalized);
    if (!script) {
      try {
        script = new vm.Script(wrapped, { filename: `Module:${normalized}`, displayErrors: true });
        scriptCache.set(normalized, script);
      } catch (e) {
        return {};
      }
    }

    // run in context
    try {
      const context = vm.createContext(sandbox, { name: `LGML:Module:${normalized}` });
      const runResult = script.runInContext(context, { timeout: COMPILE_TIMEOUT_MS }); // throws if compile-time or immediate runtime trap
      await Promise.resolve(runResult); // wait any returned promise
    } catch (e) {
      // on error return empty exports to avoid repeated runtime errors
      return {};
    }

    const exported = sandbox.module && sandbox.module.exports ? sandbox.module.exports : sandbox.exports || {};
    // cache plain exports (note: must be serializable when sending back to parent)
    try { moduleExportsCache.set(normalized, exported); } catch (e) {}
    return exported;
  })();

  moduleLoadPromises.set(normalized, p);
  try {
    const result = await p;
    moduleLoadPromises.delete(normalized);
    return result;
  } catch (e) {
    moduleLoadPromises.delete(normalized);
    return {};
  }
}

// --- create sandbox with minimal APIs and async require that uses loadModuleExports ---
function createBaseSandbox(normalizedCaller, envOptions, currentDepth, maxDepth) {
  // provide a minimal __lgmlApi used by modules
  const __lgmlApi = {
    getPage: async (kind, name) => {
      const p = await fetchPageFromParent(kind, name);
      return p;
    },
    resolveLink: (target) => {
      if (!target) return '#';
      const t = String(target).trim();
      if (t.startsWith('#')) return `#${t.slice(1).replace(/[^a-zA-Z0-9_\-:.]/g, '')}`;
      // allow "Namespace:Page" or "Page"
      let namespace = envOptions.currentNamespace || 'Main';
      let page = t;
      if (page.includes(':')) {
        const parts = page.split(':');
        namespace = parts.shift();
        page = parts.join(':');
      }
      const pagePath = page.replace(/\s+/g, '_');
      const urlPath = namespace === 'Main' ? pagePath : `${namespace}:${pagePath}`;
      const safeWikiName = (envOptions.wikiName || '').replace(/\s+/g, '-');
      const safeUrlPath = urlPath.split('/').map(seg => encodeURIComponent(seg)).join('/').replace(/%3A/g, ':');
      return envOptions.wikiName ? `/wikis/${safeWikiName}/${safeUrlPath}` : `/${safeUrlPath}`;
    },
    // async require: Module:Name or ModuleName -> load exports
    require: async (name) => {
      try {
        const raw = String(name || '').trim();
        if (!raw) return {};
        if (/^(?:\.\.?[\/\\]|[\/\\]|[A-Za-z]:[\/\\])/.test(raw)) return {};
        const cleaned = raw.replace(/^Module:?/i, '').replace(/\s+/g, '_');
        if (cleaned === normalizedCaller) return {}; // prevent direct recursion
        const exports = await loadModuleExports(cleaned, envOptions, currentDepth, maxDepth);
        return exports || {};
      } catch (e) {
        return {};
      }
    },
    console: {
      log: (...args) => parentPort.postMessage({ type: 'log', message: args.map(String).join(' ') }),
      error: (...args) => parentPort.postMessage({ type: 'log', message: args.map(String).join(' ') })
    }
  };

  // base allowed global objects (avoid Function/process)
  const sandbox = {
    module: { exports: {} },
    exports: {},
    // Bind require in the sandbox to call our safe async loader.
    // Modules can do `const M = await require("Foo")` or `require("Foo").something`
    require: (name) => __lgmlApi.require(name),

    JSON,
    Math,
    Date,
    String,
    Number,
    Boolean,
    Array,
    Object,
    Promise,
    // expose our small helpers (immutable)
    pipe, flow, Either, Assert,
    __lgmlApi,
    // note: setTimeout/setInterval omitted on purpose
  };

  // freeze sandbox prototypes/objects to avoid mutation by module code (do this once per sandbox)
  try { Object.freeze(sandbox); } catch (e) {}
  return sandbox;
}

// --- main entry: receive workerData that contains code/moduleName/functionName/args/options ---
async function main() {
  try {
    const moduleName = String(workerData.moduleName || '').trim();
    const functionName = workerData.functionName || '__default__';
    const args = workerData.args || [];
    const code = workerData.code || ''; // only used if host asked current worker to compile inline (rare)
    const envOptions = workerData.options || {};
    const initialDepth = (envOptions && typeof envOptions.depth === 'number') ? envOptions.depth : 0;
    const maxDepth = (envOptions && typeof envOptions._maxDepth === 'number') ? envOptions._maxDepth : 10;

    // If code supplied directly (parent passed code), compile it like a module with the given name
    let exportsObj = null;
    if (code && moduleName) {
      // short-circuit: compile current code as the module
      if (!isModuleSafeCached(code)) {
        parentPort.postMessage({ type: 'result', result: sanitizeOutput(`<span class="lgml-error">LGML: Module ${moduleName} contains disallowed constructs</span>`) });
        return;
      }
      // We'll create a temporary script and run it in a sandbox similar to loadModuleExports
      // Use a unique temp name (do not persist to caches by default)
      const tempName = moduleName + ':inline';
      const sandbox = createBaseSandbox(moduleName, envOptions, initialDepth, maxDepth);
      const wrapped = `(async function(module, exports, __lgmlApi){ "use strict";\n${code}\n})(module, module.exports, __lgmlApi);`;

      try {
        let script = null;
        try {
          script = new vm.Script(wrapped, { filename: `Module:${tempName}`, displayErrors: true });
        } catch (e) {
          parentPort.postMessage({ type: 'result', result: sanitizeOutput(`<span class="lgml-error">LGML: compile error in ${moduleName}</span>`) });
          return;
        }
        const ctx = vm.createContext(sandbox, { name: `LGML:Module:${tempName}` });
        const runResult = script.runInContext(ctx, { timeout: COMPILE_TIMEOUT_MS });
        await Promise.resolve(runResult);
        exportsObj = sandbox.module.exports || {};
      } catch (e) {
        parentPort.postMessage({ type: 'result', result: sanitizeOutput(`<span class="lgml-error">LGML: execution error in ${moduleName}: ${e?.message || String(e)}</span>`) });
        return;
      }
    } else {
      // Load module exports via cache / parent getPage
      exportsObj = await loadModuleExports(moduleName, envOptions, initialDepth, maxDepth);
    }

    // If caller asked for full exports container:
    if (functionName === '__default__') {
      parentPort.postMessage({ type: 'result', result: { __exports__: exportsObj } });
      return;
    }

    // If requested function absent:
    const fn = exportsObj && exportsObj[functionName];
    if (!fn || typeof fn !== 'function') {
      parentPort.postMessage({ type: 'result', result: sanitizeOutput(`<span class="lgml-error">LGML: function "${functionName}" not found in Module:${moduleName}</span>`) });
      return;
    }

    // Execute function with either named arg or positional
    let execResult;
    try {
      // normalize args: if single object-like arg, pass as named
      if (Array.isArray(args) && args.length === 1 && typeof args[0] === 'object' && !Array.isArray(args[0])) {
        execResult = await Promise.race([
          Promise.resolve(fn(args[0])),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Function execution timeout')), RUN_TIMEOUT_MS))
        ]);
      } else {
        execResult = await Promise.race([
          Promise.resolve(fn.apply(null, args)),
          new Promise((_, rej) => setTimeout(() => rej(new Error('Function execution timeout')), RUN_TIMEOUT_MS))
        ]);
      }
    } catch (e) {
      parentPort.postMessage({ type: 'result', result: sanitizeOutput(`<span class="lgml-error">LGML: error in ${moduleName}.${functionName}: ${e?.message || String(e)}</span>`) });
      return;
    }

    // sanitize/serialize result minimally
    const out = sanitizeOutput(execResult);
    parentPort.postMessage({ type: 'result', result: out });
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: err?.message || String(err), stack: err?.stack });
  }
}

// Listen for parent messages while running (the code above uses fetchPageFromParent which relies on parentPort)
parentPort.on('message', (msg) => {
  // For this optimized worker we don't need to handle ad-hoc messages here;
  // fetchPageFromParent installs its own listeners for getPageResponse messages.
  if (!msg) return;
  // keep compatibility for possible control messages:
  if (msg && msg.type === 'terminateNow') {
    try { process.exit(0); } catch (e) {}
  }
});

// run main
main().catch(e => {
  parentPort.postMessage({ type: 'error', error: e?.message || String(e), stack: e?.stack });
});