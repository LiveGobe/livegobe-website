const React = require("react");
const Head = require("../../components/head");
const utils = require("../../../bin/utils");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.settings.name")}>
                <script src={utils.bundleUrl("settings.js")} />
                <link rel="stylesheet" href={utils.bundleUrl("settings.css")} />
            </Head>
            <body data-theme={props.theme}>
                <div id="wrapper">
                    <div id="title">
                        <a id="back" href="/">
                            <div>{props.t("page.settings.back")}</div>
                        </a>
                        <h1>{props.t("page.settings.title")}</h1>
                    </div>
                    <div id="body">
                        <div className="setting-wrapper">
                            <label htmlFor="display-name">{props.t("page.settings.displayname.label")}</label>
                            <input type="text" id="display-name" name="displayName" readOnly value={props.user.name} />
                            <button type="button" id="change-name">{props.t("page.settings.displayname.change")}</button>
                        </div>
                        <div className="setting-wrapper">
                            <label htmlFor="username">{props.t("page.settings.username")}</label>
                            <input type="text" id="username" name="username" readOnly value={props.user.username} />
                        </div>
                        <div className="setting-wrapper">
                            <label htmlFor="api-key">{props.t("page.settings.apikey")}</label>
                            <input type="text" id="api-key" name="apiKey" readOnly />
                            <div id="api-key-buttons">
                                <button type="button" id="api-key-reveal">{props.t("page.settings.api.reveal")}</button>
                                <button type="button" id="api-key-copy">{props.t("page.settings.api.copy")}</button>
                                <button type="button" id="api-key-regenerate">{props.t("page.settings.api.regenerate")}</button>
                            </div>
                        </div>
                        <div className="setting-wrapper">
                            <input type="checkbox" name="showFilePreview" id="show-file-preview" disabled />
                            <label htmlFor="show-file-preview">{props.t("page.settings.showfilepreview")}</label>
                        </div>
                    </div>
                    <div id="footer">{props.t("copyright")}</div>
                </div>
                <div id="messages" />
            </body>
        </html>
    )
}