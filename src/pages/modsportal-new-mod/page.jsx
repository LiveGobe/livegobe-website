const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.modsportal.newmodpagename")}>
                <Bundle name="modsportal-new-mod.js" />
                <Bundle name="modsportal-new-mod.css" />
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
                                    <label htmlFor="game-select">
                                        {props.t("page.modsportal.gameselect") + ":"}
                                        <select type="text" name="game-select" id="game-select">
                                            <option value="">{props.t("page.modsportal.choosegame")}</option>
                                            {props.games.map(g => <option key={g.name} selected={props.selectedGame == g.name ? true : false} value={g.name}>{g.name}</option>)}
                                        </select>
                                    </label>
                                    <label htmlFor="mod-name">
                                        {props.t("page.modsportal.modname") + ":"}
                                        <input type="text" name="mod-name" id="mod-name" />
                                    </label>
                                    <label htmlFor="mod-author">
                                        {props.t("page.modsportal.modauthor") + ":"}
                                        <input type="text" name="mod-author" id="mod-author" />
                                    </label>
                                    <label htmlFor="mod-description">
                                        {props.t("page.modsportal.moddescription") + ":"}
                                        <textarea name="mod-description" id="mod-description" />
                                    </label>
                                    <label htmlFor="mod-id">
                                        {props.t("page.modsportal.modidupload") + ":"}
                                        <input type="text" name="mod-id" id="mod-id" />
                                    </label>
                                    <label htmlFor="mod-version">
                                        {props.t("page.modsportal.modversion") + ":"}
                                        <input type="text" name="mod-version" id="mod-version" />
                                    </label>
                                    <label htmlFor="game-version">
                                        {props.t("page.modsportal.gameversionupload") + ":"}
                                        <input type="text" name="game-version" id="game-version" />
                                    </label>
                                    <label htmlFor="mod-tags">
                                        {props.t("page.modsportal.modtags") + ":"}
                                        <input type="text" name="mod-tags" id="mod-tags" />
                                    </label>
                                    <label htmlFor="image-upload">
                                        {props.t("page.modsportal.modimageupload") + ":"}
                                        <input accept="image/*" type="file" name="image-upload" id="image-upload" />
                                    </label>
                                    <label htmlFor="file-upload">
                                        {props.t("page.modsportal.modfile") + ":"}
                                        <input type="file" name="file-upload" id="file-upload" />
                                    </label>
                                </div>
                                <div id="preview">
                                    
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