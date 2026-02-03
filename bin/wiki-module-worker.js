"use strict";
const { parentPort, workerData } = require("worker_threads");
const { VM } = require("vm2");
const { readContent } = require("./wiki-file-storage");

(async () => {
  const { moduleName, code, functionName, args, wikiId } = workerData;

  // ----------------------------
  // 1. Sandbox
  // ----------------------------
  const sandbox = Object.create(null);
  sandbox.module = Object.create(null);
  sandbox.module.exports = Object.create(null);
  sandbox.exports = sandbox.module.exports;

  // ----------------------------
  // 2. Dynamic requireData (data-only)
  // ----------------------------
  sandbox.requireData = async function(name) {
    const key = String(name || "").trim().replace(/\s+/g, "_");
    if (!key) throw new Error("requireData() expects a module name");

    const content = await readContent(wikiId, "Module", key);

    if (!content) {
      throw new Error(`requireData: module "${key}" not found`);
    }

    try {
      return JSON.parse(content);
    } catch (err) {
      throw new Error(`requireData: failed to parse "${key}": ${err.message}`);
    }
  };

  Object.freeze(sandbox.requireData);

  // Optional helper
  sandbox.__resolveLink = target => String(target || "#");
  Object.freeze(sandbox);

  // ----------------------------
  // 3. VM
  // ----------------------------
  const vm = new VM({ sandbox, allowAsync: true, eval: false, wasm: false });

  try {
    const exported = await vm.run(code, `LGML:Module:${moduleName}`);

    let result;
    if (functionName === "__default__") {
      result = exported;
    } else if (typeof exported === "function") {
      result = await exported.apply(null, args);
    } else if (exported && typeof exported[functionName] === "function") {
      result = await exported[functionName].apply(null, args);
    } else {
      throw new Error(`function "${functionName}" not found in Module:${moduleName}`);
    }

    parentPort.postMessage({ result });
  } catch (err) {
    parentPort.postMessage({ error: err.message || "Unknown execution error" });
  }
})();
