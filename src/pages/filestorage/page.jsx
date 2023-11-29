const React = require('react');
const Head = require("../../components/head");
const ControlPanel = require('../../components/control-panel');
const utils = require("../../../bin/utils");

function Filestorage(props) {
    if (!props.storage) return (
        <div id="filestorage">
            <div id="filestorage-info">
                <div id="info-section-main" />
                <div id="info-section-file">
                    <center>
                        <p>{props.t("filestorage.create.message")}</p>
                        <button id="create-storage" type="button">{props.t("filestorage.create.button")}</button>
                    </center>
                </div>
                <div id="info-section-folder" style={{display: "none"}} />
            </div>
            <div id="filestorage-browse" />
            <div id="filestorage-actions" />
        </div>
    );

    return (
        <div id="filestorage">
            <div id="filestorage-info">
                <div id="info-section-main">
                    <div id="info-main-content">
                        <span>{props.t("filestorage.available", { "0": "_", "1": "_" })}</span>
                    </div>
                </div>
                <div id="info-section-folder" style={{display: "none"}}>
                    <div id="info-folder-content">
                        <div id="info-folder-name">{props.t("filestorage.folder.name")}</div>
                        <div id="info-folder-size">{props.t("filestorage.folder.size")}</div>
                    </div>
                </div>
                <div id="info-section-file" style={{display: "none"}}>
                    <div id="info-file-content">
                        <div id="info-file-name">{props.t("filestorage.file.name")}</div>
                        <div id="info-file-size">{props.t("filestorage.file.size")}</div>
                        <div id="info-file-privacy">{props.t("filestorage.file.privacy")}</div>
                        <div id="info-file-date">{props.t("filestorage.file.date")}</div>
                        <div id="info-file-md5">{props.t("filestorage.file.md5")}</div>
                    </div>
                </div>
            </div>
            <div id="filestorage-browse">
                <div id="search-section">
                    <input type="text" id="search-field" placeholder={props.t("filestorage.search")} />
                    <input type="hidden" id="copy-path-message" value={props.t("filestorage.message.copypath")} />
                    <button id="copy-path">{props.t("filestorage.copypath")}</button>
                </div>
                <div id="folders-list" />
                <div id="files-list" />
            </div>
            <div id="right-panel">
                <div id="filestorage-actions">
                    <input type="file" id="file-input" style={{ visibility: "hidden", position: "absolute", width: 0, height: 0}} />
                    <input type="file" id="files-input" multiple style={{ visibility: "hidden", position: "absolute", width: 0, height: 0}} />
                    <input type="hidden" id="create-folder-prompt" value={props.t("filestorage.message.folder.create")} />
                    <input type="hidden" id="folder-name-invalid" value={props.t("filestorage.message.folder.nameinvalid")} />
                    <input type="hidden" id="file-name-invalid" value={props.t("filestorage.message.file.nameinvalid")} />
                    <input type="hidden" id="files-name-invalid" value={props.t("filestorage.message.files.nameinvalid")} />
                    <input type="hidden" id="file-size-toobig" value={props.t("filestorage.message.file.toobig")} />
                    <input type="hidden" id="files-size-toobig" value={props.t("filestorage.message.files.toobig")} />
                    <input type="hidden" id="rename-folder-prompt" value={props.t("filestorage.message.folder.rename")} />
                    <input type="hidden" id="delete-folder-prompt" value={props.t("filestorage.message.folder.delete", {"0": "_"})} />
                    <input type="hidden" id="rename-file-prompt" value={props.t("filestorage.message.file.rename")} />
                    <input type="hidden" id="fexists" value={props.t("filestorage.message.fexists", {"0": "_"})} />
                    <input type="hidden" id="files-exists" value={props.t("filestorage.message.files.exists")} />
                    <input type="hidden" id="move-file-prompt" value={props.t("filestorage.message.file.move")} />
                    <input type="hidden" id="delete-file-prompt" value={props.t("filestorage.message.file.delete", {"0": "_"})} />
                    <input type="hidden" id="copy-file-link" value={props.t("filestorage.message.file.link")} />
                    <div id="default-actions">
                        <div id="action-create-folder" className="unselectable action">{props.t("filestorage.action.default.createfolder")}</div>
                        <div id="action-upload-file" className="unselectable action">{props.t("filestorage.action.default.uploadfile")}</div>
                        <div id="action-upload-files" className="unselectable action">{props.t("filestorage.action.default.uploadfiles")}</div>
                    </div>
                    <div id="folder-actions" style={{display: "none"}}>
                        <div id="action-open-folder" className="unselectable action">{props.t("filestorage.action.folder.open")}</div>
                        <div id="action-rename-folder" className="unselectable action">{props.t("filestorage.action.folder.rename")}</div>
                        <div id="action-delete-folder" className="unselectable action">{props.t("filestorage.action.folder.delete")}</div>
                    </div>
                    <div id="file-actions" style={{display: "none"}}>
                        <div id="action-show-file" className="unselectable action">{props.t("filestorage.action.file.show")}</div>
                        <div id="action-download-file" className="unselectable action">{props.t("filestorage.action.file.download")}</div>
                        <div id="action-share-file" className="unselectable action">{props.t("filestorage.action.file.share")}</div>
                        <div id="action-rename-file" className="unselectable action">{props.t("filestorage.action.file.rename")}</div>
                        <div id="action-move-file" className="unselectable action">{props.t("filestorage.action.file.move")}</div>
                        <div id="action-delete-file" className="unselectable action">{props.t("filestorage.action.file.delete")}</div>
                    </div>
                </div>
                <div id="preview">
                    <div id="preview-content" />
                </div>
            </div>
            <div id="filestorage-messages" />
            <div id="filestorage-uploads" />
        </div>
    );
}

function FilestorageBrowse(props) {
    return (
        <html lang={props.lang}>
            <head>
                <Head title={props.t("filestorage.title")}>
                    <link rel="stylesheet" href={utils.bundleUrl("filestorage.css")} />
                    <link rel="alternate" href="https://livegobe.ru/filestorage/browse" hrefLang="x-default" />
                    <meta property="og:title" content="Filestorage" />
                    <meta property="og:image" content={utils.staticUrl("images/home.png")} />
                    <meta property="og:description" content="Filestorage application on livegobe.ru" />
                    <meta property="og:url" content="https://livegobe.ru/filestorage/browse" />
                </Head>
            </head>
            <body data-theme={props.theme}>
                <ControlPanel {...props} page="filestorage" />
                <Filestorage {...props} />
                <script src={utils.bundleUrl("filestorage.js")} />
            </body>
        </html>
    );
}

module.exports = FilestorageBrowse;