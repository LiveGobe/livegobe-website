import $ from "jquery";

$(() => {
    $("input[type=submit]").on("click", function(e) {
        e.preventDefault();
        const username = $("#username").val();
        const password = $("#password").val();
        const remember = $("#remember").is(":checked");
        const errorMessage = $("#error-message");
        const query = new URLSearchParams(window.location.search);
        const redirect = query.get("redirect") || "/";
        errorMessage.text("");
        errorMessage.hide();

        $.ajax({
            url: "/api/login",
            method: "POST",
            data: {
                username,
                password,
                remember
            },
            success: function(data) {
                if (data.success) {
                    window.location.href = redirect;
                } else {
                    errorMessage.show();
                    errorMessage.text(data.message);
                }
            },
            error: function(xhr, status, error) {
                errorMessage.show();
                errorMessage.text(error);
            }
        })
    });
});