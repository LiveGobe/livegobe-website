const React = require('react');
const Head = require('../../components/head');
const ControlPanel = require('../../components/control-panel');
const utils = require('../../../bin/utils');

function FilePage(props) {
    return (
        <html lang={props.language}>
            <head>
                <Head title={props.t("filestorage.file.title", { file: props.file.name })}>
                    <link rel="stylesheet" href={utils.bundleUrl("filestorage-file.css")} />
                    <meta property="og:title" content={`Download ${props.file.name}`} />
                    <meta property="og:image" content={utils.staticUrl("images/home.png")} />
                    <meta property="og:description" content="Download a file from filestorage" />
                    <meta property="og:url" content={`https://livegobe.ru/v/${props.owner.id}/${props.file.id}`} />
                </Head>
            </head>
            <body data-theme={props.theme}>
                <ControlPanel {...props} page="filestorage" />
                <div id="content" className="center">
                    <h1>{`${props.file.name} - ${utils.formatBytes(props.file.size)}`}</h1>
                    <div id="owner">{`${props.t("filestorage.file.owner")}: `}<a href={`/users/${props.owner.username}`} target="_blank">{props.owner.name}</a></div>
                    <div id="md5">{`${props.t("filestorage.file.md5")}: ${props.file.md5}`}</div>
                    <a href={`/filestorage/d/${props.owner.id}/${props.file.id}`} target="_blank">
                        <button type="button">{props.t("filestorage.file.download")}</button>
                    </a>
                </div>
                <script src={utils.bundleUrl("filestorage-file.js")} />
            </body>
        </html>
    )
}

module.exports = FilePage;