import $ from "jquery";

$(() => {
    function generatePass(length, charset) {
        let val = "";
        for (let i = 0; i < length; i++) {
            val += charset.charAt(Math.floor(Math.random() * charset.length));
        }

        return val;
    }

    $("#generate").on("click", (e) => {
        let length = Math.max(5, Math.min(75, $("#passwordlength").val()));
        let charset = "abcdefghijklmnopqrstuvwxyz";
        if ($("#includenumbers").is(":checked")) charset += "0123456789";
        if ($("#includeuppercase").is(":checked")) charset += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if ($("#includespecial").is(":checked")) charset += "!@#$%^&*()-+_=[]{},./?<>";

        let password = generatePass(length, charset);
        $("#password").val(password);
        if ($("#copytoclipboard").is(":checked")) navigator.clipboard.writeText(password);
    });
});