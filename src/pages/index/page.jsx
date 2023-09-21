const React = require("react");
const Head = require("../../components/head");
const utils = require("../../../bin/utils");

function UserButton(props) {
    if (!props.user) return (
        <a href={`/login`}>
            <div id="username">{props.t("page.login.name")}</div>
        </a>
    )

    return (
        <div id="user">
            <a href={`/users/${props.user.username}`}>
                <div id="username">{props.user.name} ({props.user.username})</div>
            </a>
            <a href="/logout">
                <div id="logout">{props.t("user.logout")}</div>
            </a>
        </div>
    )
}

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.index.name")}>
                <script src={utils.bundleUrl("index.js")} />
                <link rel="stylesheet" href={utils.bundleUrl("index.css")} />
            </Head>
            <body>
                <div id="user-card">
                    <header>
                        <UserButton {...props} />
                        <div id="settings">
                            <div id="lang-dropdown" className="dropdown">
                                <span>{props.t("page.index.content.language")}</span>
                                <div className="dropdown-content">
                                    <a id="lang-en" className="block">EN</a>
                                    <a id="lang-ru" className="block">RU</a>
                                </div>
                            </div>
                            
                            <div id="theme-dropdown" className="dropdown">
                                <span>{props.t("page.index.content.theme.name")}</span>
                                <div className="dropdown-content">
                                    <a id="theme-light" className="block">{props.t("page.index.content.theme.light")}</a>
                                    <a id="theme-dark" className="block">{props.t("page.index.content.theme.dark")}</a>
                                </div>
                            </div>
                        </div>
                    </header>
                    <div id="tools">
                        {props.user && props.user.hasRole("admin") ? <a href="/admin">{props.t("page.index.content.tools.admin")}</a> : ""}
                        {props.user && props.user.allowFilestorage() ? <a href="/filestorage/browse">{props.t("page.index.content.tools.filestorage")}</a> : ""}
                        <a href="/password_generator">{props.t("page.index.content.tools.passwordgenerator")}</a>
                    </div>
                    <footer>
                        <span id="copyright">LiveGobe © 2022</span>
                    </footer>
                </div>
            </body>
        </html>
    )
}