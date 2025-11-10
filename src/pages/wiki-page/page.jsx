const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");
const utils = require("../../../bin/utils");
const config = require("../../../config");

// Helper to format page title with namespace
function formatPageTitle(namespace, path) {
    return namespace === "Main" ? path : `${namespace}:${path}`;
}

// Renders the edit form
function EditForm({ wiki, page, namespace, path, t }) {
    return (
        <form
            method="POST"
            className="wiki-edit-form"
            action={`/wikis/${wiki.name}/${formatPageTitle(namespace, path)}`}
        >
            <div className="edit-area">
                <textarea
                    id="wiki-editor"
                    name="content"
                    className="wiki-editor"
                    defaultValue={page?.content || ""}
                    rows="20"
                />
            </div>
            <div className="edit-options">
                <div className="edit-summary">
                    <label>
                        {t("wiki.edit.summary")}:
                        <input type="text" name="summary" maxLength="200" />
                    </label>
                    <label className="minor-edit">
                        <input type="checkbox" name="minor" />
                        {t("wiki.edit.minor")}
                    </label>
                </div>
                <div className="edit-buttons">
                    <button type="submit" className="primary">
                        {page?.exists ? t("wiki.edit.save") : t("wiki.edit.create")}
                    </button>
                    <a
                        href={`/wikis/${wiki.name}/${formatPageTitle(namespace, path)}`}
                        className="button"
                    >
                        {t("wiki.edit.cancel")}
                    </a>
                </div>
            </div>
        </form>
    );
}

