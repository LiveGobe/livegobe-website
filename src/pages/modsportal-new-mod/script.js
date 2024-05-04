import $ from "jquery";
import i18n from "../../js/repack-locales";
import { createError } from "../../js/utils";

await i18n.init();

$(() => {
    const $gameSelect = $("#game-select");
    const $modName = $("#mod-name");
    const $modAuthor = $("#mod-author");
    const $modDescription = $("#mod-description");
    const $modId = $("#mod-id");
    const $modVersion = $("#mod-version");
    const $gameVersion = $("#game-version");
    const $modTags = $("#mod-tags");
    const $imageUpload = $("#image-upload");
    const $fileUpload = $("#file-upload");
    const $preview = $("#preview");
    const $submit = $("input[type=submit]");

    function updatePreview() {
        $preview.empty();
        const $topBlock = $("<div>").attr("id", "mod-header");
        const $infoBlock = $("<div>").attr("id", "mod-info");
        $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.title"))).append(": ").append($modName.val()));
        $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.author"))).append(": ").append($modAuthor.val()));
        $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.modid"))).append(": ").append($modId.val()));
        $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.latestversion"))).append(": ").append($modVersion.val()));
        if ($gameVersion.val()) $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.gameversion"))).append(": ").append($gameVersion.val()));
        $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.lastupload"))).append(": ").append(new Date().toLocaleString()));
        $infoBlock.append($("<div>").append($("<span>").addClass("bold").append(i18n.t("page.modsportal.tags"))).append(": ").append($modTags.val().split(" ").join(", ")));
        $topBlock.append($infoBlock)
        if ($imageUpload.val()) $topBlock.append($("<img>").attr("src", URL.createObjectURL($imageUpload.prop("files")[0])));
        const $description = $("<div>").attr("id", "mod-description").append($modDescription.val());
        const $downloadsTable = $("<div>").attr("id", "downloads-table");
        const $downloadBlock = $("<div>").addClass("download");
        const $downloadInfo = $("<div>").addClass("download-info").append($(`<div>${i18n.t("page.modsportal.version")}: ${$modVersion.val()}</div>`).addClass("download-version"));
        if ($gameVersion.val()) $downloadInfo.append($(`<div>${i18n.t("page.modsportal.gameversion")}: ${$gameVersion.val()}</div>`).addClass("download-game-version"));
        $downloadInfo.append($(`<div>${i18n.t("page.modsportal.uploaddate")}: ${new Date().toLocaleString()}</div>`).addClass("download-mod-version"));
        $downloadBlock.append($downloadInfo);
        const $downloadButtons = $("<div>").addClass("download-buttons");
        const $shareButton = $("<button>").attr("type", "button").text(i18n.t("generic.share"));
        const $downloadButton = $("<a>").attr("target", "_blank").on("click", e => e.preventDefault()).append($("<button>").attr("type", "button").text(i18n.t("generic.download")));
        $downloadButtons.append($shareButton).append($downloadButton);
        $downloadsTable.append($downloadBlock.append($downloadButtons));
        $preview.append($topBlock).append($description).append($downloadsTable);
    }

    $modName.on("input", e => updatePreview());
    $modAuthor.on("input", e => updatePreview());
    $modDescription.on("input", e => updatePreview());
    $modId.on("input", e => updatePreview());
    $modVersion.on("input", e => updatePreview());
    $gameVersion.on("input", e => updatePreview());
    $modTags.on("input", e => updatePreview());
    $imageUpload.on("change", e => updatePreview());

    $fileUpload.on("change", e => {
        $modId.val($fileUpload.val().split(/\/|\\/).at(-1));
        updatePreview();
    });

    updatePreview();

    $submit.on("click", e => {
        e.preventDefault();

        const formData = new FormData();
        formData.append("file", $fileUpload.prop("files")[0]);
        formData.append("image", $imageUpload.prop("files")[0]);
        formData.append("name", $modName.val());
        formData.append("author", $modAuthor.val());
        formData.append("description", $modDescription.val());
        formData.append("fileName", $modId.val());
        formData.append("modVersion", $modVersion.val());
        formData.append("gameVersion", $gameVersion.val());
        formData.append("tags", $modTags.val());

        $.ajax({
            url: `/api/v2/modsportal/games/${$gameSelect.val()}/mods`,
            method: "POST",
            data: formData,
            contentType: false,
            processData: false,
            success: function(data) {
                console.log(data);
                window.open(`/mods_portal/browse/${$gameSelect.val()}/${data.mod._id}`, "_self");
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            }
        });
    });
});