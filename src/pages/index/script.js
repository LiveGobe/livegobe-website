import $ from "jquery";

$(() => {
    $("#lang-en").on("click", (e) => {
        e.preventDefault();
        document.cookie = "lang=en";
        location.reload();
    });

    $("#lang-ru").on("click", (e) => {
        e.preventDefault();
        document.cookie = "lang=ru";
        location.reload();
    });

    $("#theme-light").on("click", (e) => {
        e.preventDefault();
        document.cookie = "theme=light";
        location.reload();
    });

    $("#theme-dark").on("click", (e) => {
        e.preventDefault();
        document.cookie = "theme=dark";
        location.reload();
    });
});