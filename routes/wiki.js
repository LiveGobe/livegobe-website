const express = require("express");
const router = express.Router();
const utils = require("../bin/utils");
const { renderWikiText } = require("../bin/wiki-renderer");

const Wiki = require("../models/wiki");
const WikiPage = require("../models/wikiPage");

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

    // Handle special pages (e.g., Special:AllPages, Special:RecentChanges)
    async function handleSpecialPage(req, res, pageTitle) {
        const wikiName = req.params.wikiName;

        try {
            // First find the wiki since special pages operate within a wiki's context
            const wiki = await Wiki.findOne({ name: wikiName });
            if (!wiki) {
                return res.status(404).serve("_404", { message: req.t("page.wiki.not_found") });
            }

            // Check basic access permission for the wiki
            if (!wiki.canAccess(req.user)) {
                return res.status(403).serve("_403", { message: req.t("page.wiki.no_permission") });
            }

            switch (pageTitle.toLowerCase()) {
                case "allpages": {
                    const namespace = req.query.namespace || "Main";
                    const page = parseInt(req.query.page) || 1;
                    const limit = 50;
                    
                    const pages = await WikiPage.listPages(
                        wiki._id,
                        namespace,
                        limit,
                        (page - 1) * limit
                    );
                    
                    // Get total count for pagination
                    const totalPages = await WikiPage.countDocuments({
                        wiki: wiki._id,
                        namespace
                    });

                    return res.serve("wiki-special-allpages", {
                        wiki,
                        namespace,
                        pages,
                        pagination: {
                            current: page,
                            total: Math.ceil(totalPages / limit)
                        },
                        canEdit: wiki.canEdit(req.user)
                    });
                }
                case "recentchanges": {
                    const days = parseInt(req.query.days) || 7;
                    const page = parseInt(req.query.page) || 1;
                    const limit = 50;
                    
                    // Get pages modified within the last X days
                    const since = new Date();
                    since.setDate(since.getDate() - days);
                    
                    const changes = await WikiPage.find({
                        wiki: wiki._id,
                        lastModifiedAt: { $gte: since }
                    })
                    .sort({ lastModifiedAt: -1 })
                    .skip((page - 1) * limit)
                    .limit(limit)
                    .populate("lastModifiedBy", "username");
                    
                    // Get total count for pagination
                    const totalChanges = await WikiPage.countDocuments({
                        wiki: wiki._id,
                        lastModifiedAt: { $gte: since }
                    });

                    return res.serve("wiki-special-recentchanges", {
                        wiki,
                        days,
                        changes,
                        pagination: {
                            current: page,
                            total: Math.ceil(totalChanges / limit)
                        },
                        canEdit: wiki.canEdit(req.user)
                    });
                }
                case "permissions": {
                    // Show/edit wiki permissions - admin only
                    if (!wiki.isAdmin(req.user)) {
                        return res.status(403).serve("_403", { message: req.t("page.wiki.no_permission") });
                    }
                    return res.serve("wiki-special-permissions", { wiki });
                }
                case "settings": {
                    // Wiki settings - admin only
                    if (!wiki.isAdmin(req.user)) {
                        return res.status(403).serve("_403", { message: req.t("page.wiki.no_permission") });
                    }
                    return res.serve("wiki-special-settings", { wiki });
                }
                default:
                    return res.status(404).serve("_404", { 
                        message: req.t("page.wiki.special_not_found", { page: pageTitle }) 
                    });
            }
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

        if (!page) {
            return {
                title: fullPath.replace(/_/g, " "),
                namespace,
                path: fullPath,
                protected: "none",
                exists: false,
                content: "",
                revisions: [],
                lastModifiedAt: null,
                lastModifiedBy: null
            };
        }

        // --- Handle old revision if specified ---
        if (oldid) {
            const revision = page.revisions.find(rev => rev._id.toString() === oldid);
            if (revision) {
                page.content = revision.content;

                const rendered = await renderWikiText(revision.content, {
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
                    }
                });

                page.html = rendered.html;
                page.categories = rendered.categories;
                page.tags = rendered.tags;
                page.lastModifiedAt = revision.timestamp;
                page.lastModifiedBy = revision.author;
                page.isOldRevision = true;
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
                });

                if (docPage && docPage.content) {
                    const renderedDoc = await renderWikiText(docPage.content, {
                        wikiName: wiki.name,
                        pageName: docPage.path,
                        currentNamespace: "Module",
                        WikiPage,
                        currentPageId: docPage._id,
                        getPage: async (ns, name) =>
                            WikiPage.findOne({ wiki: wiki._id, namespace: ns, path: name })
                    });
                    page.docHtml = renderedDoc.html;
                }
            }

            // Show the raw Lua code
            page.html = `<pre class="module-source"><code>${escapeHtml(page.content)}</code></pre>`;
            page.categories = [];
            page.tags = [];
        } else if (!oldid) {
            // --- Normal wiki page rendering ---
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
                }
            });

            page.html = rendered.html;
            page.categories = rendered.categories;
            page.tags = rendered.tags;
        }

        page.exists = true;
        return page;
    }

    const wikiName = req.params.wikiName;
    let pageTitle = req.params.pageTitle || "Main_Page";
    const mode = req.query.mode || "view";
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

    const isModule = namespace === "Module";
    const isModuleDoc = isModule && pageTitle.endsWith("/doc");

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
        
        // Get page content including redirect detection
        let page = await getWikiPage(wiki, namespace, fullPagePath, req.query.oldid, !!req.query.noredirect);

        // --- Handle redirects in view mode only ---
        if (mode === "view" && page.redirectTarget && !page.isOldRevision) {
            if (!req.query.noredirect) {
                // Pass the original page in the query so the target page can show "Redirected from"
                return res.redirect(`/wikis/${wiki.name}/${page.redirectTarget.replace(/ /g, "_")}?from=${encodeURIComponent(fullPagePath)}`);
            }
        }

        // Sort revisions descending
        if (page.revisions && Array.isArray(page.revisions)) {
            page.revisions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }

        // Render page normally, show redirect notice if noredirect
        res.serve("wiki-page", { 
            wiki,
            page,
            namespace,
            pageTitle: fullPagePath,
            mode,
            query: req.query,
            canEdit: canAccessMode(wiki, req.user, "edit"),
            canDelete: canAccessMode(wiki, req.user, "delete")
        });
    } catch (err) {
        console.error("Error loading wiki page:", err);
        res.serve("500", { message: err });
    }
});

module.exports = router;