import $ from "jquery";
import i18n from "../../js/repack-locales";
import { createError, createMessage, staticUrl } from "../../js/utils";
import { parse } from "marked";

await i18n.init();

$(() => {

    function loadData(d) {
        /**
         * @typedef {Object[]} Games
         * @prop {String} _id game id
         * @prop {String} name game name
         * @prop {String} [imageLink] link to game card
         * @prop {Object[]} mods mods list
         * @prop {String} mods[]._id mod id
         * @prop {String} mods[].name mod name
         * @prop {String} mods[].description mod description
         * @prop {String} [mods[].modId] mod in-game id and file name
         * @prop {String} mods[].author mod author
         * @prop {Object[]} mods[].versions[] different versions of the mod
         * @prop {String} mods[].versions[].version mod version
         * @prop {String} [mods[].versions[].gameVersion] supported game version
         * @prop {Date} mods[].versions[].uploadedAt upload date
         * @prop {String[]} [mods[].tags] mod tags
         * @prop {String} [mods[].iconLink] mod icon link
         */
    
        /** @type {Games} */
        const games = d.games.sort((a, b) => a.name.localeCompare(b.name));

        function updateHeader() {
            $headerTable.empty();
            if (URLParts.at(3)) {
                const game = games.find(g => g.name == URLParts.at(2));
                const mod = game.mods.find(m => m._id == URLParts.at(3));
                const $anchor = $(`<a>\<==</a>`).attr("href", encodeURI(`/mods_portal/browse`)).on("click", e => {
                    e.preventDefault();
                    window.history.replaceState(null, null, `/mods_portal/browse`);
                    updateURL();
                    updateHeader();
                    updateGamesList();
                    updateControlButton();
                    showPage($gamesList);
                });
                const $anchor2 = $(`<a><div>${URLParts.at(2)}</div></a>`).attr("href", encodeURI(`/mods_portal/browse/${game.name}`)).on("click", e => {
                    e.preventDefault();
                    window.history.replaceState(null, null, `/mods_portal/browse/${game.name}`);
                    updateURL();
                    updateHeader();
                    updateModsList();
                    updateControlButton();
                    showPage($modsList);
                });
                $headerTable.append($anchor).append($anchor2).append("/ ").append(mod.name + " " + mod.versions.at(-1).version);
            } else if (URLParts.at(2)) {
                const $anchor = $(`<a>\<==</a>`).attr("href", encodeURI(`/mods_portal/browse`)).on("click", e => {
                    e.preventDefault();
                    window.history.replaceState(null, null, `/mods_portal/browse`);
                    updateURL();
                    updateHeader();
                    updateGamesList();
                    updateControlButton();
                    showPage($gamesList);
                });
                $headerTable.append($anchor).append(`<div>${URLParts.at(2)}</div>`);
            } else if (URLParts.at(-1) == "browse") $headerTable.text(i18n.t("page.modsportal.choosegame"));
        }

        function updateGamesList() {
            $gamesList.empty();
            games.forEach(game => {
                const $gameElement = $("<div>").addClass("game-card");
                const $cardImage = $("<img>").attr("src", game.imageLink ?? staticUrl("images/gamecards/empty.png"))
                const $cardText = $("<div>").text(game.name);
                $gameElement.append($cardImage).append($cardText);
                const $anchor = $("<a>").attr("href", encodeURI(`/mods_portal/browse/${game.name}`)).append($gameElement).on("click", e => {
                    e.preventDefault();
                    window.history.replaceState(null, null, `/mods_portal/browse/${game.name}`);
                    updateURL();
                    updateHeader();
                    updateModsList();
                    updateControlButton();
                    showPage($modsList);
                });
                $gamesList.append($anchor);
            });
        }

        function updateModsList() {
            const gameName = URLParts.at(2);
            if (!gameName) return;

            $modsList.empty();
            const game = games.find(g => g.name == gameName);
            if (!game) return createError(i18n.t("page.modsportal.nogamefound"));

            game.mods.forEach(mod => {
                const $modElement = $("<div>").addClass("mod-card");
                if (mod.iconLink) {
                    const $modIcon = $("<img>").attr("src", mod.iconLink);
                    $modElement.append($modIcon);
                }
                const $modTitle = $("<div>").addClass("bold").text(`${mod.name} ${i18n.t("generic.by")} ${mod.author}`);
                const $modDescription = $("<div>").text(mod.description);
                const $modInfo = $("<div>").addClass("info").append($modTitle).append($modDescription);
                $modElement.append($modInfo);
                const $anchor = $("<a>").attr("href", encodeURI(`/mods_portal/browse/${game.name}/${mod._id}`)).append($modElement).on("click", e => {
                    e.preventDefault();
                    window.history.replaceState(null, null, `/mods_portal/browse/${game.name}/${mod._id}`);
                    updateURL();
                    updateHeader();
                    updateModPage();
                    updateControlButton();
                    showPage($modPage);
                });
                $modsList.append($anchor);
            });

            if ($modsList.is(":empty")) {
                const $anchor = $("<a>").attr("href", encodeURI(`/mods_portal/browse/${game.name}`)).on("click", e => {
                    e.preventDefault();
                    window.history.replaceState(null, null, `/mods_portal/browse/${game.name}`);
                    updateURL();
                    updateHeader();
                    updateGamesList();
                    updateControlButton();
                    showPage($gamesList);
                });
                $anchor.append(i18n.t("generic.back"));
                $modsList.append(i18n.t("page.modsportal.nomodsfound"));
            }
        }

        async function updateModPage() {
            const gameName = URLParts.at(2);
            if (!gameName) return;

            const modId = URLParts.at(3);
            if (!modId) return;

            $modPage.empty();
            const game = games.find(g => g.name == gameName);
            if (!game) return createError(i18n.t("page.modsportal.nogamefound"));

            const mod = game.mods.find(m => m._id == modId);
            if (!mod) return createError(i18n.t("page.modsportal.nomodfound"));

            const $topBlock = $("<div>").attr("id", "mod-header");
            const $infoBlock = $("<div>").attr("id", "mod-info");
            $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.title"))).append(": ").append(mod.name));
            $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.author"))).append(": ").append(mod.author));
            $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.modid"))).append(": ").append(mod.modId));
            $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.latestversion"))).append(": ").append(mod.versions.at(-1).version));
            if (mod.versions.at(-1).gameVersion) $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.gameversion"))).append(": ").append(mod.versions.at(-1).gameVersion));
            $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.lastupload"))).append(": ").append(new Date(mod.versions.at(-1).uploadedAt).toLocaleString()));
            $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.tags"))).append(": ").append(mod.tags.join(", ")));
            $topBlock.append($infoBlock)
            if (mod.iconLink) $topBlock.append($("<img>").attr("id", "icon-img").attr("src", mod.iconLink));
            const $description = $("<div>").attr("id", "mod-description").append(mod.description);
            const $downloadsTable = $("<div>").attr("id", "downloads-table");
            const sortedMods = mod.versions.toSorted((v1, v2) => {
                let v1split = v1.version.split(".").map(m => Number(m));
                let v2split = v2.version.split(".").map(m => Number(m));
                return ((v2split[0] - v1split[0]) * 100 + (v2split[1] - v1split[1]) * 10 + (v2split[2] - v1split[2]));
            });
            sortedMods.forEach(version => {
                const $downloadBlock = $("<div>").addClass("download");
                const $downloadInfo = $("<div>").addClass("download-info").append($(`<div>${i18n.t("page.modsportal.version")}: ${version.version}</div>`).addClass("download-version"));
                if (version.gameVersion) $downloadInfo.append($(`<div>${i18n.t("page.modsportal.gameversion")}: ${version.gameVersion}</div>`).addClass("download-game-version"));
                $downloadInfo.append($(`<div>${i18n.t("page.modsportal.uploaddate")}: ${new Date(version.uploadedAt).toLocaleString()}</div>`).addClass("download-mod-version"));
                $downloadBlock.append($downloadInfo);
                const $downloadButtons = $("<div>").addClass("download-buttons");
                const $shareButton = $("<button>").attr("type", "button").text(i18n.t("generic.share")).on("click", e => {
                    navigator.clipboard.writeText(staticUrl(encodeURI(`files/mods/${game.name}/${mod._id}/${version.version}/${mod.modId}`)));
                    createMessage(i18n.t("page.modsportal.shared"));
                });
                const $downloadButton = $("<a>").attr("target", "_blank").attr("href", encodeURI(`/mods_portal/d/${game.name}/${mod._id}/${version.version}`)).append($("<button>").attr("type", "button").text(i18n.t("generic.download")));
                $downloadButtons.append($shareButton).append($downloadButton);
                $downloadsTable.append($downloadBlock.append($downloadButtons));
            });
            $modPage.append($topBlock).append($description).append($downloadsTable);
        }

        function updateControlButton() {
            if (URLParts.at(3)) {
                $controlButton.attr("href", encodeURI(`/mods_portal/mod/update/${URLParts.at(3)}`)).text(i18n.t("page.modsportal.updatemod"));
            } else if (URLParts.at(2)) {
                $controlButton.attr("href", encodeURI(`/mods_portal/mod/new?game=${URLParts.at(2)}`)).text(i18n.t("page.modsportal.createmod"));
            } else {
                $controlButton.attr("href", encodeURI(`/mods_portal/game/new`)).text(i18n.t("page.modsportal.addgame"));
            }
        }

        function showPage(page) {
            $gamesList.hide();
            $modsList.hide();
            $modPage.hide();
            page.show();
        }

        function updateURL() {
            URLParts = decodeURI(window.location.pathname).split("/").filter(f => f != "");
        }

        let URLParts = decodeURI(window.location.pathname).split("/").filter(f => f != "");

        // Render Games Data
        const $headerTable = $("#header-table");
        const $gamesList = $("#games-list");
        const $modsList = $("#mods-list");
        const $modPage = $("#mod-page");

        const $controlButton = $("#control-button");

        updateURL();
        updateHeader();
        updateGamesList();
        updateModsList();
        updateModPage();
        updateControlButton();

        if (URLParts.at(3)) showPage($modPage);
        else if (URLParts.at(2)) showPage($modsList);
        else showPage($gamesList);
    }

    // Load Games Data
    $.ajax({
        url: "/api/v2/modsportal/games",
        method: "GET",
        success: function(data) {
            loadData(data);
        },
        error: function(xhr, status, err) {
            createError(xhr.responseJSON?.message ?? err);
        }
    });
});