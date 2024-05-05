const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");
const config = require("../../../config");
const utils = require("../../../bin/utils");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.modsportal.pagename")}>
                <Bundle name="modsportal.js" />
                <Bundle name="modsportal.css" />
                <meta property="og:title" content="LG Mods Portal" />
                <meta property="og:image" content={utils.staticUrl("images/home.png")} />
                <meta property="og:description" content="A mods portal for different games" />
                <meta property="og:url" content={`https://${config.domainName}${props.link}`} />
            </Head>
            <body data-theme={props.theme}>
                <header>
                    <div>
                        <a href="/">
                            <div id="back">{props.t("generic.return")}</div>
                        </a>
                        <div id="header-table">
                            {props.t("generic.loading")}
                        </div>
                    </div>
                    <div>
                        <input type="search" name="search-filter" id="search-filter" placeholder={props.t("page.modsportal.filtergames")} />
                    </div>
                    <div>
                        <a id="control-button" href="/mods_portal/game/new">{props.t("page.modsportal.addgame")}</a>
                    </div>
                </header>
                <div id="body">
                    <div id="wrapper">
                        <div id="games-list">{props.t("generic.loading")}</div>
                        <div id="mods-list" style={{ display: "none" }} />
                        <div id="mod-page" style={{ display: "none" }} />
                    </div>
                </div>
                <footer>{props.t("copyright")}</footer>
                <div id="messages" />
            </body>
        </html>
    )
}