const mongoose = require("mongoose");
const sanitize = require("isomorphic-dompurify").sanitize;
const utils = require("../bin/utils");
const { renderWikiText } = require("../bin/wiki-renderer");
const pageCache = require("../bin/page-cache");
const renderQueue = require("../bin/render-queue");
const fileStorage = require("../bin/wiki-file-storage");

// Schema for a single revision metadata (content is stored in file storage)
const RevisionSchema = new mongoose.Schema({
    comment: {
        type: String,
        default: ""
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    minor: {
        type: Boolean,
        default: false
    }
});

const WikiPageSchema = new mongoose.Schema({
    wiki: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Wiki',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    namespace: {
        type: String,
        required: true,
        default: "Main",
        enum: utils.getSupportedNamespaces(),
        index: true
    },
    // Full path including parent pages for subpages, e.g. "Parent/Child/Subpage"
    path: {
        type: String,
        required: true,
        trim: true
    },
    // Revision metadata (actual revision text is stored on disk)
    revisions: [RevisionSchema],
    // Metadata
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastModifiedAt: {
        type: Date,
        default: Date.now
    },
    lastModifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // For categorization and organization
    categories: [{
        type: String,
        ref: 'WikiPage',  // References Category: pages
        index: true
    }],
    tags: [{
        type: String,
        index: true
    }],
    // For templates
    templateUsedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WikiPage'
    }],
    // Pages that this page uses as templates
    templatesUsed: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WikiPage'
    }],
    // Page protection level
    protected: {
        type: String,
        enum: ["none", "edit", "move", "full"],
        default: "none"
    },
    isPurging: {
        type: Boolean,
        default: false,
        select: false // optional, hide in queries by default
    },
    purgeLock: {
        by: { type: String, default: null },
        expiresAt: { type: Date, default: null }
    },
    pagesUsingCategory: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WikiPage'
    }],
    noIndex: {
        type: Boolean,
        default: false
    },
    meta: {
        description: {
            type: String,
            default: null,
            trim: true,
            maxlength: 160
        }
    }
});

// Compound index for efficient page lookup
WikiPageSchema.index({ wiki: 1, namespace: 1, path: 1 }, { unique: true });
// Additional indexes for performance
WikiPageSchema.index({ wiki: 1, lastModifiedAt: -1 });
WikiPageSchema.index({ wiki: 1, categories: 1 });
WikiPageSchema.index({ title: "text", "meta.description": "text" });

/* ---------------------------
   Template Extraction (for tracking dependencies)
---------------------------- */
function extractTemplatesFromText(text) {
    const templateRegex = /\{\{([^{}][^{}]*?)\}\}(?!\})/g;
    const templates = new Set();
    let match;
    while ((match = templateRegex.exec(text)) !== null) {
        const name = match[1].split("|")[0].trim().replace(/ /g, "_");
        if (name) templates.add(name);
    }
    return Array.from(templates);
}

// Pre-save hook to update HTML, categories, tags, and timestamps
WikiPageSchema.pre("save", async function (next) {
    if (!this.populated('wiki')) {
        await this.populate('wiki');
    }

    // Normalize path and ensure lastModifiedAt is set
    this.path = this.path.trim().replace(/ /g, "_");
    if (!this.lastModifiedAt) this.lastModifiedAt = new Date();

    // Keep document-sized revisions metadata bounded
    const MAX_REVISIONS = 200;
    if (this.revisions && this.revisions.length > MAX_REVISIONS) {
        this.revisions = this.revisions.slice(-MAX_REVISIONS);
    }

    next();
});

// After save, enqueue background render job if needed
WikiPageSchema.post('save', function (doc) {
    if (doc._needsBackgroundRender) {
        const WikiPage = this.constructor;
        renderQueue.enqueue(async () => {
            try {
                await WikiPage.backgroundRender(doc._id);
            } catch (e) {
                console.error('[BackgroundRender] failed for', doc._id, e);
            }
        });
    }
});

// Virtual for full title (namespace:path)
WikiPageSchema.virtual("fullTitle").get(function () {
    if (this.namespace === "Main") {
        return this.path;
    }
    return `${this.namespace}:${this.path}`;
});

