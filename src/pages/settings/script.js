import $ from "jquery";
import i18n from "../../js/repack-locales";

await i18n.init();

$(() => {
    const $displayName = $("#display-name");
    const $changeName = $("#change-name");
    const $apiKey = $("#api-key");
    const $apiKeyReveal = $("#api-key-reveal");
    const $apiKeyCopy = $("#api-key-copy");
    const $apiKeyRegenerate = $("#api-key-regenerate");
    const $showFilePreview = $("#show-file-preview");
    const $messages = $("#messages");

    function createMessage(message) {
        let ms = $messages.find(".message");
        if (ms.length == 6) ms.last().trigger("click");
        let m = $("<div>").addClass(["message", "unselectable"]).text(message);
        let timeout = setTimeout(() => {
            m.animate({ opacity: 0 }, 1000, () => { m.trigger("click") });
        }, 10000);
        m.on("click", function(e) {
            clearTimeout(timeout);
            e.stopPropagation();
            m.remove();
        });
        $messages.prepend(m);
    }

    function createError(message) {
        let ms = $messages.find(".message");
        if (ms.length == 6) ms[5].remove();
        let m = $("<div>").addClass(["message", "error", "unselectable"]).text(message);
        m.on("click", function(e) {
            e.stopPropagation();
            m.remove();
        });
        $messages.prepend(m);
    }
    
    function stob(val) { return val == "true"}

    $changeName.on("click", e => {
        const name = $displayName.val();
        const newName = prompt(i18n.t("page.settings.displayname.message"), name);

        if (newName == name || !newName) return;
        $changeName.prop("disabled", true);

        $.ajax({
            url: "/api/v2/settings/name",
            method: "PATCH",
            data: {
                name: newName
            },
            success: function(data) {
                createMessage(data.message);
                $displayName.val(newName);
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            },
            complete: function() {
                $changeName.prop("disabled", false);
            }
        });
    });

    $apiKeyReveal.on("click", e => {
        if ($apiKey.val()) return;

        $apiKeyReveal.prop("disabled", true);
        $apiKeyCopy.prop("disabled", true);
        $apiKeyRegenerate.prop("disabled", true);

        $.ajax({
            url: "/api/v2/settings/apikey",
            method: "GET",
            success: function(data) {
                $apiKey.val(data.apikey);
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            },
            complete: function() {
                $apiKeyReveal.prop("disabled", false);
                $apiKeyCopy.prop("disabled", false);
                $apiKeyRegenerate.prop("disabled", false);
            }
        });
    });

    $apiKeyCopy.on("click", e => {
        if ($apiKey.val()) {
            navigator.clipboard.writeText($apiKey.val());
            createMessage(i18n.t("page.settings.api.copymessage"));
            return;
        }

        $apiKeyReveal.prop("disabled", true);
        $apiKeyCopy.prop("disabled", true);
        $apiKeyRegenerate.prop("disabled", true);

        $.ajax({
            url: "/api/v2/settings/apikey",
            method: "GET",
            success: function(data) {
                createMessage(i18n.t("page.settings.api.copymessage"));
                navigator.clipboard.writeText(data.apikey);
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            },
            complete: function() {
                $apiKeyReveal.prop("disabled", false);
                $apiKeyCopy.prop("disabled", false);
                $apiKeyRegenerate.prop("disabled", false);
            }
        });
    });

    $apiKeyRegenerate.on("click", e => {
        if (!confirm(i18n.t("page.settings.api.confirm"))) return;
        
        $apiKeyReveal.prop("disabled", true);
        $apiKeyCopy.prop("disabled", true);
        $apiKeyRegenerate.prop("disabled", true);

        $.ajax({
            url: "/api/v2/settings/apikey",
            method: "POST",
            success: function(data) {
                createMessage(data.message);
                $apiKey.val("")
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            },
            complete: function() {
                $apiKeyReveal.prop("disabled", false);
                $apiKeyCopy.prop("disabled", false);
                $apiKeyRegenerate.prop("disabled", false);
            }
        });
    });

    $showFilePreview.on("click", () => {
        localStorage.setItem("showfilepreview", $showFilePreview.is(":checked"));
    });
    
    $showFilePreview.prop("checked", stob(localStorage.getItem("showfilepreview")));
    $showFilePreview.prop("disabled", false);
});