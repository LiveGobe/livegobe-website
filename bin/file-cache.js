// Simple per-wiki file list cache with TTL
class FileCache {
    constructor() {
        this.map = new Map(); // key: wikiName -> { value: Set, expires: timestamp }
        this.ttlMs = 2 * 60 * 1000; // 2 minutes
    }

    get(wikiName) {
        const rec = this.map.get(String(wikiName));
        if (!rec) return null;
        if (Date.now() > rec.expires) { this.map.delete(String(wikiName)); return null; }
        return rec.value;
    }

    set(wikiName, setValue) {
        this.map.set(String(wikiName), { value: setValue, expires: Date.now() + this.ttlMs });
    }

    invalidate(wikiName) {
        this.map.delete(String(wikiName));
    }
}

module.exports = new FileCache();
