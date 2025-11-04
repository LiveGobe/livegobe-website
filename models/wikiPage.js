const mongoose = require("mongoose");
const sanitize = require("isomorphic-dompurify").sanitize;
const utils = require("../bin/utils");
const { renderWikiText } = require("../bin/wiki-renderer");

// Schema for a single revision of a page
const RevisionSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true
    },
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
    // Current content
    content: {
        type: String,
        required: true,
        default: ""
    },
    // Rendered HTML (generated from content)
    html: {
        type: String
    },
    // Revision history
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
    pagesUsingCategory: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WikiPage'
    }]
});

// Compound index for efficient page lookup
WikiPageSchema.index({ wiki: 1, namespace: 1, path: 1 }, { unique: true });

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

// Pre-save hook to update HTML and timestamps
// Pre-save hook to update HTML, categories, tags, and timestamps
WikiPageSchema.pre("save", async function(next) {
  if (!this.populated('wiki')) {
    await this.populate('wiki');
  }

  const WikiPage = this.constructor;

  // Only update templatesUsed, categories, tags if content changed
  if (this.isModified("content") || this.isModified("categories") || this.isModified("tags")) {
    // 1. Scan content for template names
    const templateNames = extractTemplatesFromText(this.content);

    // 2. Fetch template pages by name
    const templates = await WikiPage.find({
      wiki: this.wiki._id,
      namespace: "Template",
      path: { $in: templateNames }
    });

    // 3. Update this.templatesUsed
    this.templatesUsed = templates.map(t => t._id);

    // 4. Update templateUsedBy on each template page
    for (const tpl of templates) {
      await WikiPage.updateOne(
        { _id: tpl._id },
        { $addToSet: { templateUsedBy: this._id } }
      );
    }
    
    // 6. Store rendered HTML, categories, and tags
    const { html, categories, tags } = await this.renderContent();
    this.html = html;
    this.categories = categories;
    this.tags = tags;

    // 7. Update last modified timestamp and normalize path
    this.lastModifiedAt = new Date();
    this.path = this.path.trim().replace(/ /g, "_");
  }

  next();
});


// Virtual for full title (namespace:path)
WikiPageSchema.virtual("fullTitle").get(function() {
    if (this.namespace === "Main") {
        return this.path;
    }
    return `${this.namespace}:${this.path}`;
});

// Instance method to render markdown content to sanitized HTML
WikiPageSchema.methods.renderContent = async function({ noredirect = false } = {}) {
    if (!this.populated('wiki')) await this.populate('wiki');

    // --- Redirect detection ---
    const redirectMatch = this.content.trim().match(/^#REDIRECT\s*\[\[([^\]]+)\]\]/i);
    if (redirectMatch) {
        this.redirectTarget = redirectMatch[1].trim();
        if (!noredirect) {
            // Early exit for automatic redirect
            return { html: "", categories: [], tags: [], redirectTarget: this.redirectTarget };
        }
        // else: show the redirect page with notice
    }

    // Existing content rendering
    const WikiPage = this.constructor;
    const getPage = async (namespace, name) => {
        return await WikiPage.findOne({ wiki: this.wiki._id, namespace, path: name }).lean();
    };

    try {
        const { html, categories, tags } = await renderWikiText(this.content, {
            wikiName: this.wiki.name,
            pageName: this.path,
            currentNamespace: this.namespace,
            WikiPage,
            getPage,
            currentPageId: this._id
        });

        this.html = html;
        this.categories = categories;
        this.tags = tags;
    } catch (e) {
        console.error("Error parsing LGWL in renderContent:", e);
        this.html = sanitize(this.content);
        this.categories = [];
        this.tags = [];
    }

    this.lastModifiedAt = new Date();

    if (this.namespace === "Template") {
        setImmediate(async () => { await this.purgeCache(); });
    }

    return { html: this.html, categories: this.categories, tags: this.tags, redirectTarget: this.redirectTarget };
};

// Instance method to add a new revision
WikiPageSchema.methods.addRevision = function(content, author, comment = "", minor = false) {
    // Add current content as a revision if this is a new page
    if (this.revisions.length === 0) {
        this.revisions.push({
            content: this.content,
            author: this.lastModifiedBy,
            timestamp: this.lastModifiedAt,
            comment: "Initial revision",
            minor
        });
    }

    // Add the new revision
    this.revisions.push({
        content,
        author,
        comment,
        minor,
        timestamp: new Date()
    });

    // Update current content
    this.content = content;
    this.lastModifiedBy = author;
};

// Recursively purge and re-render a page and its dependents
WikiPageSchema.methods.purgeCache = async function(visited = new Set()) {
    const WikiPage = this.constructor;
    const pageIdStr = this._id.toString();

    // Avoid infinite loops
    if (visited.has(pageIdStr)) return;
    visited.add(pageIdStr);

    // --- Attempt to claim lock ---
    const locked = await WikiPage.findOneAndUpdate(
        { _id: this._id, isPurging: { $ne: true } },
        { $set: { isPurging: true } },
        { new: true }
    );

    if (!locked) {
        // Another process is purging this page; skip it
        console.log(`[Purge] Skipping ${this.fullTitle} (already purging)`); 
        return;
    }

    try {
        console.log(`[Purge] Re-rendering ${this.fullTitle}`);

        // Force re-render of this page
        await this.renderContent();
        await this.save();

        // Recursively purge dependents
        if (this.templateUsedBy?.length) {
            const dependents = await WikiPage.find({
                _id: { $in: this.templateUsedBy }
            });

            for (const dep of dependents) {
                await dep.purgeCache(visited);
            }
        }
    } catch (err) {
        console.error(`[Purge] Error purging ${this.fullTitle}:`, err);
    } finally {
        // Release lock
        await WikiPage.updateOne(
            { _id: this._id },
            { $set: { isPurging: false } }
        ).catch(() => {});
    }

    return { success: true };
};

WikiPageSchema.statics.purgeByTitle = async function(wikiId, namespace, path) {
    const page = await this.findOne({ wiki: wikiId, namespace, path });
    if (!page) throw new Error(`Page not found: ${namespace}:${path}`);

    await page.purgeCache();
    console.log(`[Purge] Completed for ${namespace}:${path}`);
};

// Static: Purge all pages in the wiki
WikiPageSchema.statics.purgeAll = async function(wikiId) {
    const pages = await this.find({ wiki: wikiId });
    for (const page of pages) {
        await page.purgeCache();
    }
    console.log(`[Purge] All pages in wiki ${wikiId} re-rendered.`);
};

// Static method to create a new page
WikiPageSchema.statics.createPage = async function(wiki, title, namespace, path, content, author, comment = "") {
    const page = new this({
        wiki,
        title,
        namespace,
        path,
        content,
        createdBy: author,
        lastModifiedBy: author,
        revisions: [
            {
                content,
                author,
                comment: "Initial Commit" + comment,
                timestamp: new Date()
            }
        ]
    });

    // ✅ Only save once — this creates the page and initial revision
    await page.save();
    return page;
};

// Static method to find pages by category
WikiPageSchema.statics.findByCategory = function(wiki, category) {
    return this.find({ wiki, categories: category });
};

// Static method to list all pages in a namespace
WikiPageSchema.statics.listPages = function(wiki, namespace = "Main", limit = 100, skip = 0) {
    return this.find({ wiki, namespace })
        .select("title path namespace lastModifiedAt lastModifiedBy")
        .sort("path")
        .skip(skip)
        .limit(limit)
        .populate("lastModifiedBy", "name");
};

// Export model
module.exports = mongoose.model("WikiPage", WikiPageSchema);
