import $ from "jquery";
import i18n from "../../js/repack-locales";
import { createError } from "../../js/utils";

await i18n.init();

$(() => {
    const $gameName = $("#game-name");
    const $imageUpload = $("#image-upload");
    const $submit = $("input[type=submit]");

    $gameName.on("input", e => {
        $("#game-card-name").text($gameName.val());
    });

    $imageUpload.on("change", e => {
        $("#game-card img").attr("src", URL.createObjectURL($imageUpload.prop("files")[0]));
    });

    $submit.on("click", e => {
        e.preventDefault();

        const formData = new FormData();
        formData.append("file", $imageUpload.prop("files")[0]);
        formData.append("name", $gameName.val());

        $.ajax({
            url: "/api/v2/modsportal/games",
            method: "POST",
            data: formData,
            contentType: false,
            processData: false,
            success: function(data) {
                window.open("/mods_portal/browse", "_self");
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            }
        });
    });
});