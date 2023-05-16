import $ from "jquery";
import i18n from "../../js/repack-locales";
import { staticUrl } from "../../js/utils";
import { io } from "socket.io-client";

await i18n.init();

$(() => {
    $("#header").text(i18n.t("test"));
    $("#img1").attr("src", staticUrl("images/AAA.jpg"));
    $("#img2").attr("src", staticUrl("images/BBB.png"));
    const socket = io();
    socket.onAny(event => {
        console.log(event);
    });

    socket.on("message", message => {
        console.log(message);
    });

    socket.on("connect_error", err => {
        console.log(err);
    })
})