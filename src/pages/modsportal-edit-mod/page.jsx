const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.modsportal.editmodpagename")}>
                <Bundle name="modsportal-edit-mod.js" />
                <Bundle name="modsportal-edit-mod.css" />
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
                                            <option value={props.game.name} selected>{props.game.name}</option>
                                        </select>
                                    </label>
                                    <label htmlFor="mod-name">
                                        {props.t("page.modsportal.modname") + ":"}
                                        <input type="text" name="mod-name" id="mod-name" defaultValue={props.game.mods[0].name} />
                                    </label>
                                    <label htmlFor="mod-author">
                                        {props.t("page.modsportal.modauthor") + ":"}
                                        <input type="text" name="mod-author" id="mod-author" defaultValue={props.game.mods[0].author} />
                                    </label>
                                    <label htmlFor="mod-description">
                                        {props.t("page.modsportal.moddescription") + ":"}
                                        <textarea name="mod-description" id="mod-description" defaultValue={props.game.mods[0].description} />
                                    </label>
                                    <input type="hidden" name="mod-id" id="mod-id" value={props.game.mods[0].modId} />
                                    <input type="hidden" name="mod-version" id="mod-version" value={props.game.mods[0].versions[0].version} />
                                    <input type="hidden" name="game-version" id="game-version" value={props.game.mods[0].versions[0].gameVersion} />
                                    <input type="hidden" name="mod-image" id="mod-image" value={props.game.mods[0].iconLink} />
                                    <input type="hidden" name="mod-ID" id="mod-ID" value={props.game.mods[0]._id} />
                                    <label htmlFor="mod-tags">
                                        {props.t("page.modsportal.modtags") + ":"}
                                        <input type="text" name="mod-tags" id="mod-tags" defaultValue={props.game.mods[0].tags.join(" ")} />
                                    </label>
                                    <label htmlFor="image-upload">
                                        {props.t("page.modsportal.modimageupload") + ":"}
                                        <input accept="image/*" type="file" name="image-upload" id="image-upload" />
                                    </label>
                                </div>
                                <div id="preview">
                                    
                                </div>
                            </div>
                            <input type="submit" value={props.t("generic.submit")} />
                        </form>
                    </div>
                </div>
                <footer>{props.t("copyright")}</footer>
                <div id="messages" />
            </body>
        </html>
    )
}