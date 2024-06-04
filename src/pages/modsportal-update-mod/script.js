import $ from "jquery";
import i18n from "../../js/repack-locales";
import { createError } from "../../js/utils";

await i18n.init();

$(() => {
    const $modName = $("#mod-name");
    const $modVersion = $("#mod-version");
    const $gameVersion = $("#game-version");
    const $fileUpload = $("#file-upload");
    const $submit = $("input[type=submit]");
    
    $submit.on("click", e => {
        e.preventDefault();

        const formData = new FormData();
        formData.append("file", $fileUpload.prop("files")[0]);
        formData.append("modVersion", $modVersion.val());
        formData.append("gameVersion", $gameVersion.val());

        $.ajax({
            url: `/api/v2/modsportal/mods/${decodeURI(window.location.pathname).split("/").filter(f => f != "").at(-1)}`,
            method: "POST",
            data: formData,
            contentType: false,
            processData: false,
            success: function(data) {
                window.open(`/mods_portal/browse/${$modName.val()}/${data.mod._id}`, "_self");
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            }
        });
    });
});