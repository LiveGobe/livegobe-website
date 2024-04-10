import $ from "jquery";
import i18n from "../../js/repack-locales";
import { formatBytes, reverseFormatBytes } from "../../js/utils";

await i18n.init();

$(() => {
    const $mainSectionButton = $("#main");
    const $userSectionButton = $("#user");
    const $filestorageSectionButton = $("#filestorage");
    const $mainStats = $("#main-stats");
    const $userStats = $("#user-stats");
    const $filestorageStats = $("#filestorage-stats");
    const $usersList = $("#users");
    const $usersRefreshButton = $("#users-refresh-button");
    const $idInput = $("#id-input");
    const $usernameInput = $("#username-input");
    const $nameInput = $("#name-input");
    const $userSettings = $("#user-settings");
    const $userSave = $("#user-save");
    const $permissions = $("#permissions");
    const $userId = $("#user-id");
    const $userIdInput = $("#user-id-input");
    const $filestorageRefreshButton = $("#filestorage-refresh-button");
    const $filestorageSettings = $("#filestorage-settings");
    const $ownerId = $("#owner-id");
    const $filestorageId = $("#filestorage-id");
    const $filestorageSize = $("#filestorage-size");
    const $filestorageMaxSize = $("#filestorage-maxsize");
    const $filestorageSave = $("#filestorage-save");
    const $messages = $("#messages");
    
    function createMessage(message) {
        let ms = $messages.find(".message");
        if (ms.length == 6) ms.last().trigger("click");
        let m = $("<div>").addClass(["message", "unselectable" ]).text(message);
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

    function hideAll() {
        $mainStats.hide();
        $userStats.hide();
        $filestorageStats.hide();
        $userSettings.hide();
        $("ul > div").removeClass("selected");
        $filestorageSettings.hide();
        $mainSectionButton.removeClass("active");
        $userSectionButton.removeClass("active");
        $filestorageSectionButton.removeClass("active");
    }

    function showSection(section, button) {
        hideAll();
        section.show();
        button.addClass("active");
    }

    $mainSectionButton.on("click", (e) => {
        if ($mainSectionButton.hasClass("active")) return;
        showSection($mainStats, $mainSectionButton);
    });

    $userSectionButton.on("click", (e) => {
        if ($userSectionButton.hasClass("active")) return;
        showSection($userStats, $userSectionButton);
    });

    $filestorageSectionButton.on("click", (e) => {
        if ($filestorageSectionButton.hasClass("active")) return;
        showSection($filestorageStats, $filestorageSectionButton);
    });

    $usersRefreshButton.on("click", (e) => {
        if ($usersRefreshButton.prop("disabled")) return;

        $usersList.empty();
        $usersRefreshButton.prop("disabled", true);
        $.ajax({
            url: "/api/v2/users",
            method: "GET",
            data: {
                id: $idInput.val(),
                username: $usernameInput.val(),
                name: $nameInput.val()
            },
            success: function(data) {
                if (!data.users?.length) {
                    $usersList.append(`<div>${i18n.t("page.admin.user.none")}`);
                    return;
                }

                for (let i = 0; i < data.users?.length; i++) {
                    const element = $("<div>").attr("data-username", data.users[i].username).addClass("pointer").attr("id", data.users[i]._id).text(`${i + 1}. ${data.users[i].name} (${data.users[i].username})`).on("click", (e) => {
                        $userSettings.show();
                        $userId.val(e.target.id);
                        $("ul > div").removeClass("selected");
                        $(`#${e.target.id}`).addClass("selected");
                        const permissions = $permissions.val(data.users[i].permissions.join(" ")).val();
                        $permissions.on("input", (e) => {
                            if (permissions != $permissions.val().trimStart().trimEnd().replace(/[ ]+/, " ")) $userSave.prop("disabled", false);
                            else $userSave.prop("disabled", true);
                        });
                    });
                    $usersList.append(element);
                }
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            },
            complete: function() {
                $usersRefreshButton.prop("disabled", false);
            }
        });
    });

    $userSave.on("click", (e) => {
        if ($userSave.prop("disabled")) return;

        const permissions = $permissions.val().split(/[ ]+/);
        $userSave.prop("disabled", true);
        $permissions.prop("disabled", true);
        $.ajax({
            url: `/api/v2/users/${$(".selected").attr("data-username")}/permissions`,
            method: "PATCH",
            data: {
                permissions
            },
            success: function(data) {
                if ($userSectionButton.hasClass("active")) {
                    $usersList.empty();
                    showSection($userStats, $userSectionButton);
                }
                $userSave.prop("disabled", true);
                createMessage(data.message);
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            },
            complete: function() {
                $permissions.prop("disabled", false);
            }
        });
    });

    $filestorageRefreshButton.on("click", (e) => {
        if ($filestorageRefreshButton.prop("disabled")) return;

        $filestorageRefreshButton.prop("disabled", true);
        $.ajax({
            url: `/api/v2/users/filestorage`,
            method: "GET",
            data: {
                id: $userIdInput.val()
            },
            success: function(data) {
                data = data.storage;
                $filestorageSettings.show();
                $ownerId.val(data.owner._id);
                $filestorageId.val(data._id);
                $filestorageSize.val(formatBytes(data.size));
                $filestorageMaxSize.val(formatBytes(data.maxSize));
                const maxSize = $filestorageMaxSize.val();
                $filestorageMaxSize.on("input", (e) => {
                    if (maxSize != $filestorageMaxSize.val()) $filestorageSave.prop("disabled", false);
                    else $filestorageSave.prop("disabled", true);
                });
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            },
            complete: function() {
                $filestorageRefreshButton.prop("disabled", false);
            }
        });
    });

    $filestorageSave.on("click", (e) => {
        if ($filestorageSave.prop("disabled")) return;

        const maxSize = reverseFormatBytes($filestorageMaxSize.val());
        $filestorageSave.prop("disabled", true);
        $filestorageMaxSize.prop("disabled", true);
        $.ajax({
            url: `/api/v2/users/filestorage`,
            method: "PATCH",
            data: {
                id: $filestorageId.val(),
                maxSize
            },
            success: function(data) {
                if ($filestorageSectionButton.hasClass("active")) {
                    showSection($filestorageStats, $filestorageSectionButton);
                }
                $filestorageSave.prop("disabled", true);
                createMessage(data.message);
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            },
            complete: function() {
                $filestorageMaxSize.prop("disabled", false);
            }
        });
    });
});