// Renders revision history
function PageHistory({ wiki, page, namespace, path, t }) {
    return (
        <div className="wiki-history">
            <table className="history-table">
                <thead>
                    <tr>
                        <th>{t("wiki.history.date")}</th>
                        <th>{t("wiki.history.author")}</th>
                        <th>{t("wiki.history.comment")}</th>
                        <th>{t("wiki.history.actions")}</th>
                    </tr>
                </thead>
                <tbody>
                    {page.revisions.map((rev, index) => {
                        const authorName =
                            rev.author?.name || rev.author?.username || t("wiki.history.unknownAuthor");
                        const isMinor = Boolean(rev.minor);

                        return (
                            <tr key={rev._id} className={isMinor ? "minor-edit" : ""}>
                                <td>{new Date(rev.timestamp).toLocaleString()}</td>
                                <td>{authorName}</td>
                                <td>
                                    {isMinor && (
                                        <span className="minor-flag">{t("wiki.history.minor")}</span>
                                    )}{" "}
                                    {rev.comment || t("wiki.history.noComment")}
                                </td>
                                <td>
                                  {index > 0 ? (
                                      <>
                                        <a href={`/wikis/${wiki.name}/${formatPageTitle(namespace, path)}?oldid=${rev._id}`}>
                                            {t("wiki.history.view")}
                                        </a>
                                        {" | "}
                                        <a href={`/wikis/${wiki.name}/${formatPageTitle(namespace, path)}?diff=${rev._id}`}>
                                            {t("wiki.history.diff")}
                                        </a>
                                        {" | "}
                                        <button
                                            type="button"                          // Use button instead of submit
                                            className="revert-button"
                                            data-revision={rev._id}                // revision ID to revert to
                                            data-page={formatPageTitle(namespace, path)}
                                            data-wiki={wiki.name}
                                        >
                                            {t("wiki.history.revert")}
                                        </button>
                                      </>
                                  ) : (
                                      <span className="current-revision">{t("wiki.history.current")}</span>
                                  )}
                              </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

/* ===== RecentChanges component ===== */
function RecentChanges({ wiki, t, changes, type, days = 7, pagination }) {
  const dayOptions = [1, 3, 7, 14, 30]; // adjust options as needed

  return (
    <div className="wiki-recent-changes">
      <div className="recentchanges-days-selector">
        <form method="GET" className="days-form">
          <label>
            {t("wiki.recentChanges.showLast")}:
            <select name="days" defaultValue={days}>
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {d} {t("wiki.recentChanges.days")}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{t("wiki.recentChanges.go")}</button>
        </form>
      </div>

      <ul>
        {changes.map((change, idx) => (
          <li key={idx}>
            <a
              href={`/wikis/${wiki.name}/${
                change.namespace === "Main"
                  ? change.title.replace(/ /g, "_")
                  : `${change.namespace}:${change.title.replace(/ /g, "_")}`
              }`}
            >
              {change.namespace === "Main" ? change.title : `${change.namespace}:${change.title}`}
            </a>{" "}
            - {change.lastModifiedBy?.name || t("wiki.recentChanges.unknown")} (
            {new Date(change.lastModifiedAt).toLocaleString()})
          </li>
        ))}
      </ul>

      {pagination && (
        <div className="wiki-pagination">
          {Array.from({ length: pagination.total }, (_, i) => (
            <a
              key={i}
              href={`?days=${days}&page=${i + 1}`}
              className={pagination.current === i + 1 ? "active" : ""}
            >
              {i + 1}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== AllPages component ===== */
function AllPages({ wiki, t, pages, type, pagination, currentNamespace = "Main" }) {
  const namespaces = utils.getSupportedNamespaces();

  return (
    <div className="wiki-all-pages">
      <div className="allpages-namespace-selector">
        <form method="GET" className="namespace-form">
          <label>
            {t("wiki.allPages.selectNamespace")}:
            <select name="namespace" defaultValue={currentNamespace}>
              {namespaces.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">{t("wiki.allPages.go")}</button>
        </form>
      </div>

      <ul>
        {pages.map((page) => (
          <li key={page.path}>
            <a
              href={`/wikis/${wiki.name}/${
                page.namespace === "Main" ? page.path : `${page.namespace}:${page.path}`
              }`}
            >
              {page.namespace === "Main" ? page.title : `${page.namespace}:${page.title}`}
            </a>
          </li>
        ))}
      </ul>

      {pagination && (
        <div className="wiki-pagination">
          {Array.from({ length: pagination.total }, (_, i) => (
            <a
              key={i}
              href={`?namespace=${currentNamespace}&page=${i + 1}`}
              className={pagination.current === i + 1 ? "active" : ""}
            >
              {i + 1}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== SpecialUpload component ===== */
function SpecialUpload({ wiki, t, user }) {
  return (
    <div className="wiki-special-upload">
      {user ? (
        <form
          method="POST"
          action={`/api/v2/wikis/${wiki.name}/files`}
          encType="multipart/form-data"
          className="upload-form"
        >
          <div className="form-group">
            <label htmlFor="file">{t("wiki.special.upload.chooseFile")}:</label>
            <input type="file" name="file" id="file" required />
          </div>

          <div className="form-group">
            <label htmlFor="summary">{t("wiki.special.upload.summary")}:</label>
            <input type="text" name="summary" id="summary" placeholder={t("wiki.special.upload.optional")} />
          </div>

          <div className="form-group">
            <label>
              <input type="checkbox" name="minor" />
              {t("wiki.special.upload.minorEdit")}
            </label>
          </div>

          <button type="submit">{t("wiki.special.upload.upload")}</button>
        </form>
      ) : (
        <p>{t("wiki.special.upload.loginRequired")}</p>
      )}

      <div className="upload-hint">
        <p>{t("wiki.special.upload.hint")}</p>
        <ul>
          <li>{t("wiki.special.upload.allowedTypes")}</li>
          <li>{t("wiki.special.upload.maxSize")}</li>
        </ul>
      </div>
    </div>
  );
}

module.exports = function WikiPage(props) {
  const { wiki, page = {}, namespace = "Main", mode, canEdit, canDelete, t, query = {}, pageData, user } = props;

  // Provide safe defaults for page to avoid undefined property access
  const safePage = {
    exists: false,
    path: page?.path || props.pageTitle || "Main_Page",
    title: page?.title || props.pageTitle || "Main_Page",
    revisions: [],
    categories: [],
    html: "",
    lastModifiedAt: new Date(),
    lastModifiedBy: {},
    ...page
  };

  const fullTitle = formatPageTitle(namespace, safePage.path || safePage.title || "Main_Page");
  const isModule = namespace === "Module";
  const isDocSubpage = safePage.path.endsWith("/doc");
  const isCommonCss = namespace === "Special" && safePage.path.toLowerCase() === "common.css";
  const isCommonJs  = namespace === "Special" && safePage.path.toLowerCase() === "common.js";
  const isCommonPage = isCommonCss || isCommonJs;

  const isSpecialNamespace = ["Special", "Template", "File"].includes(namespace);
  const isViewingOldRevision = query.oldid || query.diff; // common wiki params

  const doIndex =
    safePage.exists &&
    mode === "view" &&           // only normal viewing mode
    !isViewingOldRevision &&     // skip old/diff pages
    !isModule &&
    !isCommonPage &&
    !isDocSubpage &&
    !isSpecialNamespace;         // skip special namespaces

  return (
    <html lang={props.language}>
      <Head
        title={t("page.wiki.title", { 0: wiki.title, 1: fullTitle })}
        doIndex={doIndex}
      >
        {mode === "edit" && <>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css" />
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/eclipse.min.css" />
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/monokai.min.css" />
          <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js" />
          <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/css/css.min.js" />
          <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/javascript/javascript.min.js" />
          <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/xml/xml.min.js" />
          <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/htmlmixed/htmlmixed.min.js" />
          <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/mode/multiplex.min.js" />
          <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/addon/mode/overlay.min.js" />
        </>}
        <Bundle name="wiki-page.css" />
        <Bundle name="wiki-page.js" />
        <meta name="description" content={`A page on ${wiki.title} Wiki, hosted on ${config.domainName}`} />

        {/* Editable common styles and scripts from wiki pages */}
        {safePage.commonCss && <style dangerouslySetInnerHTML={{ __html: safePage.commonCss }} />}
        {safePage.commonJs && <script dangerouslySetInnerHTML={{ __html: safePage.commonJs }} />}
      </Head>

      <body data-theme={props.theme}>
        <header className="wiki-header">
          <div className="wiki-header-inner">
            <h1 className="wiki-site-title">
              <a href={`/wikis/${wiki.name}`}>{wiki.title}</a>
            </h1>
            <nav className="wiki-top-nav">
              <a href={`/wikis/${wiki.name}/Main_Page`}>{t("wiki.nav.mainPage")}</a>
              <a href={`/wikis/${wiki.name}/Special:AllPages`}>{t("wiki.nav.allPages")}</a>
              <a href={`/wikis/${wiki.name}/Special:RecentChanges`}>{t("wiki.nav.recentChanges")}</a>
              {canDelete && <a href={`/wikis/${wiki.name}/Special:Settings`}>{t("wiki.nav.settings")}</a>}
            </nav>
          </div>
        </header>

        <main className="wiki-layout">
          <aside className="wiki-sidebar">
            <nav>
              <h3>{t("wiki.sidebar.navigation")}</h3>
              <ul>
                <li><a href={`/wikis/${wiki.name}/Main_Page`}>{t("wiki.sidebar.mainPage")}</a></li>
                <li><a href={`/wikis/${wiki.name}/Special:AllPages`}>{t("wiki.sidebar.allPages")}</a></li>
                <li><a href={`/wikis/${wiki.name}/Special:RecentChanges`}>{t("wiki.sidebar.recentChanges")}</a></li>
              </ul>

              <h3>{t("wiki.sidebar.tools")}</h3>
              <ul>
                {canDelete && <li><a href={`/wikis/${wiki.name}/Special:Settings`}>{t("wiki.sidebar.settings")}</a></li>}
                <li><a href={`/wikis/${wiki.name}/Help:Contents`}>{t("wiki.sidebar.help")}</a></li>
              </ul>
            </nav>
          </aside>

          <article className="wiki-content-area">
            <div className="wiki-page-header">
              {/* Breadcrumbs */}
              {safePage.path && safePage.path.includes("/") && (
                <nav className="wiki-breadcrumbs" aria-label="Breadcrumb">
                  {(() => {
                    const parts = safePage.path.split("/");
                    return parts.slice(0, -1).map((part, i) => {
                      const subPath = parts.slice(0, i + 1).join("/");
                      return (
                        <React.Fragment key={i}>
                          <a href={`/wikis/${wiki.name}/${formatPageTitle(namespace, subPath)}`}>
                            {part.replace(/_/g, " ")}
                          </a>
                          <span className="wiki-breadcrumbs-separator"> › </span>
                        </React.Fragment>
                      );
                    });
                  })()}
                  <span className="current">{safePage.path.split("/").at(-1).replace(/_/g, " ")}</span>
                </nav>
              )}

              <div className="wiki-page-header-row">
                <h2 className="wiki-page-title">
                  {namespace !== "Main" ? `${namespace}:${safePage.title}` : safePage.title}
                  {safePage.protected !== "none" && safePage.protected !== undefined && (
                    <span
                      className={`protection-badge protection-${safePage.protected}`}
                      title={t("wiki.protected.tooltip")}
                    >
                      {t(`wiki.protected.${safePage.protected}`)}
                    </span>
                  )}
                </h2>

                {/* Only show actions on normal pages, not Special:AllPages or Special:RecentChanges */}
                {!(namespace === "Special" && ["AllPages", "RecentChanges", "Upload"].includes(safePage.path)) && (
                  <div className="wiki-actions">
                    {isCommonPage ? (
                      <>
                        {/* View is always available */}
                        <a
                          href={`/wikis/${wiki.name}/${fullTitle}`}
                          className={mode === "view" && !safePage.isOldRevision ? "active" : ""}
                        >
                          {t("wiki.actions.view")}
                        </a>

                        {/* Only allow edit for admins */}
                        {canEdit && (
                          <a
                            href={`/wikis/${wiki.name}/${fullTitle}?mode=edit`}
                            className={mode === "edit" ? "active" : ""}
                          >
                            {t("wiki.edit.edit")}
                          </a>
                        )}

                        {/* History always available */}
                        <a
                          href={`/wikis/${wiki.name}/${fullTitle}?mode=history`}
                          className={mode === "history" ? "active" : ""}
                        >
                          {t("wiki.actions.history")}
                        </a>

                        {/* Delete / purge are disabled for safety */}
                      </>
                    ) : (
                      <>
                        {/* Regular actions for normal pages */}
                        <a
                          href={`/wikis/${wiki.name}/${fullTitle}`}
                          className={mode === "view" && !safePage.isOldRevision ? "active" : ""}
                        >
                          {t("wiki.actions.view")}
                        </a>

                        {canEdit && (
                          <a
                            href={`/wikis/${wiki.name}/${fullTitle}?mode=edit`}
                            className={mode === "edit" ? "active" : ""}
                          >
                            {safePage.exists ? t("wiki.edit.edit") : t("wiki.edit.create")}
                          </a>
                        )}

                        {safePage.exists && (
                          <>
                            <a
                              href={`/wikis/${wiki.name}/${fullTitle}?mode=history`}
                              className={mode === "history" ? "active" : ""}
                            >
                              {t("wiki.actions.history")}
                            </a>

                            {/* Dropdown for extra actions */}
                            <div className="wiki-more-actions dropdown">
                              <button className="dropdown-toggle" type="button">
                                ⋯
                              </button>
                              <div className="dropdown-menu">
                                <a
                                  href="#"
                                  className="dropdown-item purge-page"
                                  data-wiki={wiki.name}
                                  data-page={fullTitle}
                                  data-confirm-prompt={t("wiki.purge.confirm", { page: fullTitle }) || "Are you sure you want to purge this page?"}
                                >
                                  {t("wiki.actions.purge")}
                                </a>

                                {canDelete && (
                                  <a
                                    href={`/wikis/${wiki.name}/${fullTitle}?mode=delete`}
                                    className="dropdown-item danger"
                                  >
                                    {t("wiki.actions.delete")}
                                  </a>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Redirect notice (routing should set `redirectTarget`) */}
            {safePage.redirectTarget && !safePage.isOldRevision && mode === "view" && (
              <div className="wiki-redirect-notice">
                {t("wiki.page.redirected", { target: safePage.redirectTarget })}{" "}
                <a href={`/wikis/${wiki.name}/${safePage.redirectTarget.replace(/ /g, "_")}`}>{safePage.redirectTarget}</a>
              </div>
            )}

            {/* Redirected from notice */}
            {mode === "view" && query.from && (
                <div className="wiki-redirected-from">
                    {t("wiki.page.redirectedFrom")}{" "}
                    <a href={`/wikis/${wiki.name}/${query.from.replace(/ /g, "_")}?noredirect=1`}>
                        {query.from}
                    </a>
                </div>
            )}

            {/* Old revision warning */}
            {safePage.isOldRevision && (
              <div className="wiki-revision-warning">
                <p><strong>{t("wiki.revision.oldRevisionTitle", { page: fullTitle })}</strong></p>
                <p>{t("wiki.revision.oldRevisionNotice", { date: new Date(safePage.lastModifiedAt).toLocaleString() })}</p>
                <a href={`/wikis/${wiki.name}/${fullTitle}`}>{t("wiki.revision.viewLatest")}</a>
              </div>
            )}

            {/* Page content / modes */}
            {isCommonPage ? (
              <>
                {mode === "edit" ? (
                  <EditForm wiki={wiki} page={safePage} namespace={namespace} path={safePage.path} t={t} />
                ) : mode === "history" ? (
                  <PageHistory wiki={wiki} page={safePage} namespace={namespace} path={safePage.path} t={t} />
                ) : (
                  <>
                    <div className="wiki-common-page">
                      <h2>{safePage.title}</h2>
                      <pre>{safePage.content}</pre>
                    </div>
                    <div className="wiki-page-meta">
                      <div className="last-modified">
                        {t("wiki.page.lastModified", {
                          date: new Date(safePage.lastModifiedAt).toLocaleString(),
                          user: safePage.lastModifiedBy?.name || ""
                        })}
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : safePage.path === "RecentChanges" ? (
              <RecentChanges wiki={wiki} t={t} type={pageData.type} changes={pageData.changes} days={pageData.days} pagination={pageData.pagination} />
            ) : safePage.path === "AllPages" ? (
              <AllPages wiki={wiki} t={t} type={pageData.type} pages={pageData.pages} pagination={pageData.pagination} currentNamespace={query.namespace} />
            ) : safePage.path === "Upload" ? (
              <SpecialUpload wiki={wiki} t={t} user={user} />
            ) : mode === "edit" ? (
              <EditForm wiki={wiki} page={safePage} namespace={namespace} path={safePage.path} t={t} />
            ) : mode === "history" ? (
              <PageHistory wiki={wiki} page={safePage} namespace={namespace} path={safePage.path} t={t} />
            ) : mode === "delete" ? (
              <div className="wiki-delete-confirm">
                <h3>{t("wiki.page.delete")}</h3>
                <p>{t("wiki.delete.confirm", { page: fullTitle })}</p>
                <p><strong>{t("wiki.delete.confirm_prompt", { page: fullTitle })}</strong></p>

                <div className="delete-buttons">
                  <button
                    id="confirm-delete"
                    className="danger"
                    data-wiki={wiki.name}
                    data-page={fullTitle}
                    data-confirm-prompt={t("wiki.delete.confirm_prompt", { page: fullTitle })}
                  >
                    {t("wiki.page.delete")}
                  </button>

                  <a href={`/wikis/${wiki.name}/${fullTitle}`} className="button">
                    {t("wiki.page.cancel")}
                  </a>
                </div>
              </div>
            ) : (
              <>
                {!safePage.exists ? (
                  <>
                    <div className="wiki-page-empty">
                      <p>{t("wiki.page.doesNotExist")}</p>
                      {canEdit && (
                        <p>
                          <a href={`/wikis/${wiki.name}/${fullTitle}?mode=edit`} className="button">
                            {t("wiki.page.createThis")}
                          </a>
                        </p>
                      )}
                    </div>

                    {/* Category listing */}
                    {namespace === "Category" && safePage.pageData?.pages?.length > 0 && (
                        <div className="wiki-category-list">
                            <h3>{t("wiki.category.pagesInCategory")} "{safePage.pageData.category.replace(/_/g, " ")}"</h3>
                            <ul>
                                {safePage.pageData.pages.map((p) => (
                                    <li key={p.path}>
                                        <a href={`/wikis/${wiki.name}/${p.namespace === "Main" ? p.path : `${p.namespace}:${p.path}`}`}>
                                            {p.namespace === "Main" ? p.title : `${p.namespace}:${p.title}`}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                  </>
                ) : isModule && !isDocSubpage ? (
                  <div className="wiki-module">
                    {safePage.docHtml ? (
                      <div className="wiki-module-doc">
                        <div dangerouslySetInnerHTML={{ __html: safePage.docHtml }} />
                      </div>
                    ) : (
                      <div className="wiki-module-doc-missing">
                        <em>No documentation subpage (<code>/doc</code>) found for this module.</em>
                      </div>
                    )}

                    <pre className="wiki-module-code">
                      <code>{safePage.content}</code>
                    </pre>
                  </div>
                ) : (
                  <>
                    {/* Normal content */}
                    <div className="wiki-page-content" dangerouslySetInnerHTML={{ __html: safePage.html || "" }} />

                    {/* Category listing */}
                    {namespace === "Category" && safePage.pageData?.pages?.length > 0 && (
                        <div className="wiki-category-list">
                            <h3>{t("wiki.category.pagesInCategory")} "{safePage.pageData.category.replace(/_/g, " ")}"</h3>
                            <ul>
                                {safePage.pageData.pages.map((p) => (
                                    <li key={p.path}>
                                        <a href={`/wikis/${wiki.name}/${p.namespace === "Main" ? p.path : `${p.namespace}:${p.path}`}`}>
                                            {p.namespace === "Main" ? p.title : `${p.namespace}:${p.title}`}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                  </>
                )}

                {pageData?.pagination && (
                  <div className="wiki-pagination">
                    {Array.from({ length: safePage.pagination.total }, (_, i) => (
                      <a
                        key={i}
                        href={`?page=${i + 1}`}
                        className={safePage.pagination.current === i + 1 ? "active" : ""}
                      >
                        {i + 1}
                      </a>
                    ))}
                  </div>
                )}

                <div className="wiki-page-meta">
                  {safePage.exists && (<div className="last-modified">
                    {t("wiki.page.lastModified", {
                      date: new Date(safePage.lastModifiedAt).toLocaleString(),
                      user: safePage.lastModifiedBy?.name || ""
                    })}
                  </div>)}

                  {safePage.categories?.length > 0 && (
                    <div className="categories">
                      <h3>{t("wiki.page.categories")}:</h3>
                      <ul>
                        {safePage.categoriesWithExists.map(cat => (
                          <li key={cat.name}>
                            <a
                              className={!cat.exists ? "wiki-missing-category" : ""}
                              href={`/wikis/${wiki.name}/Category:${cat.path}`}
                            >
                              {cat.name.replace(/_/g, " ")}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </>
            )}
          </article>
        </main>

        <footer className="wiki-footer">
          <small>{t("wiki.footer.text", { wiki: wiki.title })}</small>
        </footer>
      </body>
    </html>
  );
};