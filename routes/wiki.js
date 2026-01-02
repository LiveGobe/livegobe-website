const express = require("express");
const router = express.Router();
const utils = require("../bin/utils");
const { renderWikiText } = require("../bin/wiki-renderer");

const Wiki = require("../models/wiki");
const WikiPage = require("../models/wikiPage");
const fileStorage = require("../bin/wiki-file-storage");

// Helper: Check if a string is a valid locale code (2 chars, in available locales)
function isLocaleCode(str) {
    if (!str || str.length !== 2) return false;
    const availableLocales = utils.getAvailableLocales();
    return availableLocales.includes(str.toLowerCase());
}

// Helper: Extract locale from page path if last segment is a locale code
function extractLocaleFromPath(path) {
    const parts = path.split('/');
    if (parts.length === 0) return { basePath: path, locale: null };
    const lastPart = parts[parts.length - 1];
    if (isLocaleCode(lastPart)) {
        return {
            basePath: parts.slice(0, -1).join('/'),
            locale: lastPart.toLowerCase()
        };
    }
    return { basePath: path, locale: null };
}

// Helper: Get all available locale variants for a page
async function getPageLocaleVariants(wiki, namespace, basePath) {
    const availableLocales = utils.getAvailableLocales();
    const variants = [];

    // Check base page (no locale suffix)
    const basePage = await WikiPage.findOne({
        wiki: wiki._id,
        namespace,
        path: basePath
    }).lean();
    if (basePage) {
        variants.push({ locale: null, path: basePath, exists: true });
    }

    // Check each locale variant
    for (const locale of availableLocales) {
        const localePath = `${basePath}/${locale}`;
        const locPage = await WikiPage.findOne({
            wiki: wiki._id,
            namespace,
            path: localePath
        }).lean();
        if (locPage) {
            variants.push({ locale, path: localePath, exists: true });
        }
    }

    return variants;
}

// List all wikis
router.get("/", async (req, res) => {
    try {
        const wikis = await Wiki.findAccessible(req.user);
        res.serve("wikis", { wikis });
    } catch (err) {
        console.error("Error loading wikis:", err);
        res.serve("500", { message: err });
    }
});

// Wiki root redirect
router.get("/:wikiName", async (req, res) => {
    const wikiName = req.params.wikiName;
    try {
        const wiki = await Wiki.findOne({ name: wikiName });
        if (!wiki) {
            return res.status(404).serve("404", { message: req.t("page.wiki.not_found") });
        }
        res.redirect(`/wikis/${wikiName}/Main_Page`);
    } catch (err) {
        console.error("Error accessing wiki:", err);
        res.serve("500", { message: err });
    }
});

