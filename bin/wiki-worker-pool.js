const { Worker } = require("worker_threads");
const path = require("path");

class WikiWorkerPool {
    constructor(size = 4, workerPath = null) {
        this.size = size;
        this.workerPath = workerPath || path.join(__dirname, "wiki-module-worker.js");

        this.workers = [];
        this.queue = [];

        this._initWorkers();
    }

    _initWorkers() {
        for (let i = 0; i < this.size; i++) {
            this._createWorker();
        }
    }

    _createWorker() {
        const worker = new Worker(this.workerPath);

        worker.busy = false;

        worker.on("message", msg => {
            worker.busy = false;

            if (worker._resolve) {
                worker._resolve({
                    result: msg?.result,
                    frame: msg?.frame
                });

                worker._resolve = null;
            }

            this._next();
        });

        worker.on("error", err => {
            console.error("[LGWS WorkerPool] Worker error:", err);
            worker.busy = false;
        });

        this.workers.push(worker);
    }

    _next() {
        if (!this.queue.length) return;

        const worker = this.workers.find(w => !w.busy);
        if (!worker) return;

        const task = this.queue.shift();

        worker.busy = true;
        worker._resolve = task.resolve;

        worker.postMessage(task.payload);
    }

    execute(payload) {
        return new Promise(resolve => {
            this.queue.push({ payload, resolve });
            this._next();
        });
    }
}

module.exports = WikiWorkerPool;