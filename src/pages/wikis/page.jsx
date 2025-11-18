const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");

function CreateWikiButton({ user, t }) {
    if (!user?.hasRole("admin") && !user?.hasRole("wiki_creator")) return null;
    
    return (
        <button
            type="button"
            id="create-wiki"
            className="btn btn-primary mb-3"
            data-bs-toggle="modal"
            data-bs-target="#createWikiModal"
        >
            {t("page.wikis.create.button")}
        </button>
    );
}

function WikiCard({ wiki, t }) {
    return (
        <div className="wiki-card mb-3">
            <h3 className="wiki-title">
                <a href={`/wikis/${wiki.name}`}>{wiki.title}</a>
            </h3>
            {wiki.description && <p className="wiki-description">{wiki.description}</p>}
            <div className="wiki-meta text-muted">
                <small>
                    {t("page.wikis.lastUpdated", { 
                        "0": new Date(wiki.updatedAt).toLocaleDateString() 
                    })}
                </small>
            </div>
        </div>
    );
}

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.wikis.name")} doIndex>
                <Bundle name="wikis.css" />
                <Bundle name="wikis.js" />
                <meta name="description" content="A list of Wikis hosted on LiveGobe.ru" />
            </Head>
            <body data-theme={props.theme}>
                <main className="container py-4">
                    <a href="/">{props.t("common.backtomain")}</a>
                    <div className="d-flex justify-content-between align-items-center mb-4">
                        <h1>{props.t("page.wikis.name")}</h1>
                        <CreateWikiButton {...props} />
                    </div>

                    <div className="wiki-list">
                        {props.wikis?.length > 0 ? (
                            props.wikis.map(wiki => (
                                <WikiCard key={wiki.name} wiki={wiki} t={props.t} />
                            ))
                        ) : (
                            <div className="alert alert-info">
                                {props.t("page.wikis.empty")}
                            </div>
                        )}
                    </div>
                    <div id="contacts-block">
                        <p>{props.t("page.wikis.contact")}</p>
                        <p>{props.t("page.wikis.contacts")}</p>
                    </div>
                </main>
                <div id="create-wiki-block" className="wiki-modal hidden">
                    <div id="create-wiki-overlay"></div>
                    <div id="create-wiki-form" className="wiki-modal-content">
                        <h2>{props.t("page.wikis.create.title")}</h2>

                        <div className="mb-3">
                            <label htmlFor="wiki-name" className="form-label">
                                {props.t("page.wikis.create.name_label")}
                            </label>
                            <input
                                id="wiki-name"
                                type="text"
                                className="form-control"
                                placeholder={props.t("page.wikis.create.name_placeholder")}
                            />
                        </div>

                        <div className="mb-3">
                            <label htmlFor="wiki-desc" className="form-label">
                                {props.t("page.wikis.create.desc_label")}
                            </label>
                            <textarea
                                id="wiki-desc"
                                className="form-control"
                                rows="3"
                                placeholder={props.t("page.wikis.create.desc_placeholder")}
                            ></textarea>
                        </div>

                        <div className="mb-3">
                            <label htmlFor="wiki-lang" className="form-label">
                                {props.t("page.wikis.create.lang_label")}
                            </label>
                            <select id="wiki-lang" className="form-select">
                                <option value="en">English</option>
                                <option value="ru">Русский</option>
                            </select>
                        </div>

                        <div className="d-flex justify-content-end gap-2">
                            <button type="button" className="btn btn-secondary btn-cancel">
                                {props.t("common.cancel")}
                            </button>
                            <button type="button" className="btn btn-primary btn-create">
                                {props.t("common.create")}
                            </button>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
};