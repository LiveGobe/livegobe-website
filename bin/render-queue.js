const os = require('os');

class RenderQueue {
    constructor(concurrency = Math.max(1, Math.floor(os.cpus().length / 2))) {
        this.queue = [];
        this.running = 0;
        this.concurrency = concurrency;
        // Track task IDs currently sitting in the queue to prevent duplicate queuing
        this.queuedIds = new Set(); 
    }

    enqueue(id, task) {
        // SCENARIO C: Complete deduplication safeguard
        if (this.queuedIds.has(id)) return; 
        
        this.queuedIds.add(id);
        this.queue.push({ id, method: task });
        this._maybeRun();
    }

    _maybeRun() {
        while (this.running < this.concurrency && this.queue.length) {
            const taskObj = this.queue.shift();
            this.running++;
            
            Promise.resolve()
                .then(() => taskObj.method())
                .catch(err => console.error('[RenderQueue] task error:', err))
                .finally(() => {
                    this.running--;
                    this.queuedIds.delete(taskObj.id); // Clear out tracking on completion
                    setImmediate(() => this._maybeRun());
                });
        }
    }
}

module.exports = new RenderQueue();
