"use strict";

const { parentPort } = require("worker_threads");
const { VM } = require("vm2");
const { readContent } = require("./wiki-file-storage");

const moduleCache = new Map();

const vm = new VM({
    sandbox: {
        module: { exports: {} },
        exports: {},
        frame: {},
        availablePages: {},
        requireData: async () => {
            throw new Error("requireData not initialized");
        }
    },
    allowAsync: true,
    eval: false,
    wasm: false
});

// ===============================
// Execution handler
// ===============================

async function executeTask(workerData) {
    const {
        moduleName,
        moduleHash,
        code,
        functionName,
        args,
        wikiId,
        existingPages,
        frame
    } = workerData;

    // Inject runtime helpers into sandbox per task
    vm.setGlobals({
        frame: frame || {},
        availablePages: existingPages || {},

        requireData: async function(name) {
            const key = String(name || "")
                .trim()
                .replace(/\s+/g, "_");

            if (!key) {
                throw new Error("requireData() expects module name");
            }

            const content = await readContent(wikiId, "Module", key);

            if (!content) {
                throw new Error(`requireData: module "${key}" not found`);
            }

            try {
                return JSON.parse(content);
            }
            catch (err) {
                throw new Error(
                    `requireData: failed to parse "${key}": ${err.message}`
                );
            }
        },
        console: process.env.NODE_ENV === "development" ? console : null
    });

    if (!moduleCache.has(moduleHash)) {
        const compiled = await vm.run(
            code,
            `LGML:Module:${moduleName}`
        );

        moduleCache.set(moduleHash, compiled);
    }

    const exported = moduleCache.get(moduleHash);

    let result;

    if (functionName === "__default__") {
        result = exported;
    }
    else if (typeof exported === "function") {
        result = await exported.apply(null, args);
    }
    else if (exported && typeof exported[functionName] === "function") {
        result = await exported[functionName].apply(null, args);
    }
    else {
        throw new Error(
            `function "${functionName}" not found in Module:${moduleName}`
        );
    }

    return { result, frame: JSON.parse(JSON.stringify(vm.sandbox.frame || {})) };
}

// ===============================
// Message loop worker
// ===============================

parentPort.on("message", async (task) => {
    try {
        const result = await executeTask(task);
        parentPort.postMessage(result);
    }
    catch (err) {
        parentPort.postMessage({
            error: err.message || "Unknown execution error"
        });
    }
});