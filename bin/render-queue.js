const os = require('os');

class RenderQueue {
    constructor(concurrency = Math.max(1, Math.floor(os.cpus().length / 2))) {
        this.queue = [];
        this.running = 0;
        this.concurrency = concurrency;
    }

    enqueue(task) {
        this.queue.push(task);
        this._maybeRun();
    }

    _maybeRun() {
        while (this.running < this.concurrency && this.queue.length) {
            const task = this.queue.shift();
            this.running++;
            Promise.resolve()
                .then(() => task())
                .catch(err => console.error('[RenderQueue] task error:', err))
                .finally(() => {
                    this.running--;
                    setImmediate(() => this._maybeRun());
                });
        }
    }
}

module.exports = new RenderQueue();
