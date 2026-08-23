"use strict";

const { parentPort } = require("worker_threads");
const ivm = require("isolated-vm");
const { readContent } = require("./wiki-file-storage");

const moduleCache = new Map();

// Size limit for frame object (100 MB)
const FRAME_SIZE_LIMIT = 104857600;

// Helper: Calculate approximate JSON serialized size
function getObjectSize(obj) {
    try {
        return Buffer.byteLength(JSON.stringify(obj), 'utf-8');
    } catch {
        return 0;
    }
}

const isolate = new ivm.Isolate({ memoryLimit: 1024 }); // 1 GB memory limit
const context = isolate.createContextSync();

const jail = context.global;
jail.setSync("global", jail.derefInto());
context.evalClosureSync(`
    global.module = { exports: {} };
    global.exports = {};
    global.frame = {};
    global.availablePages = new Set();
    global.requireData = async function() {
        throw new Error("requireData not initialized");
    }
`);

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

    await context.evalClosure(`
        global.frame = $0;
        global.availablePages = new Set($1);
    `, [frame || {}, Array.from(existingPages || new Set())], { arguments: { copy: true } });

    await context.evalClosure(`
        global.requireData = async function(...args) {
            return $0.apply(undefined, args, {
                arguments: { copy: true },
                result: { promise: true, copy: true }
            });
        };
    `, [async function (name) {
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
    }], { arguments: { reference: true } });

    if (!moduleCache.has(moduleHash)) {
        const script = await isolate.compileScript(code, {
            filename: `LGML: Module: ${moduleName}`,
            lineOffset: 0,
            columnOffset: 0,
            cachedData: null
        });

        moduleCache.set(moduleHash, script);
    }

    const moduleScript = await moduleCache.get(moduleHash);

    await moduleScript.run(context, { timeout: 10000 });

    const exported = context.global.getSync("module", { reference: true }).getSync("exports", { reference: true });

    let result;

    if (functionName === "__default__") {
        if (exported.typeof === "function") {
            result = await exported.apply(undefined, [args], { arguments: { copy: true }, result: { promise: true, copy: true } });
        } else result = exported.copySync();
    }
    else if (exported.typeof === "object") {
        const funcRef = exported.getSync(functionName, { reference: true });

        if (funcRef.typeof === "function") {
            result = await funcRef.apply(undefined, [args], { arguments: { copy: true }, result: { promise: true, copy: true } });
        }
        else {
            throw new Error(
                `function "${functionName}" not found in Module: ${moduleName}`
            );
        }
    }
    else {
        throw new Error(
            `Module: ${moduleName} does not export a function or object`
        );
    }

    // Check frame size before returning
    const frameToReturn = context.global.getSync("frame", { copy: true }) || {};
    const frameSize = getObjectSize(frameToReturn);

    if (frameSize > FRAME_SIZE_LIMIT) {
        throw new Error(
            `frame object exceeds size limit(${frameSize} > ${FRAME_SIZE_LIMIT} bytes)`
        );
    }

    return { result, frame: JSON.parse(JSON.stringify(frameToReturn)) };
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