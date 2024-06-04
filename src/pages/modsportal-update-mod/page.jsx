const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.modsportal.newmodpagename")}>
                <Bundle name="modsportal-update-mod.js" />
                <Bundle name="modsportal-update-mod.css" />
            </Head>
            <body data-theme={props.theme}>
                <header>
                    <div>
                        <a href="/">
                            <div id="back">{props.t("generic.return")}</div>
                        </a>
                    </div>
                    <div>
                        <a id="control-button" href="/mods_portal/browse">{props.t("page.modsportal.return")}</a>
                    </div>
                </header>
                <div id="body">
                    <div id="wrapper">
                        <form>
                            <div id="form-main">
                                <div id="inputs">
                                    <input type="hidden" name="mod-name" id="mod-name" value={props.game.name} />
                                    <label htmlFor="mod-version">
                                        {props.t("page.modsportal.modversionupdate") + ":"}
                                        <input type="text" name="mod-version" id="mod-version" />
                                    </label>
                                    <label htmlFor="game-version">
                                        {props.t("page.modsportal.gameversionupload") + ":"}
                                        <input type="text" name="game-version" id="game-version" />
                                    </label>
                                    <label htmlFor="file-upload">
                                        {props.t("page.modsportal.modfile") + ":"}
                                        <input type="file" name="file-upload" id="file-upload" />
                                    </label>
                                </div>
                            </div>
                            <input type="submit" value={props.t("generic.upload")} />
                        </form>
                    </div>
                </div>
                <footer>{props.t("copyright")}</footer>
                <div id="messages" />
            </body>
        </html>
    )
}