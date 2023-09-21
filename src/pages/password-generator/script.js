import $ from "jquery";

$(() => {
    function stob(val) { return val == "true"}

    const passwordLength = $("#passwordlength");
    passwordLength.on("change", () => {
        localStorage.setItem("passwordlength", passwordLength.val());
    });
    passwordLength.val(localStorage.getItem("passwordlength") || passwordLength.val());

    const includeNumbers = $("#includenumbers");
    includeNumbers.on("click", () => {
        localStorage.setItem("includenumbers", includeNumbers.is(":checked"));
    });
    includeNumbers.prop("checked", stob(localStorage.getItem("includenumbers")));

    const includeUppercase = $("#includeuppercase");
    includeUppercase.on("click", () => {
        localStorage.setItem("includeuppercase", includeUppercase.is(":checked"));
    });
    includeUppercase.prop("checked", stob(localStorage.getItem("includeuppercase")));

    const includeSpecial = $("#includespecial");
    includeSpecial.on("click", () => {
        localStorage.setItem("includespecial", includeSpecial.is(":checked"));
    });
    includeSpecial.prop("checked", stob(localStorage.getItem("includespecial")));

    const copyToClipboard = $("#copytoclipboard");
    copyToClipboard.on("click", () => {
        localStorage.setItem("copytoclipboard", copyToClipboard.is(":checked"));
    });
    copyToClipboard.prop("checked", stob(localStorage.getItem("copytoclipboard")));

    function generatePass(length, charset) {
        let val = "";
        for (let i = 0; i < length; i++) {
            val += charset[Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000 * charset.length)]
        }

        return val;
    }

    $("#generate").on("click", (e) => {
        let length = Math.max(5, Math.min(75, $("#passwordlength").val()));
        let charset = "abcdefghijklmnopqrstuvwxyz";
        if (includeNumbers.is(":checked")) charset += "0123456789";
        if (includeUppercase.is(":checked")) charset += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        if (includeSpecial.is(":checked")) charset += "!@#$%^&*()-+_=[]{},./?<>";

        let password = generatePass(length, charset);
        $("#password").val(password);
        if (copyToClipboard.is(":checked")) navigator.clipboard.writeText(password);
    });
});