// Instance method to render markdown content to sanitized HTML
WikiPageSchema.methods.renderContent = async function ({ noredirect = false, sourceContent = null, dryRun = false } = {}) {
    if (!this.populated('wiki')) await this.populate('wiki');

    // Determine source content: provided override or stored file
    const currentContent = sourceContent != null ? sourceContent : await fileStorage.readContent(this.wiki._id, this.namespace, this.path);

    // --- Redirect detection ---
    const redirectMatch = (currentContent || "").trim().match(/^#REDIRECT\s*\[\[([^\]]+)\]\]/i);
    if (redirectMatch) {
        this.redirectTarget = redirectMatch[1].trim();

        // ✅ Auto-add Redirect Pages category
        this.categories = this.categories || [];
        if (!this.categories.includes("Redirect_Pages")) {
            this.categories.push("Redirect_Pages");
        }

        if (!noredirect) {
            // Early exit for automatic redirect
            return { html: "", categories: this.categories, tags: [], redirectTarget: this.redirectTarget };
        }
    }

    // Existing content rendering
    const WikiPage = this.constructor;
    const getPage = async (namespace, name) => {
        return await WikiPage.findOne({ wiki: this.wiki._id, namespace, path: name }).lean();
    };

    try {
        // Use cached page index when available to avoid heavy DB scan
        let existingPages = pageCache.get(this.wiki._id);
        if (!existingPages) {
            const allPages = await WikiPage.find({ wiki: this.wiki._id })
                .select("namespace path")
                .lean();

            existingPages = new Set(allPages.map(p => p.namespace === "Main" ? p.path : `${p.namespace}:${p.path}`));
            pageCache.set(this.wiki._id, existingPages);
        }

        // --- Render LGWL content ---
        const { html, categories, tags, noIndex, description } = await renderWikiText(currentContent, {
            wikiName: this.wiki.name,
            pageName: this.path,
            currentNamespace: this.namespace,
            WikiPage,
            getPage,
            currentPageId: this._id,
            existingPages
        });

        this.noIndex = noIndex;
        // Persist rendered HTML to file storage
        if (!dryRun) {
            try { await fileStorage.writeHtml(this.wiki._id, this.namespace, this.path, html); } catch (e) { }
        }
        this.html = html; // in-memory for immediate response
        this.categories = categories;
        this.tags = tags;
        this.meta.description = description || null;

        // If there's any missing page links, ensure it's categorised
        if (/\bwiki-missing\b/.test(html) && !this.categories.includes("Pages_with_broken_links")) {
            this.categories.push("Pages_With_Broken_Links");
        }

        // If there's any module error messages, ensure it's categorised
        if (/\blgml-error\b/.test(html) && !this.categories.includes("Pages_with_Module_errors")) {
            this.categories.push("Pages_with_Module_errors");
        }

        // If it's a redirect, ensure it stays categorized
        if (redirectMatch && !this.categories.includes("Redirect_Pages")) {
            this.categories.push("Redirect_Pages");
        }
    } catch (e) {
        this.html = sanitize(currentContent || "");
        this.categories = [];
        this.tags = [];
    }

    this.lastModifiedAt = new Date();

    if (this.namespace === "Template") {
        setImmediate(async () => { await this.purgeCache(); });
    }

    return { html: this.html, categories: this.categories, tags: this.tags, redirectTarget: this.redirectTarget, description: this.meta.description };
};

// Instance method to add a new revision (stores text on disk; keeps metadata in DB)
WikiPageSchema.methods.addRevision = async function (content, author, comment = "", minor = false) {
    // Read existing revisions from file storage
    const stored = await fileStorage.readRevisions(this.wiki._id, this.namespace, this.path);

    // On first-time, ensure an initial metadata entry exists matching DB state
    if (!Array.isArray(stored) || stored.length === 0) {
        const initial = {
            content: content || "",
            author: author || this.lastModifiedBy,
            comment: comment || "Initial revision",
            minor: !!minor,
            timestamp: this.lastModifiedAt || new Date()
        };
        stored.push(initial);
    }

    // Append new revision to storage
    const newRev = { content, author, comment, minor: !!minor, timestamp: new Date() };
    stored.push(newRev);

    // Trim stored revisions to reasonable count
    const MAX_REVISIONS = 200;
    if (stored.length > MAX_REVISIONS) stored.splice(0, stored.length - MAX_REVISIONS);

    // Persist revisions and current content
    await fileStorage.writeRevisions(this.wiki._id, this.namespace, this.path, stored);
    await fileStorage.writeContent(this.wiki._id, this.namespace, this.path, content);

    // Push metadata into DB
    this.revisions.push({ comment, author, minor: !!minor, timestamp: newRev.timestamp });
    if (this.revisions.length > MAX_REVISIONS) this.revisions = this.revisions.slice(-MAX_REVISIONS);

    this.lastModifiedBy = author;
    this.lastModifiedAt = newRev.timestamp;
    this._needsBackgroundRender = true;
    return this;
};

// Recursively purge and re-render a page and its dependents
WikiPageSchema.methods.purgeCache = async function (visited = new Set()) {
    const WikiPage = this.constructor;
    const pageIdStr = this._id.toString();
    // Iterative purge using an explicit queue to avoid deep recursion
    const queue = [this._id.toString()];
    const toVisit = new Set();

    while (queue.length) {
        const id = queue.shift();
        if (toVisit.has(id)) continue;
        toVisit.add(id);

        // Attempt to claim an expiring lock (purgeLock) atomically
        const now = new Date();
        const lock = await WikiPage.findOneAndUpdate(
            { _id: id, $or: [{ 'purgeLock.expiresAt': { $lt: now } }, { 'purgeLock.expiresAt': null }, { purgeLock: { $exists: false } }] },
            { $set: { 'purgeLock.by': process.pid + ':' + Date.now(), 'purgeLock.expiresAt': new Date(Date.now() + 60 * 1000) } },
            { new: true }
        );

        if (!lock) continue; // someone else is purging or lock held

            try {
                const page = await WikiPage.findById(id);
                if (!page) continue;

                // Force re-render and persist with updateOne to avoid triggering hooks
                const { html, categories, tags, description } = await page.renderContent();
                // write HTML to file and update DB metadata
                try { await fileStorage.writeHtml(page.wiki._id, page.namespace, page.path, html); } catch (e) { }
                await WikiPage.updateOne({ _id: id }, { $set: { categories, tags, meta: { description }, lastModifiedAt: new Date() } });

                // Queue dependents
                if (page.templateUsedBy?.length) {
                    for (const depId of page.templateUsedBy) queue.push(String(depId));
                }
            } catch (err) {
                console.error(`[Purge] Error purging id=${id}:`, err);
            } finally {
                // Release lock
                await WikiPage.updateOne({ _id: id }, { $set: { 'purgeLock.by': null, 'purgeLock.expiresAt': null } }).catch(() => { });
            }
    }

    return { success: true };
};

WikiPageSchema.statics.purgeByTitle = async function (wikiId, namespace, path) {
    const page = await this.findOne({ wiki: wikiId, namespace, path });
    if (!page) throw new Error(`Page not found: ${namespace}:${path}`);

    await page.purgeCache();
    console.log(`[Purge] Completed for ${namespace}:${path}`);
};

// Static: Purge all pages in the wiki
WikiPageSchema.statics.purgeAll = function (wikiId) {
    this.find({ wiki: wikiId }).then(pages => {
        for (const page of pages) {
            page.purgeCache().catch(() => { });
        }
    });

    console.log(`[Purge] Purge scheduled for wiki ${wikiId}`);
};

// Static method to create a new page
WikiPageSchema.statics.createPage = async function (wiki, title, namespace, path, content, author, comment = "") {
    const page = new this({
        wiki,
        title,
        namespace,
        path,
        createdBy: author,
        lastModifiedBy: author,
        lastModifiedAt: new Date(),
        revisions: [
            {
                author,
                comment: "Initial Commit" + comment,
                timestamp: new Date()
            }
        ]
    });

    // Persist page metadata first
    await page.save();

    // Store content and initial revision contents on disk
    try {
        await fileStorage.writeContent(wiki, namespace, path, content);
        await fileStorage.writeRevisions(wiki, namespace, path, [
            { content, author, comment: "Initial Commit" + comment, timestamp: new Date() }
        ]);
    } catch (e) {
        console.error('[createPage] failed to write files for', wiki, namespace, path, e);
    }

    // Mark for async render
    page._needsBackgroundRender = true;
    await page.save();
    return page;
};

// Static method to find pages by category
WikiPageSchema.statics.findByCategory = async function (wiki, category) {
    return await this.find({ wiki, categories: category });
};

// Static method to list all pages in a namespace
WikiPageSchema.statics.listPages = function (wiki, namespace = "Main", limit = 100, skip = 0) {
    return this.find({ wiki, namespace })
    .select("title path namespace lastModifiedAt lastModifiedBy")
        .sort("path")
        .skip(skip)
        .limit(limit)
        .populate("lastModifiedBy", "name");
};

// Background render helper used by the render queue
WikiPageSchema.statics.backgroundRender = async function (id) {
    const page = await this.findById(id);
    if (!page) return false;

    try {
        const { html, categories, tags, noIndex, description } = await page.renderContent();
        try { await fileStorage.writeHtml(page.wiki._id, page.namespace, page.path, html); } catch (e) { }
        await this.updateOne({ _id: id }, { $set: { categories, tags, noIndex, meta: { description }, lastModifiedAt: new Date() } });
        // invalidate per-wiki page cache so redlink detection stays fresh
        try { pageCache.invalidate(page.wiki._id); } catch (e) { }
        return true;
    } catch (e) {
        console.error('[BackgroundRender] error', e);
        return false;
    }
};

// Export model
module.exports = mongoose.model("WikiPage", WikiPageSchema);