// Wiki page (Subpages should be properly handled too)
router.get("/:wikiName/:pageTitle*", async (req, res) => {
    // Helper function to check if user can access a specific mode
    function canAccessMode(wiki, user, mode) {
        switch (mode) {
            case "view":
                return wiki.canAccess(user);
            case "edit":
                return wiki.canEdit(user);
            case "delete":
                return wiki.isAdmin(user);
            case "history":
                return wiki.canAccess(user);
            default:
                return false;
        }
    }

    async function handleSpecialPage(req, res, pageTitle) {
        const wikiName = req.params.wikiName;

        try {
            const wiki = await Wiki.findOne({ name: wikiName });
            if (!wiki) return res.status(404).serve("_404", { message: req.t("page.wiki.not_found") });
            if (!wiki.canAccess(req.user)) return res.status(403).serve("_403", { message: req.t("page.wiki.no_permission") });

            const key = pageTitle.toLowerCase();
            let content = "";
            let pageData = { type: key }; // dynamic page type for JSX template

            // --- Handle Common.css / Common.js ---
            if (key === "common.css" || key === "common.js") {
                const specialPage = await WikiPage.findOne({ wiki: wiki._id, namespace: "Special", path: pageTitle }).populate("revisions.author", "name");
                let content = "";
                let revisions = [];
                if (specialPage) {
                    content = await fileStorage.readContent(specialPage.wiki, specialPage.namespace, specialPage.path);
                    revisions = await fileStorage.readRevisions(specialPage.wiki, specialPage.namespace, specialPage.path);
                    // merge author names from DB metadata where possible
                    if (Array.isArray(revisions) && Array.isArray(specialPage.revisions)) {
                        // Attach author names to stored revisions using timestamp match (best-effort)
                        for (let i = 0; i < revisions.length; i++) {
                            if (specialPage.revisions[i] && specialPage.revisions[i].author) {
                                revisions[i].author = specialPage.revisions[i].author;
                            }
                        }
                    }
                }

                const safePage = {
                    exists: !!specialPage,
                    path: pageTitle,
                    title: pageTitle,
                    content: content || "",
                    revisions: (revisions || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
                    html: "", // nothing to parse as HTML,
                    lastModifiedAt: specialPage?.lastModifiedAt || null,
                    lastModifiedBy: specialPage?.lastModifiedBy?.name || null,
                    commonCss: key === "common.css" ? (content || "") : "",
                    commonJs: key === "common.js" ? (content || "") : ""
                };

                return res.serve("wiki-page", {
                    wiki,
                    page: safePage,
                    pageTitle,           // requested title
                    namespace: "Special",
                    mode: req.query.mode || "view",
                    canEdit: wiki.isAdmin(req.user),
                    canDelete: wiki.isAdmin(req.user),
                    t: req.t,
                    query: req.query,
                    language: req.language
                });
            }

            // --- Other special pages ---
            switch (key) {
                case "allpages": {
                    const namespace = req.query.namespace || "Main";
                    const pageNum = parseInt(req.query.page) || 1;
                    const limit = 50;

                    // Get pages normally
                    const pages = await WikiPage.listPages(
                        wiki._id,
                        namespace,
                        limit,
                        (pageNum - 1) * limit
                    );

                    // Filter out redirect pages (#REDIRECT [[...]]) by reading stored content
                    const fileStorage = require("../bin/wiki-file-storage");
                    const nonRedirectPages = [];
                    for (const p of pages) {
                        const content = await fileStorage.readContent(p.wiki, p.namespace, p.path);
                        if (!/^#redirect\s+\[\[.+?\]\]/i.test(content || "")) nonRedirectPages.push(p);
                    }

                    // Count total non-redirect pages (for pagination) — this reads all page contents in the namespace
                    const allPages = await WikiPage.find({ wiki: wiki._id, namespace }).lean();
                    let totalNonRedirect = 0;
                    for (const p of allPages) {
                        const content = await fileStorage.readContent(p.wiki, p.namespace, p.path);
                        if (!/^#redirect\s+\[\[.+?\]\]/i.test(content || "")) totalNonRedirect++;
                    }
                    const total = allPages.length;

                    return res.serve("wiki-page", {
                        wiki,
                        page: { title: pageTitle, content: "", exists: true },
                        pageData: {
                            type: "AllPages",
                            pages: nonRedirectPages,
                            pagination: { current: pageNum, total: Math.ceil(totalNonRedirect / limit) }
                        },
                        namespace: "Special",
                        pageTitle,
                        mode: "view",
                        query: req.query,
                        canEdit: wiki.canEdit(req.user),
                        canDelete: wiki.isAdmin(req.user),
                        t: req.t
                    });
                }

                case "recentchanges": {
                    const days = parseInt(req.query.days) || 7;
                    const pageNum = parseInt(req.query.page) || 1;
                    const limit = 50;
                    const since = new Date();
                    since.setDate(since.getDate() - days);

                    const changes = await WikiPage.find({ wiki: wiki._id, lastModifiedAt: { $gte: since } })
                        .sort({ lastModifiedAt: -1 })
                        .skip((pageNum - 1) * limit)
                        .limit(limit)
                        .populate("lastModifiedBy", "name");

                    const total = await WikiPage.countDocuments({ wiki: wiki._id, lastModifiedAt: { $gte: since } });

                    return res.serve("wiki-page", {
                        wiki,
                        page: { title: pageTitle, content: "", exists: true },
                        pageData: {
                            type: "RecentChanges",
                            changes,
                            days,
                            pagination: { current: pageNum, total: Math.ceil(total / limit) }
                        },
                        namespace: "Special",
                        pageTitle,
                        mode: "view",
                        query: req.query,
                        canEdit: wiki.canEdit(req.user),
                        canDelete: wiki.isAdmin(req.user),
                        t: req.t
                    });
                }
                case "permissions":
                case "settings": {
                    if (!wiki.isAdmin(req.user)) return res.status(403).serve("_403", { message: req.t("page.wiki.no_permission") });
                    break;
                }

                default:
                    pageData.message = req.t("page.wiki.special_not_found", { page: pageTitle });
                    pageData.type = "unknown";
            }

            // --- Render generic special page placeholder ---
            return res.serve("wiki-page", {
                wiki,
                page: { title: pageTitle, content, special: true, exists: true },
                pageData,
                namespace: "Special",
                pageTitle,
                mode: "view",
                query: req.query,
                canEdit: wiki.canEdit(req.user),
                canDelete: wiki.isAdmin(req.user),
            });

        } catch (err) {
            console.error("Error handling special page:", err);
            res.serve("500", { message: err });
        }
    }

    async function getWikiPage(wiki, namespace, fullPath, oldid, noredirect = false) {
        const page = await WikiPage.findOne({
            wiki: wiki._id,
            namespace,
            path: fullPath
        })
            .populate("lastModifiedBy", "name")
            .populate("revisions.author", "name")
            .lean();

        const commonCssPage = await WikiPage.findOne({ wiki: wiki._id, namespace: "Special", path: "Common.css" }).lean();
        const commonJsPage = await WikiPage.findOne({ wiki: wiki._id, namespace: "Special", path: "Common.js" }).lean();

        const commonCss = commonCssPage ? await fileStorage.readContent(commonCssPage.wiki, commonCssPage.namespace, commonCssPage.path) : "";
        const commonJs = commonJsPage ? await fileStorage.readContent(commonJsPage.wiki, commonJsPage.namespace, commonJsPage.path) : "";

        if (!page) {
            // --- Special: List all pages in this category ---
            let pagesInCategory;
            if (namespace === "Category") {
                pagesInCategory = await WikiPage.findByCategory(wiki._id, fullPath); // <--- use your static
            }

            return {
                title: fullPath.replace(/_/g, " "),
                namespace,
                path: fullPath,
                protected: "none",
                exists: false,
                content: "",
                revisions: [],
                lastModifiedAt: null,
                lastModifiedBy: null,
                commonCss,
                commonJs,
                pageData: {
                    type: "Category",
                    category: fullPath,
                    pages: pagesInCategory
                }
            };
        }

        // Load stored content/html/revisions from disk and merge into page
        if (page) {
            const storedContent = await fileStorage.readContent(page.wiki, page.namespace, page.path);
            const storedHtml = await fileStorage.readHtml(page.wiki, page.namespace, page.path);
            const storedRevs = await fileStorage.readRevisions(page.wiki, page.namespace, page.path);
            page.content = storedContent || page.content || "";
            page.html = storedHtml || page.html || "";
            // Merge stored revision content into metadata revisions for display
            if (Array.isArray(storedRevs) && Array.isArray(page.revisions)) {
                for (let i = 0; i < page.revisions.length; i++) {
                    page.revisions[i].content = storedRevs[i] ? storedRevs[i].content : "";
                }
            } else if (Array.isArray(storedRevs)) {
                page.revisions = storedRevs.map(r => r);
            }

            // --- Handle old revision if specified ---
            if (oldid) {
                const revision = page.revisions.find(rev => String(rev._id || rev.timestamp) === String(oldid));
                if (revision) {
                    page.content = revision.content || page.content;
                    page.html = `<pre class="wiki-source"><code>${escapeHtml(revision.content || page.content)}</code></pre>`;
                    page.categories = [];
                    page.tags = [];
                    page.lastModifiedAt = revision.timestamp;
                    page.lastModifiedBy = revision.author;
                    page.isOldRevision = true;
                    page.commonCss = commonCss;
                    page.commonJs = commonJs;
                    page.noIndex = true;
                }
            }
        }

        // --- Redirect handling (skip for Module:) ---
        if (namespace !== "Module") {
            const redirectMatch = page.content.trim().match(/^#REDIRECT\s*\[\[([^\]]+)\]\]/i);
            if (redirectMatch) {
                page.redirectTarget = redirectMatch[1].trim();
                if (!noredirect && !oldid) {
                    return { ...page, autoRedirect: true };
                }
            }
        }

        // --- Simple HTML escaper for safe <pre><code> display ---
        function escapeHtml(str = "") {
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        // --- Module namespace handling ---
        if (namespace === "Module") {
            const isDocSubpage = fullPath.endsWith("/doc");

            if (!isDocSubpage) {
                // Try loading the module’s documentation subpage (Module:Something/doc)
                const docPath = `${fullPath}/doc`;
                const docPage = await WikiPage.findOne({
                    wiki: wiki._id,
                    namespace: "Module",
                    path: docPath
                }).lean();

                if (docPage) {
                    const docHtml = await fileStorage.readHtml(docPage.wiki, docPage.namespace, docPage.path);
                    if (docHtml) {
                        page.docHtml = docHtml;
                    } else {
                        const docContent = await fileStorage.readContent(docPage.wiki, docPage.namespace, docPage.path);
                        if (docContent) {
                            const renderedDoc = await renderWikiText(docContent, {
                                wikiName: wiki.name,
                                pageName: docPage.path,
                                currentNamespace: "Module",
                                WikiPage,
                                currentPageId: docPage._id,
                                getPage: async (ns, name) =>
                                    WikiPage.findOne({ wiki: wiki._id, namespace: ns, path: name }),
                                existingPages: new Set((await WikiPage.find({ wiki: wiki._id }).select("namespace path").lean()).map(p => p.namespace === "Main" ? p.path : `${p.namespace}:${p.path}`))
                            });
                            page.docHtml = renderedDoc.html;
                        }
                    }
                }
            }

            // Show the raw Lua code
            page.html = `<pre class="module-source"><code>${escapeHtml(page.content)}</code></pre>`;
            page.categories = [];
            page.tags = [];
            page.commonCss = commonCss;
            page.commonJs = commonJs;
        } else if (!oldid) {
            // --- Normal wiki page rendering ---
            if (!page.html && !req.query.noredirect) {
                // Render and save if no cached HTML
                // Build an existingPages set so links like "Main_Page" are detected
                const existingRows = await WikiPage.find({ wiki: wiki._id }).select("namespace path").lean();
                const existingPages = new Set(existingRows.map(p => p.namespace === "Main" ? p.path : `${p.namespace}:${p.path}`));

                const rendered = await renderWikiText(page.content, {
                    wikiName: wiki.name,
                    pageName: page.path,
                    currentNamespace: page.namespace,
                    WikiPage,
                    currentPageId: page._id,
                    getPage: async (ns, name) => {
                        return WikiPage.findOne({
                            wiki: page.wiki._id,
                            namespace: ns,
                            path: name
                        });
                    },
                    existingPages
                });

                page.html = rendered.html;
                page.categories = rendered.categories;
                page.tags = rendered.tags;
                page.noIndex = rendered.noIndex;
                // Persist rendered HTML and metadata
                try { await fileStorage.writeHtml(page.wiki, page.namespace, page.path, rendered.html); } catch (e) { }
                await WikiPage.updateOne({ _id: page._id }, { $set: { categories: rendered.categories, tags: rendered.tags, noIndex: rendered.noIndex, lastModifiedAt: new Date() } });
            }

            // Attach common assets
            page.commonCss = commonCss;
            page.commonJs = commonJs;
        }

        // --- Special: List all pages in this category ---
        if (namespace === "Category") {
            const pagesInCategory = await WikiPage.findByCategory(wiki._id, fullPath);
            page.pageData = {
                type: "Category",
                category: fullPath,
                pages: pagesInCategory
            };
        }

        page.exists = true;
        return page;
    }

    const wikiName = req.params.wikiName;
    let pageTitle = req.params.pageTitle || "Main_Page";
    const mode = req.query.mode || "view";

    // Set caching headers for anonymous GET view requests
    if (req.method === "GET" && mode === "view" && !req.user) {
        res.set("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=59");
    }

    const subPath = req.params[0] || ""; // Captures everything after pageTitle

    // Parse namespace and actual title
    let namespace = "Main";
    if (pageTitle.includes(":")) {
        [namespace, pageTitle] = pageTitle.split(":", 2);
        // Handle special cases for namespace
        if (!utils.getSupportedNamespaces().includes(namespace)) {
            // If namespace is not recognized, treat the whole thing as title in Main namespace
            pageTitle = `${namespace}:${pageTitle}`;
            namespace = "Main";
        }
    }

    // Handle special pages differently
    if (namespace === "Special") {
        return handleSpecialPage(req, res, pageTitle);
    }

    // Build full page path including subpages
    const fullPagePath = subPath ? `${pageTitle}${subPath}` : pageTitle;

    try {
        const wiki = await Wiki.findOne({ name: wikiName });
        if (!wiki) {
            return res.status(404).serve("_404", { message: req.t("page.wiki.not_found") });
        }

        // Check if user has access to this mode
        if (!canAccessMode(wiki, req.user, mode)) {
            return res.status(403).serve("_403", { message: req.t("page.wiki.no_permission") });
        }

        // --- Locale detection and fallback ---
        const { basePath, locale } = extractLocaleFromPath(fullPagePath);
        let pagePathToLoad = fullPagePath;
        let requestedLocale = locale;

        // Get page content including redirect detection
        let page = await getWikiPage(wiki, namespace, pagePathToLoad, req.query.oldid, !!req.query.noredirect);

        // --- Handle redirects in view mode only ---
        if (mode === "view" && page.redirectTarget && !page.isOldRevision) {
            if (!req.query.noredirect) {
                // Pass the original page in the query so the target page can show "Redirected from"
                // Normalize target and preserve namespace
                let target = page.redirectTarget.trim().replace(/ /g, "_");

                // If target lacks an explicit namespace (no ':'), keep the same as current page
                if (!target.includes(":") && page.namespace !== "Main") {
                    target = `${page.namespace}:${target}`;
                }

                // Construct redirect URL with full "from" (namespace:path)
                const fromFull = page.namespace === "Main"
                    ? page.path
                    : `${page.namespace}:${page.path}`;

                return res.redirect(
                    301,
                    `/wikis/${wiki.name}/${target.trim().replace(/ /g, "_").replace(/[?#]/g, encodeURIComponent)}?from=${fromFull.trim().replace(/ /g, "_").replace(/[?#]/g, encodeURIComponent)}`
                );
            }
        }

        // Sort revisions descending
        if (page.revisions && Array.isArray(page.revisions)) {
            page.revisions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        // Render page normally, show redirect notice if noredirect
        // If stored HTML is unexpectedly empty but we have source content,
        // render synchronously as a fallback so the user sees the page immediately.
        try {
            if ((!page.html || String(page.html).trim() === "") && page.content) {
                console.warn(`[wiki] Empty stored HTML for ${wiki.name}/${fullPagePath} — rendering fallback`);
                // Build existingPages set for proper link detection
                const existingRows = await WikiPage.find({ wiki: wiki._id }).select("namespace path").lean();
                const existingPages = new Set(existingRows.map(p => p.namespace === "Main" ? p.path : `${p.namespace}:${p.path}`));

                const rendered = await renderWikiText(page.content, {
                    wikiName: wiki.name,
                    pageName: page.path,
                    currentNamespace: page.namespace,
                    WikiPage,
                    currentPageId: page._id,
                    getPage: async (ns, name) => {
                        return WikiPage.findOne({
                            wiki: page.wiki._id,
                            namespace: ns,
                            path: name
                        });
                    },
                    existingPages
                });
                page.html = rendered.html;
                page.categories = rendered.categories;
                page.tags = rendered.tags;
            }
        } catch (rfErr) {
            console.error("Fallback render failed:", rfErr);
        }

        // --- Compute categoriesWithExists (after fallback rendering has populated categories) ---
        if (Array.isArray(page.categories) && page.categories.length > 0) {
            // Normalize category names for DB lookup (replace spaces with underscores)
            const categoryPaths = page.categories.map(name => name.replace(/ /g, "_"));

            // Find all category pages that exist in the DB
            const existingCategoryPages = await WikiPage.find({
                wiki: wiki._id,
                namespace: "Category",
                path: { $in: categoryPaths }
            }).select("path").lean();

            // Create a set of existing paths for fast lookup
            const existingSet = new Set(existingCategoryPages.map(p => p.path));

            // Map original categories to objects with existence and URL-safe path
            page.categoriesWithExists = page.categories.map(name => {
                const path = name.replace(/ /g, "_");
                return {
                    name,       // original display name
                    path,       // URL-safe path
                    exists: existingSet.has(path)
                };
            });
        } else {
            page.categoriesWithExists = [];
        }

        // --- Get available locale variants for language selector ---
        const localeVariants = await getPageLocaleVariants(wiki, namespace, basePath || pagePathToLoad);

        res.serve("wiki-page", {
            wiki,
            page,
            namespace,
            pageTitle: fullPagePath,
            mode,
            query: req.query,
            canEdit: canAccessMode(wiki, req.user, "edit"),
            canDelete: canAccessMode(wiki, req.user, "delete"),
            currentLocale: requestedLocale,
            localeVariants
        });
    } catch (err) {
        console.error("Error loading wiki page:", err);
        res.serve("500", { message: err });
    }
});

module.exports = router;