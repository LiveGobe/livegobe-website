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
                    $filter.attr("placeholder", i18n.t("page.modsportal.filtergames"));
                    $filter.val("");
                    updateURL();
                    updateHeader();
                    updateGamesList();
                    updateControlButton();
                    showPage($gamesList);
                });
                const $anchor2 = $(`<a><div>${URLParts.at(2)}</div></a>`).attr("href", encodeURI(`/mods_portal/browse/${game.name}`)).on("click", e => {
                    e.preventDefault();
                    window.history.replaceState(null, null, `/mods_portal/browse/${game.name}`);
                    $filter.attr("placeholder", i18n.t("page.modsportal.filtermods"));
                    $filter.val("");
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
                    $filter.attr("placeholder", i18n.t("page.modsportal.filtergames"));
                    $filter.val("");
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

            let filteredGames = [];
            let filter = $filter.val();
            let filters = filter.split(" ").filter(n => n);
            if (filters.length) {
                for (let i = 0; i < filters.length; i++) {
                    const fGames = games.filter(e => { return e.name.toLowerCase().includes(filters[i].toLowerCase()) });
                    fGames.forEach((g) => {
                        if (!filteredGames.includes(g)) filteredGames.push(g);
                    })
                }
                filteredGames.sort((a, b) => { return a.name.localeCompare(b.name) });
            }
            else filteredGames = games;

            filteredGames.forEach(game => {
                const $gameElement = $("<div>").addClass("game-card");
                const $cardImage = $("<img>").attr("src", game.imageLink ?? staticUrl("images/gamecards/empty.png"))
                let gameName = game.name;
                for (let i = 0; i < filters.length; i++) {
                    gameName = gameName.replace(new RegExp(`(${filters[i].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})(?![^<]*>|[^<>]*<\/)`, "gi"), `<span class="highlighted">$1</span>`);
                }
                const $cardText = $("<div>").append(gameName);
                $gameElement.append($cardImage).append($cardText);
                const $anchor = $("<a>").attr("href", encodeURI(`/mods_portal/browse/${game.name}`)).append($gameElement).on("click", e => {
                    e.preventDefault();
                    window.history.replaceState(null, null, `/mods_portal/browse/${game.name}`);
                    $filter.attr("placeholder", i18n.t("page.modsportal.filtermods"));
                    $filter.val("");
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

            game.mods.sort((m1, m2) => m1.name.localeCompare(m2.name));

            let filteredMods = [];
            let filter = $filter.val();
            let filters = filter.split(" ").filter(n => n);
            if (filters.length) {
                for (let i = 0; i < filters.length; i++) {
                    const fMods = game.mods.filter(e => {
                        return e.name.toLowerCase().includes(filters[i].toLowerCase()) || e.description.toLowerCase().includes(filters[i].toLowerCase()) || e.author.toLowerCase().includes(filters[i].toLowerCase()) || e.tags.join(", ").toLowerCase().includes(filters[i].toLowerCase());
                    });
                    fMods.forEach((g) => {
                        if (!filteredMods.includes(g)) filteredMods.push(g);
                    })
                }
                filteredMods.sort((a, b) => { return a.name.localeCompare(b.name) });
            }
            else filteredMods = game.mods;

            filteredMods.forEach(mod => {
                let modName = mod.name;
                let modDescription = mod.description.slice(0, mod.description.indexOf("\n")).replace(/(<\/?(?:span)[^>]*>)|<[^>]+>/ig, '$1');
                let modAuthor = mod.author;
                let modTags = mod.tags.join(", ");
                for (let i = 0; i < filters.length; i++) {
                    modName = modName.replace(new RegExp(`(${filters[i].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})(?![^<]*>|[^<>]*<\/)`, "gi"), `<span class="highlighted">$1</span>`);
                    modDescription = modDescription.replace(/(<\/?(?:span)[^>]*>)|<[^>]+>/ig, '$1').replace(new RegExp(`(${filters[i].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})(?![^<]*>|[^<>]*<\/)`, "gi"), `<span class="highlighted">$1</span>`);
                    modAuthor = modAuthor.replace(new RegExp(`(${filters[i].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})(?![^<]*>|[^<>]*<\/)`, "gi"), `<span class="highlighted">$1</span>`);
                    modTags = modTags.replace(new RegExp(`(${filters[i].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})(?![^<]*>|[^<>]*<\/)`, "gi"), `<span class="highlighted">$1</span>`);
                }

                const $modElement = $("<div>").addClass("mod-card");
                const $modMain = $("<div>").addClass("mod-card-main");
                if (mod.iconLink) {
                    const $modIcon = $("<img>").attr("src", mod.iconLink);
                    $modMain.append($modIcon);
                }
                const $modTitle = $("<div>").addClass("bold").append(`${modName} ${i18n.t("generic.by")} ${modAuthor}`);
                const $modDescription = $("<div>").append(modDescription);
                const $modInfo = $("<div>").addClass("info").append().append($modTitle).append($modDescription);
                $modMain.append($modInfo);
                $modElement.append($modMain).append($("<div>").addClass("mod-card-tags").append(i18n.t("page.modsportal.tags") + ": ").append(modTags));
                const $anchor = $("<a>").attr("href", encodeURI(`/mods_portal/browse/${game.name}/${mod._id}`)).append($modElement).on("click", e => {
                    e.preventDefault();
                    window.history.replaceState(null, null, `/mods_portal/browse/${game.name}/${mod._id}`);
                    $filter.attr("placeholder", i18n.t("page.modsportal.filterversions"));
                    $filter.val("");
                    updateURL();
                    updateHeader();
                    updateModPage();
                    updateControlButton();
                    showPage($modPage);
                });
                $modsList.append($anchor);
                if (permission.includes("admin") || permission.includes("mods_edit")) {
                    const $buttons = $("<div>");
                    $buttons.append($("<a>").attr("href", `/mods_portal/mod/edit/${mod._id}`).append($("<button>").attr("type", "button").text(i18n.t("generic.edit"))));
                    if (permission.includes("admin")) {
                        const $deleteButton = $("<button>").attr("type", "button").text(i18n.t("generic.delete")).on("click", e => {
                            if (confirm(i18n.t("page.modsportal.deletemodconfirm", { mod: mod.name }))) {
                                $.ajax({
                                    url: `/api/v2/modsportal/mods/${mod._id}`,
                                    method: "DELETE",
                                    success: function(data) {
                                        window.location.reload();
                                    },
                                    error: function(xhr, status, err) {
                                        createError(xhr.responseJSON?.message ?? err);
                                    }
                                });
                            }
                        });
                        $buttons.append($deleteButton);
                    }
                    $modsList.append($buttons);
                }
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

            let filteredVersions = [];
            let filter = $filter.val();
            let filters = filter.split(" ").filter(n => n);
            if (filters.length) {
                for (let i = 0; i < filters.length; i++) {
                    const fMods = mod.versions.filter(e => {
                        return e.version.toLowerCase().includes(filters[i].toLowerCase()) || e.gameVersion?.toLowerCase()?.includes(filters[i].toLowerCase());
                    });
                    fMods.forEach((g) => {
                        if (!filteredVersions.includes(g)) filteredVersions.push(g);
                    })
                }
            }
            else filteredVersions = mod.versions;

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
            const $description = $("<div>").attr("id", "mod-description").append(await parse(mod.description));
            const $downloadsTable = $("<div>").attr("id", "downloads-table");
            const sortedMods = filteredVersions.toSorted((v1, v2) => {
                let v1split = v1.version.split(".").map(m => Number(m));
                let v2split = v2.version.split(".").map(m => Number(m));
                return ((v2split[0] - v1split[0]) * 100 + (v2split[1] - v1split[1]) * 10 + (v2split[2] - v1split[2]));
            });
            sortedMods.forEach(version => {
                let versionName = version.version;
                let gameVersion = version.gameVersion;
                for (let i = 0; i < filters.length; i++) {
                    versionName = versionName?.replace(new RegExp(`(${filters[i].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})(?![^<]*>|[^<>]*<\/)`, "gi"), `<span class="highlighted">$1</span>`);
                    gameVersion = gameVersion?.replace(new RegExp(`(${filters[i].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})(?![^<]*>|[^<>]*<\/)`, "gi"), `<span class="highlighted">$1</span>`);
                }

                const $downloadBlock = $("<div>").addClass("download");
                const $downloadInfo = $("<div>").addClass("download-info").append($(`<div>${i18n.t("page.modsportal.version")}: ${versionName}</div>`).addClass("download-version"));
                if (gameVersion) $downloadInfo.append($(`<div>${i18n.t("page.modsportal.gameversion")}: ${gameVersion}</div>`).addClass("download-game-version"));
                $downloadInfo.append($(`<div>${i18n.t("page.modsportal.uploaddate")}: ${new Date(version.uploadedAt).toLocaleString()}</div>`).addClass("download-mod-version"));
                $downloadBlock.append($downloadInfo);
                const $downloadButtons = $("<div>").addClass("download-buttons");
                const $shareButton = $("<button>").attr("type", "button").text(i18n.t("generic.share")).on("click", e => {
                    navigator.clipboard.writeText(staticUrl(encodeURI(`files/mods/${game.name}/${mod._id}/${version.version}/${mod.modId}`)));
                    createMessage(i18n.t("page.modsportal.shared"));
                });
                const $deleteButton = $("<button>").attr("type", "button").text(i18n.t("generic.delete")).on("click", e => {
                    if (confirm(i18n.t("page.modsportal.deleteversionconfirm", { version: version.version }))) {
                        $.ajax({
                            url: `/api/v2/modsportal/mods/${mod._id}/${stripHtml(version.version)}`,
                            method: "DELETE",
                            success: function(data) {
                                window.location.reload();
                            },
                            error: function(xhr, status, err) {
                                createError(xhr.responseJSON?.message ?? err);
                            }
                        });
                    }
                });
                const $downloadButton = $("<a>").attr("target", "_blank").attr("href", encodeURI(`/mods_portal/d/${game.name}/${mod._id}/${version.version}`)).append($("<button>").attr("type", "button").text(i18n.t("generic.download")));
                if (permission.includes("admin") || permission.includes("mods_edit")) $downloadButtons.append($deleteButton);
                $downloadButtons.append($shareButton).append($downloadButton);
                $downloadsTable.append($downloadBlock.append($downloadButtons));
            });
            $modPage.append($topBlock).append($description).append($downloadsTable);
        }

        function updateControlButton() {
            $filter.val("");
            if (URLParts.at(3)) {
                $filter.attr("placeholder", i18n.t("page.modsportal.filterversions"));
                $controlButton.attr("href", encodeURI(`/mods_portal/mod/update/${URLParts.at(3)}`)).text(i18n.t("page.modsportal.updatemod"));
            } else if (URLParts.at(2)) {
                $filter.attr("placeholder", i18n.t("page.modsportal.filtermods"));
                $controlButton.attr("href", encodeURI(`/mods_portal/mod/new?game=${URLParts.at(2)}`)).text(i18n.t("page.modsportal.createmod"));
            } else {
                $controlButton.attr("href", encodeURI(`/mods_portal/game/new`)).text(i18n.t("page.modsportal.addgame"));
            }
        }

        function stripHtml(html)
        {
            let tmp = document.createElement("DIV");
            tmp.innerHTML = html;
            return tmp.textContent || tmp.innerText || "";
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

        const $filter = $("#search-filter");
        const $controlButton = $("#control-button");

        const permission = $("#permission").val().split(" ");

        $filter.on("input", e => {
            updateGamesList();
            updateModsList();
            updateModPage();
        });

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