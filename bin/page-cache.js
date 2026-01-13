// Very small in-memory cache for page keys per wiki with TTL
class PageCache {
    constructor() {
        this.map = new Map(); // key -> { value, expires }
        this.ttlMs = 5 * 60 * 1000; // 5 minutes
    }

    _key(wikiId) { return String(wikiId); }

    get(wikiId) {
        const k = this._key(wikiId);
        const rec = this.map.get(k);
        if (!rec) return null;
        if (Date.now() > rec.expires) { this.map.delete(k); return null; }
        return rec.value;
    }

    set(wikiId, value) {
        const k = this._key(wikiId);
        this.map.set(k, { value, expires: Date.now() + this.ttlMs });
    }

    invalidate(wikiId) {
        this.map.delete(this._key(wikiId));
    }
}

module.exports = new PageCache();
