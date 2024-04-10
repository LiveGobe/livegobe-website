const React = require("react");
const Head = require("../../components/head");
const utils = require("../../../bin/utils");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.admin.pagename")}>
                <script src={utils.bundleUrl("admin.js")} />
                <link rel="stylesheet" href={utils.bundleUrl("admin.css")} />
            </Head>
            <body data-theme={props.theme}>
                <header>
                    <a href="/">
                        <div id="back">{props.t("page.admin.return")}</div>
                    </a>
                    <div id="header-table">
                        <div id="main" className="active">{props.t("page.admin.table.main")}</div>
                        <div id="user">{props.t("page.admin.table.user")}</div>
                        <div id="filestorage">{props.t("page.admin.table.filestorage")}</div>
                    </div>
                </header>
                <div id="body">
                    <div id="wrapper">
                        <div id="main-stats">
                            <p>{props.t("page.admin.main.userstotal", { users: props.usersTotal })}</p>
                            <p>{props.t("page.admin.main.usersfilestorage", { users: props.usersFilestorage })}</p>
                            <p>{props.t("page.admin.main.space", { used: utils.formatBytes(props.spaceUsed), total: utils.formatBytes(props.spaceTotal) })}</p>
                        </div>
                        <div id="user-stats" style={{ display: "none" }}>
                            <div id="users-list">
                                <div id="user-controls">
                                    <div id="user-controls-inputs">
                                        <input type="text" name="id-input" id="id-input" placeholder="id" autoComplete="off" />
                                        <input type="text" name="username-input" id="username-input" autoComplete="off" placeholder={props.t("page.admin.user.username")} />
                                        <input type="text" name="name-input" id="name-input" autoComplete="off" placeholder={props.t("page.admin.user.name")} />
                                    </div>
                                    <button id="users-refresh-button" type="button">{props.t("page.admin.user.refresh")}</button>
                                </div>
                                <ul id="users">

                                </ul>
                            </div>
                            <div id="user-settings" style={{ display: "none" }}>
                                <label htmlFor="user-id">
                                    {props.t("page.admin.user.id")}
                                    <input type="text" name="user-id" id="user-id" readOnly />
                                </label>
                                <label htmlFor="permissions">
                                    {props.t("page.admin.user.permissions")}
                                    <input type="text" name="permissions" id="permissions" />
                                </label>
                                <button disabled type="button" id="user-save">{props.t("page.admin.user.save")}</button>
                            </div>
                        </div>
                        <div id="filestorage-stats" style={{ display: "none" }}>
                            <div id="filestorage-controls">
                                <div id="filestorage-controls-inputs">
                                    <input type="text" name="user-id-input" id="user-id-input" placeholder="id" autoComplete="off" />
                                </div>
                                <button id="filestorage-refresh-button" type="button">{props.t("page.admin.filestorage.refresh")}</button>
                            </div>
                            <div id="filestorage-settings" style={{ display: "none" }}>
                                <label htmlFor="owner-id">
                                    {props.t("page.admin.filestorage.ownerid")}
                                    <input type="text" name="owner-id" id="owner-id" readOnly />
                                </label>
                                <label htmlFor="filestorage-id">
                                    {props.t("page.admin.filestorage.id")}
                                    <input type="text" name="filestorage-id" id="filestorage-id" readOnly />
                                </label>
                                <label htmlFor="filestorage-size">
                                    {props.t("page.admin.filestorage.size")}
                                    <input type="text" name="filestorage-size" id="filestorage-size" readOnly />
                                </label>
                                <label htmlFor="filestorage-maxsize">
                                    {props.t("page.admin.filestorage.maxsize")}
                                    <input type="text" name="filestorage-maxsize" id="filestorage-maxsize" />
                                </label>
                                <button disabled type="button" id="filestorage-save">{props.t("page.admin.filestorage.save")}</button>
                            </div>
                        </div>
                    </div>
                </div>
                <footer>{props.t("copyright")}</footer>
                <div id="messages" />
            </body>
        </html>
    )
}