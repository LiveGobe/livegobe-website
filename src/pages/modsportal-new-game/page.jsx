const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.modsportal.newgamepagename")}>
                <Bundle name="modsportal-new-game.js" />
                <Bundle name="modsportal-new-game.css" />
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
                                    <label htmlFor="game-name">
                                        {props.t("page.modsportal.gamename") + ":"}
                                        <input type="text" name="game-name" id="game-name" />
                                    </label>
                                    <label htmlFor="image-upload">
                                        {props.t("page.modsportal.imageupload") + ":"}
                                        <input type="file" accept="image/*" name="image-upload" id="image-upload" />
                                    </label>
                                </div>
                                <div id="preview">
                                    <div id="game-card">
                                        <img />
                                        <div id="game-card-name" />
                                    </div>
                                </div>
                            </div>
                            <input type="submit" value={props.t("page.modsportal.creategame")} />
                        </form>
                    </div>
                </div>
                <footer>{props.t("copyright")}</footer>
                <div id="messages" />
            </body>
        </html>
    )
}