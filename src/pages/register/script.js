import $ from "jquery";
import i18n from "../../js/repack-locales";

await i18n.init();

$(() => {
    const $submit = $("input[type=submit]");
    const query = new URLSearchParams(window.location.search);
    const queryKey = query.get("key");
    if (queryKey) $("#key").val(queryKey);

    $submit.on("click", function(e) {
        e.preventDefault();
        const username = $("#username").val();
        const name = $("#name").val();
        const password = $("#password").val();
        const passwordConfirm = $("#password-confirm").val();
        const key = $("#key").val();
        const errorMessage = $("#error-message");
        errorMessage.text("");
        errorMessage.hide();
        
        if (password != passwordConfirm) {
            errorMessage.show();
            errorMessage.text(i18n.t("page.register.passwordmismatch"));
            return
        }

        $submit.prop("disabled", true);
        
        $.ajax({
            url: "/api/register",
            method: "POST",
            data: {
                username,
                name,
                password,
                key
            },
            success: function(data) {
                window.location.href = "/login";
            },
            error: function(xhr, status, error) {
                $submit.prop("disabled", false);
                errorMessage.show();
                errorMessage.text(xhr.responseJSON?.message ?? error);
            }
        })
    });
});