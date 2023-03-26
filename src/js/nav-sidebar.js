import $ from "jquery";

!function() {
    const sidebar = $("#navigation-sidebar");

    $("#close-navigation").on("click", function(e) {
        sidebar.hide();
    });

    $("#open-navigation").on("click", function(e) {
        sidebar.show();
    });

    $("#theme-switch").on("click", function() {
        let $body = $("body");
        switch ($body.attr("data-theme")) {
            case "light":
                $body.attr("data-theme", "dark");
            break;
            case "dark":
                $body.attr("data-theme", "light");
            break;
            default:
                $body.attr("data-theme", "light");
            break;
        }
        document.cookie = "theme=" + $body.attr("data-theme");
    });
}();