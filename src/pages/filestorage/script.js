import { formatBytes, filenameValid, foldernameValid, formatTime } from "../../js/utils";
import $ from "jquery";
import "../../js/nav-sidebar";
import i18n from "../../js/repack-locales";

await i18n.init();

!function() {
    const createButton = $("#create-storage");
    /**
     * @typedef {Object} Storage
     * @prop {String} owner owner id
     * @prop {Number} size filestorage current size
     * @prop {Number} maxSize filestorage max size
     * @prop {Object[]} folders folders
     * @prop {String} folders[].name folder name
     * @prop {String} folders[].description folder description
     * @prop {String} folders[].path folder path
     * @prop {Object[]} files files
     * @prop {String} files[].name file name
     * @prop {String} files[].description file description
     * @prop {String} files[].path file path
     * @prop {Date} files[].date file upload date
     * @prop {Number} files[].size file size
     * @prop {Boolean} files[].private is file private or not
     * @prop {String} files[].md5 file md5 hash
     */

    /** @type {Storage} */
    let storage;

    if (createButton.length != 0) {
        createButton.on("click", function(e) {
            createButton.prop("disabled", true);
            $.ajax({
                url: "/api/v2/filestorage",
                method: "POST",
                data: {},
                success: function(data) {
                    window.location.reload();
                },
                error: function(xhr, status, err) {
                    let msg = xhr.responseJSON?.message ?? err;
                    let $messages = $("#filestorage-messages");
                    let ms = $messages.find(".message");
                    if (ms.length == 6) ms[5].remove();
                    let m = $("<div>").addClass(["message", "unselectable", "error"]).text(msg);
                    m.on("click", function(e) {
                        e.stopPropagation();
                        m.remove();
                    });
                    $messages.prepend(m);
                    createButton.prop("disabled", false);
                }
            })
        });
    }
    else {
        function loadStorage(s) {
            storage = s;

            function deselectAll(e) {
                if (!$selected) return;

                $selected.removeClass("selected");
                $selected = undefined;
                hideActions();
                hideInfo();
            }

            const $browse = $("#filestorage-browse");
            $browse.on("click", function(e) {
                deselectAll();
                removePreview();
            });

            $(document).on("keydown", function(e) {
                switch (e.keyCode) {
                    // Escape
                    case 27:
                        deselectAll();
                    break;
                    // F2
                    case 113:
                        if (!$selected || $selected.attr("id") === "back") return;
                        
                        if ($selected.hasClass("file")) {
                            $renameFile.trigger("click");
                        } else if ($selected.hasClass("folder")) {
                            $renameFolder.trigger("click");
                        }
                    break;
                    
                    // Delete
                    case 46:
                        if (!$selected || $selected.attr("id") === "back") return;
                    
                        if ($selected.hasClass("file")) {
                            $deleteFile.trigger("click");
                        } else if ($selected.hasClass("folder")) {
                            $deleteFolder.trigger("click");
                        }
                        break;
                    
                    // Enter
                    case 13:
                        if (!$selected) return;
                    
                        if ($selected.hasClass("file")) {
                            $showFile.trigger("click");
                        } else if ($selected.hasClass("folder")) {
                            if ($selected.attr("id") == "back") {
                                $selected.trigger("dblclick");
                            } else {
                                $openFolder.trigger("click");
                            }
                        }
                    break;
                }
            });

            function getFolderSize(name, path) {
                let size = 0;
                storage.files.forEach(file => {
                    if (file.path == path + name + "/") size += file.size;
                });
                storage.folders.forEach(folder => {
                    if (folder.path == path + name + "/") size += getFolderSize(folder.name, folder.path);
                });
                return size;
            }

            function getFilesCount(name, path) {
                let count = 0;
                storage.files.forEach(file => {
                    if (file.path == path + name + "/") count++;
                });
                storage.folders.forEach(folder => {
                    if (folder.path == path + name + "/") count += getFilesCount(folder.name, folder.path);
                });
                return count;
            }
            
            function showActions(element) {
                element.show();
                element.siblings().hide();
            }
            
            function showInfo(element) {
                element.show();
                element.siblings(":not(#info-section-main)").hide();
            }
            
            function hideInfo() {
                $infoFolder.hide();
                $infoFile.hide();
            }
            
            function hideActions() {
                $actionsFolder.hide();
                $actionsFile.hide();
                $actionsDefault.show();
            }

            function selectElement(element) {
                if (element.hasClass("selected")) return;
                $folders.find(".selected").removeClass("selected");
                $files.find(".selected").removeClass("selected");
                element.addClass("selected");
                $selected = element;
                if (element.hasClass("folder")) {
                    showActions($actionsFolder);
                    showInfo($infoFolder);
                }
                else if (element.hasClass("file")) {
                    showActions($actionsFile);
                    showInfo($infoFile);
                }
            }

            function createUploadMessage(message) {
                let m = $("<div>").addClass(["upload-message", "unselectable"])
                    .append($("<span>").attr("id", "upload-text").text(message))
                    .append($("<br>"))
                    .append($("<div>").attr("id", "upload-progress").text("0%"))
                    .append($("<progress>").attr("value", 0).attr("max", 100).addClass("upload-progress"))
                    .append($("<div>").attr("id", "upload-speed-time")
                        .append($("<span>").attr("id", "upload-speed").text("_"))
                        .append($("<span>").attr("id", "upload-time").text("_")));
                $uploads.append(m);
                return m;
            }

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
                let m = $("<div>").addClass(["message", "unselectable", "error"]).text(message);
                m.on("click", function(e) {
                    e.stopPropagation();
                    m.remove();
                });
                $messages.prepend(m);
            }

            function updateAvailableSize() {
                $availableSpace.text(availableSpace.replace("_", formatBytes(storage.maxSize - storage.size)).replace("_", formatBytes(storage.maxSize)));
            }

            function updatePath() {
                storage.path = decodeURI(window.location.pathname).replace("/filestorage/browse", "") + "/";
                storage.path = storage.path == "//" ? "/" : storage.path;
            }

            function updateFolderInfo(folder) {
                $infoFolderName.text(`${infoFolderName} ${folder.name}`);
                $infoFolderSize.text(`${infoFolderSize} ${formatBytes(getFolderSize(folder.name, folder.path))}`);
            }

            function updateFileInfo(file) {
                let $togglePrivate = $("<span>").attr("id", "toggle-private").addClass("unselectable").text(file.private ? "\u2713" : "\u2717").on("click", function(e) {

                    if ($selected.hasClass("processing")) return;
                    $selected.addClass("processing");
                    storage.files[storage.files.findIndex(n => n._id == file._id)].processing = true;
                    $.ajax({
                        url: "/api/v2/filestorage/file",
                        method: "PATCH",
                        data: {
                            file: {
                                id: file._id,
                                private: !file.private
                            }
                        },
                        success: function(data) {
                            let index = storage.files.findIndex(f => f.path == file.path && f.name == file.name);
                            storage.files[index].private = !file.private;
                            if (file._id == $selected?.attr("id")) updateFileInfo(storage.files[index]);
                            $(`#${file._id}`).removeClass("processing");
                            storage.files[storage.files.findIndex(n => n._id == file._id)].processing = false;
                        },
                        error: function(xhr, status, err) {
                            $(`#${file._id}`).removeClass("processing");
                            storage.files[storage.files.findIndex(n => n._id == file._id)].processing = false;
                            createError(xhr.responseJSON?.message ?? err);
                        }
                    });
                });

                $infoFileName.text(`${infoFileName} ${file.name}`);
                $infoFileSize.text(`${infoFileSize} ${formatBytes(file.size)}`);
                $infoFilePrivacy.text(infoFilePrivacy).append($togglePrivate);
                $infoFileDate.text(`${infoFileDate} ${new Date(file.date).toLocaleString()}`);
                $infoFileMd5.text(`${infoFileMd5} ${file.md5}`);
            }

            function updateFolders() {
                let filter = $("#search-field").val();
                storage.folders.sort((a, b) => { return a.name.localeCompare(b.name) });
                let folders = storage.folders;
                let filters = filter.split(" ").filter(n => n);
                if (filter.length) {
                    let filtered = [];
                    for (let i = 0; i < filters.length; i++) {
                        folders = storage.folders.filter(e => { return e.name.toLowerCase().includes(filters[i].toLowerCase()) });
                        folders.forEach((folder) => {
                            if (!filtered.includes(folder)) filtered.push(folder);
                        })
                    }
                    folders = filtered;
                }
                $selected = undefined;
                $folders.empty();

                if (storage.path != "/") {
                    let element = $("<div>").text("..").attr("id", "back").addClass(["folder", "unselectable"]).attr("title", i18n.t("filestorage.folder.back"));

                    element.on("click", function(e) {
                        e.stopPropagation();
                        selectElement(element);
                        hideInfo();
                    });

                    element.on("dblclick", function(e) {
                        window.history.replaceState(null, null, `/filestorage/browse${storage.path.substring(0, storage.path.lastIndexOf("/", storage.path.length - 2))}`);
                        hideInfo();
                        hideActions();
                        updatePath();
                        $searchFilter.val("");
                        updateFolders();
                        updateFiles();
                        removePreview();
                    });

                    $folders.append(element);
                }

                folders.forEach(folder => {
                    if (folder.path != storage.path) return;

                    let folderName = folder.name;
                    for (let i = 0; i < filters.length; i++) {
                        folderName = folderName.replace(new RegExp(`(${filters[i].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})(?![^<]*>|[^<>]*<\/)`, "gi"), `<span class="highlighted">$1</span>`);
                    }
                    
                    let element = $("<div>").attr("id", folder._id).html(folderName).addClass(["folder", "unselectable"]).attr("title", i18n.t("filestorage.folder.open", { 0: folder.name}));
                    if (storage.folders[storage.folders.findIndex(n => n._id == folder._id)].processing) element.addClass("processing");

                    element.on("click", function(e) {
                        e.stopPropagation();
                        updateFolderInfo(folder);
                        selectElement(element);
                    });

                    element.on("dblclick", function(e) {
                        if ($(`#${folder._id}`).hasClass("processing")) return;
                        window.history.pushState(null, null, `/filestorage/browse${storage.path}${encodeURI(folder.name)}`);
                        hideInfo();
                        hideActions();
                        updatePath();
                        $searchFilter.val("");
                        updateFolders();
                        updateFiles();
                        removePreview();
                    });
                    
                    $folders.append(element);
                });
            }

            function updateFiles() {
                let filter = $("#search-field").val();
                storage.files.sort((a, b) => { return a.name.localeCompare(b.name) });
                let files = storage.files;
                let filters = filter.split(" ").filter(n => n);
                if (filter.length) {
                    let filtered = [];
                    for (let i = 0; i < filters.length; i++) {
                        files = storage.files.filter(e => { return e.name.toLowerCase().includes(filters[i].toLowerCase()) });
                        files.forEach((file) => {
                            if (!filtered.includes(file)) filtered.push(file);
                        })
                    }
                    files = filtered;
                }
                $selected = undefined;
                $files.empty();
                
                files.forEach(file => {
                    if (file.path != storage.path) return;

                    let fileName = file.name;
                    for (let i = 0; i < filters.length; i++) {
                        fileName = fileName.replace(new RegExp(`(${filters[i].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')})(?![^<]*>|[^<>]*<\/)`, "gi"), `<span class="highlighted">$1</span>`);
                    }

                    let element = $("<div>").attr("id", file._id).html(fileName).addClass(["file", "unselectable"]).attr("title", i18n.t("filestorage.file.show", { 0: file.name }));
                    if (storage.files[storage.files.findIndex(n => n._id == file._id)].processing) element.addClass("processing");

                    element.on("click", function(e) {
                        e.stopPropagation();
                        updateFileInfo(file);
                        selectElement(element);
                        showPreview(file);
                    });

                    element.on("dblclick", function(e) {
                        if ($(`#${file._id}`).hasClass("processing")) return;
                        window.open(`/filestorage/v/${encodeURI(storage.owner)}/${encodeURI(file._id)}`, "_blank");
                    });
                    $files.append(element);

                });
            }

            function removePreview() {
                $("#preview-content").empty();
            }

            function showPreview(file) {
                removePreview();
                let $preview = $("#preview-content");
                let extension = file.name.split(".").pop();
                switch (extension) {
                    case "jpeg":
                    case "jpg":
                    case "png":
                    case "apng":
                    case "svg":
                    case "bmp":
                    case "ico":
                    case "gif":
                    $preview.append($("<img>").attr("width", "90%").attr("alt", file.name).attr("src", `/filestorage/r/${storage.owner}/${file._id}`));
                    break;
                    case "mp3":
                    case "wav":
                    case "ogg":
                    $preview.append($("<audio controls>").attr("width", "90%").attr("src", `/filestorage/r/${storage.owner}/${file._id}`));
                    break;
                    case "mp4":
                    case "webm":
                    $preview.append($("<video controls>").attr("controlslist", "nodownload").attr("width", "90%").attr("src", `/filestorage/r/${storage.owner}/${file._id}`));
                    break;
                }
            }

            const $availableSpace = $("#info-main-content span");
            const availableSpace = $("#info-main-content span").text();

            const $folders = $("#folders-list");
            const $files = $("#files-list");

            const $actionsDefault = $("#default-actions");
            const $actionsFolder = $("#folder-actions");
            const $actionsFile = $("#file-actions");

            const $infoFolder = $("#info-section-folder");
            const $infoFile = $("#info-section-file");

            const $infoFolderName = $("#info-folder-name");
            const infoFolderName = $infoFolderName.text() + ": ";
            const $infoFolderSize = $("#info-folder-size");
            const infoFolderSize = $infoFolderSize.text() + ": ";

            const $infoFileName = $("#info-file-name");
            const infoFileName = $infoFileName.text() + ": ";
            const $infoFileSize = $("#info-file-size");
            const infoFileSize = $infoFileSize.text() + ": ";
            const $infoFilePrivacy = $("#info-file-privacy");
            const infoFilePrivacy = $infoFilePrivacy.text() + ": ";
            const $infoFileDate = $("#info-file-date");
            const infoFileDate = $infoFileDate.text() + ": ";
            const $infoFileMd5 = $("#info-file-md5");
            const infoFileMd5 = $infoFileMd5.text() + ": ";

            const $messages = $("#filestorage-messages");
            const $uploads = $("#filestorage-uploads");

            const createFolderPrompt = $("#create-folder-prompt").val();
            const folderNameInvalid = $("#folder-name-invalid").val();
            const fileNameInvalid = $("#file-name-invalid").val();
            const filesNameInvalid = $("#files-name-invalid").val();
            const fileSizeToobig = $("#file-size-toobig").val();
            const filesSizeToobig = $("#files-size-toobig").val();
            const renameFolderPrompt = $("#rename-folder-prompt").val();
            const deleteFolderPrompt = $("#delete-folder-prompt").val();
            const renameFilePrompt = $("#rename-file-prompt").val();
            const fExists = $("#fexists").val();
            const filesExists = $("#files-exists").val();
            const moveFilePrompt = $("#move-file-prompt").val();
            const deleteFilePrompt = $("#delete-file-prompt").val();
            const copyFileLink = $("#copy-file-link").val();
            const copyPathMessage = $("#copy-path-message").val();

            const $searchFilter = $("#search-field");
            $searchFilter.on("input", function(e) {
                updateFolders();
                updateFiles();
            });

            const $copyPath = $("#copy-path");
            $copyPath.on("click", function(e) {
                navigator.clipboard.writeText(storage.path);
                createMessage(copyPathMessage);
            });

            const $createFolder = $("#action-create-folder");
            $createFolder.on("click", function(e) {
                let name = prompt(createFolderPrompt);
                if (!name) return;
                if (!foldernameValid(name)) return createError(folderNameInvalid);
                if (storage.folders.find(f => f.name == name && f.path == storage.path) || storage.files.find(f => f.name == name && f.path == storage.path)) return createError(fExists.replace("_", name));

                $.ajax({
                    url: "/api/v2/filestorage/folder",
                    method: "POST",
                    data: {
                        name: name,
                        path: storage.path
                    },
                    success: function(data) {
                        storage.folders.push(data.folder);
                        updateFolders();
                        createMessage(data.message);
                    },
                    error: function(xhr, status, err) {
                        createError(xhr.responseJSON?.message ?? err);
                    }
                })
            });

            // Uploads counter for safety
            let uploadsInProgress = 0;

            const $fileInput = $("#file-input");
            $fileInput.on("change", function(e) {
                let file = $fileInput[0].files[0];

                if (!file) return;
                if (!filenameValid(file.name)) {
                    $fileInput.val("");
                    return createError(fileNameInvalid);
                }
                if (storage.files.find(f => f.name == file.name && f.path == storage.path) || storage.folders.find(f => f.name == file.name && f.path == storage.path)) {
                    $fileInput.val("");
                    return createError(fExists.replace("_", file.name));
                }
                if (file.size + storage.size > storage.maxSize) {
                    $fileInput.val("");
                    return createError(fileSizeToobig);
                }

                let formData = new FormData();
                formData.append("file", file);
                formData.append("path", storage.path);
                formData.append("private", "true");

                let uploadHovered = false;
                let aborted = false;
                let loaded = 0, total = file.size, percent = 0;
                let startTime = Date.now();
                let $upload = createUploadMessage(file.name);
                let $progressText = $upload.find("#upload-progress");

                $upload.on("mouseenter", function() {
                    uploadHovered = true;
                    $progressText.text(formatBytes(loaded) + " / " + formatBytes(total));
                });
                $upload.on("mouseleave", function() {
                    uploadHovered = false;
                    $progressText.text(percent + "%");
                });
                uploadsInProgress += 1;

                $.ajax({
                    xhr: function() {
                        let xhr = new window.XMLHttpRequest();
                        xhr.upload.addEventListener("progress", function(e) {
                            if (e.lengthComputable) {
                                let elapsedTime = Date.now() - startTime;
                                loaded = e.loaded;
                                total = e.total;
                                let uploadSpeed = formatBytes(loaded / elapsedTime * 1000);
                                percent = Math.round((loaded / total) * 100);
                                let $progressText = $upload.find("#upload-progress");
                                let estimatedTime = (total - loaded) / loaded * elapsedTime / 1000;
                                if (!uploadHovered) $progressText.text(percent + "%");
                                else $progressText.text(formatBytes(loaded) + " / " + formatBytes(total));
                                $upload.find(".upload-progress").val(percent);
                                $upload.find("#upload-speed").text(`${uploadSpeed}/s`);
                                $upload.find("#upload-time").text(formatTime(estimatedTime));
                            }
                        });
                        $upload.on("click", function() {
                            if (loaded >= total) return;
                            aborted = true;
                            xhr.abort();
                        });
                        return xhr;
                    },
                    url: "/api/v2/filestorage/file",
                    method: "POST",
                    data: formData,
                    cache: false,
                    contentType: false,
                    processData: false,
                    timeout: 0,
                    success: function(data) {
                        storage.files.push(data.file);
                        storage.size += data.file.size;
                        updateAvailableSize();
                        updateFiles();
                        createMessage(data.message);
                    },
                    error: function(xhr, status, err) {
                        if (!aborted) createError(xhr.responseJSON?.message ?? err);
                    },
                    complete: function() {
                        $upload.remove();
                        $fileInput.val("");
                        uploadsInProgress -= 1;
                    }
                })
            });

            const $uploadFile = $("#action-upload-file");
            $uploadFile.on("click", function(e) {
                $fileInput.trigger("click");
            });

            const $filesInput = $("#files-input");
            $filesInput.on("change", function(e) {
                let files = [];
                for (let i = 0; i < $filesInput[0].files.length; i++) {
                    files.push($filesInput[0].files[i]);
                }

                if (!files.length) return;
                let s = 0;
                for (let i = 0; i < files.length; i++) {
                    if (!filenameValid(files[i].name)) {
                        $filesInput.val("");
                        return createError(filesNameInvalid);
                    }
                    if (storage.files.find(f => f.name == files[i].name && f.path == storage.path) || storage.folders.find(f => f.name == files[i].name && f.path == storage.path)) {
                        files.splice(i--, 1);
                        continue;
                    }
                    s += files[i].size;
                    if (s + storage.size > storage.maxSize) {
                        $filesInput.val("");
                        return createError(filesSizeToobig);
                    }
                }

                if (!files.length) {
                    $filesInput.val("");
                    return createError(filesExists);
                }

                let formData = new FormData();
                for (let i = 0; i < files.length; i++) {
                    formData.append("files", files[i]);
                }
                formData.append("path", storage.path);
                formData.append("private", "true");

                let text = "";
                for (let i = 0; i < files.length; i++) {
                    text += files[i].name + ", ";
                }
                text = text.substring(0, text.length - 2);

                let uploadHovered = false;
                let aborted = false;
                let loaded = 0, total = s, percent = 0;
                let startTime = Date.now();
                let $upload = createUploadMessage(text);
                let $progressText = $upload.find("#upload-progress");

                $upload.on("mouseenter", function() {
                    uploadHovered = true;
                    $progressText.text(formatBytes(loaded) + " / " + formatBytes(total));
                });
                $upload.on("mouseleave", function() {
                    uploadHovered = false;
                    $progressText.text(percent + "%");
                });
                uploadsInProgress += 1;

                $.ajax({
                    xhr: function() {
                        let xhr = new window.XMLHttpRequest();
                        xhr.upload.addEventListener("progress", function(e) {
                            if (e.lengthComputable) {
                                let elapsedTime = Date.now() - startTime;
                                loaded = e.loaded;
                                total = e.total;
                                let uploadSpeed = formatBytes(loaded / elapsedTime * 1000);
                                percent = Math.round((loaded / total) * 100);
                                let estimatedTime = (total - loaded) / loaded * elapsedTime / 1000;
                                let $progressText = $upload.find("#upload-progress");
                                if (!uploadHovered) $progressText.text(percent + "%");
                                else $progressText.text(formatBytes(loaded) + " / " + formatBytes(total));
                                $upload.find(".upload-progress").val(percent);
                                $upload.find("#upload-speed").text(`${uploadSpeed}/s`);
                                $upload.find("#upload-time").text(formatTime(estimatedTime));
                            }
                        });
                        $upload.on("click", function() {
                            if (loaded >= total) return;
                            aborted = true;
                            xhr.abort();
                        });
                        return xhr;
                    },
                    url: "/api/v2/filestorage/file",
                    method: "POST",
                    data: formData,
                    cache: false,
                    contentType: false,
                    processData: false,
                    timeout: 0,
                    success: function(data) {
                        storage.files = storage.files.concat(data.files);
                        data.files.forEach(f => storage.size += f.size);
                        updateFiles();
                        updateAvailableSize();
                        createMessage(data.message);
                    },
                    error: function(xhr, status, err) {
                        if (!aborted) createError(xhr.responseJSON?.message ?? err);
                    },
                    complete: function() {
                        $upload.remove();
                        $filesInput.val("");
                        uploadsInProgress -= 1;
                    }
                })
            });

            const $uploadFiles = $("#action-upload-files");
            $uploadFiles.on("click", function(e) {
                $filesInput.trigger("click");
            });

            const $openFolder = $("#action-open-folder");
            $openFolder.on("click", function(e) {
                if ($selected.hasClass("processing")) return;
                $selected.trigger("dblclick");
            });

            const $renameFolder = $("#action-rename-folder");
            $renameFolder.on("click", function(e) {
                let element = $selected;
                if (element.hasClass("processing")) return;
                if (element.attr("id") == "back") return;
                let folder = storage.folders.find(f => f._id == element.attr("id"));
                let name = prompt(renameFolderPrompt, folder.name);

                if (!name) return;
                if (!foldernameValid(name)) return createError(folderNameInvalid);
                if (storage.folders.find(f => f.name == name && f.path == storage.path) || storage.files.find(f => f.name == name && f.path == storage.path)) return createError(fExists.replace("_", name));

                element.addClass("processing");
                storage.folders[storage.folders.findIndex(n => n._id == folder._id)].processing = true;
                $.ajax({
                    url: "/api/v2/filestorage/folder",
                    method: "PATCH",
                    data: {
                        folder: {
                            id: folder._id,
                            name: name
                        }
                    },
                    success: function(data) {
                        let index = storage.folders.findIndex(f => f._id == folder._id);
                        storage.folders.forEach(f => {
                            if (f.path.startsWith(storage.folders[index].path + storage.folders[index].name + "/")) {
                                f.path = f.path.replace(storage.folders[index].path + storage.folders[index].name + "/", storage.folders[index].path + name + "/");
                            }
                        });
                        storage.files.forEach(f => {
                            if (f.path.startsWith(storage.folders[index].path + storage.folders[index].name + "/")) {
                                f.path = f.path.replace(storage.folders[index].path + storage.folders[index].name + "/", storage.folders[index].path + name + "/");
                            }
                        });
                        storage.folders[index].name = name;
                        if ($selected?.attr("id") == folder._id) deselectAll();
                        updateFolders();
                        createMessage(data.message);
                        $(`#${folder._id}`).removeClass("processing");
                        storage.folders[storage.folders.findIndex(n => n._id == folder._id)].processing = false;
                    },
                    error: function(xhr, status, err) {
                        $(`#${folder._id}`).removeClass("processing");
                        storage.folders[storage.folders.findIndex(n => n._id == folder._id)].processing = false;
                        createError(xhr.responseJSON?.message ?? err);
                    }
                });
            });

            const $deleteFolder = $("#action-delete-folder");
            $deleteFolder.on("click", function(e) {
                let element = $selected;
                if (element.hasClass("processing")) return;
                if (element.attr("id") == "back") return;
                let folder = storage.folders.find(f => f._id == element.attr("id"));
                let count = getFilesCount(folder.name, folder.path);
                let del = true;
                if (count > 0) del = confirm(`${deleteFolderPrompt.replace("_", count)}`);
                if (!del) return;

                element.addClass("processing");
                storage.folders[storage.folders.findIndex(n => n._id == folder._id)].processing = true;
                $.ajax({
                    url: "/api/v2/filestorage/folder",
                    method: "DELETE",
                    data: {
                        folder: {
                            id: folder._id
                        }
                    },
                    success: function(data) {
                        let index = storage.folders.findIndex(f => f._id == folder._id);
                        for (let i = index + 1; i < storage.folders.length; i++) {
                            if (storage.folders[i].path.startsWith(storage.folders[index].path + storage.folders[index].name + "/")) {
                                storage.folders.splice(i, 1);
                                i--;
                            }
                        }
                        for (let i = 0; i < storage.files.length; i++) {
                            if (storage.files[i].path.startsWith(storage.folders[index].path + storage.folders[index].name + "/")) {
                                storage.size -= storage.files[i].size;
                                storage.files.splice(i, 1);
                                i--;
                            }
                        }
                        storage.folders.splice(index, 1);
                        if ($selected?.attr("id") == folder._id) deselectAll();
                        updateFolders();
                        updateAvailableSize();
                        createMessage(data.message);
                        $(`#${folder._id}`).removeClass("processing");
                    },
                    error: function(xhr, status, err) {
                        $(`#${folder._id}`).removeClass("processing");
                        storage.folders[storage.folders.findIndex(n => n._id == folder._id)].processing = false;
                        createError(xhr.responseJSON?.message ?? err);
                    }
                });
            });

            const $showFile = $("#action-show-file");
            $showFile.on("click", function(e) {
                let element = $selected;
                if (element.hasClass("processing")) return;
                let file = storage.files.find(f => f._id == element.attr("id"));
                window.open(`/filestorage/v/${encodeURI(storage.owner)}/${encodeURI(file._id)}`, "_blank");
            });

            const $downloadFile = $("#action-download-file");
            $downloadFile.on("click", function(e) {
                let element = $selected;
                if (element.hasClass("processing")) return;
                let file = storage.files.find(f => f._id == element.attr("id"));
                window.open(`/filestorage/d/${encodeURI(storage.owner)}/${encodeURI(file._id)}`, "_blank");
            });

            const $shareFile = $("#action-share-file");
            $shareFile.on("click", function(e) {
                let element = $selected;
                if (element.hasClass("processing")) return;
                let file = storage.files.find(f => f._id == element.attr("id"));
                navigator.clipboard.writeText(`${window.location.origin}/filestorage/v/${encodeURI(storage.owner)}/${encodeURI(file._id)}`);
                createMessage(copyFileLink);
            });

            const $renameFile = $("#action-rename-file");
            $renameFile.on("click", function(e) {
                let element = $selected;
                if (element.hasClass("processing")) return;
                let file = storage.files.find(f => f._id == element.attr("id"));
                let name = prompt(renameFilePrompt, file.name);

                if (!name) return;
                if (!filenameValid(name)) return createError(fileNameInvalid);
                if (storage.files.find(f => f.name == name && f.path == storage.path) || storage.folders.find(f => f.name == name && f.path == storage.path)) return createError(fExists.replace("_", name));

                element.addClass("processing");
                storage.files[storage.files.findIndex(n => n._id == file._id)].processing = true;
                $.ajax({
                    url: "/api/v2/filestorage/file",
                    method: "PATCH",
                    data: {
                        file: {
                            id: file._id,
                            name: name
                        }
                    },
                    success: function(data) {
                        let index = storage.files.findIndex(f => f._id == file._id);
                        storage.files[index].name = name;
                        if ($selected?.attr("id") == file._id) deselectAll();
                        updateFiles();
                        createMessage(data.message);
                        $(`#${file._id}`).removeClass("processing");
                        storage.files[storage.files.findIndex(n => n._id == file._id)].processing = false;
                    },
                    error: function(xhr, status, err) {
                        $(`#${file._id}`).removeClass("processing");
                        storage.files[storage.files.findIndex(n => n._id == file._id)].processing = false;
                        createError(xhr.responseJSON?.message ?? err);
                    }
                });
            });

            const $moveFile = $("#action-move-file");
            $moveFile.on("click", function(e) {
                let element = $selected;
                if (element.hasClass("processing")) return;
                let file = storage.files.find(f => f._id == element.attr("id"));
                let path = decodeURI(prompt(moveFilePrompt, storage.path));

                if (!path) return;
                if (!path.startsWith("/")) path = "/" + path;
                if (!path.endsWith("/")) path += "/";

                element.addClass("processing");
                storage.files[storage.files.findIndex(n => n._id == file._id)].processing = true;
                $.ajax({
                    url: "/api/v2/filestorage/file",
                    method: "PATCH",
                    data: {
                        file: {
                            id: file._id,
                            path: path
                        }
                    },
                    success: function(data) {
                        let index = storage.files.findIndex(f => f._id == file._id);
                        storage.files[index].path = path;
                        if ($selected?.attr("id") == file._id) deselectAll();
                        updateFiles();
                        createMessage(data.message);
                        $(`#${file._id}`).removeClass("processing");
                        storage.files[storage.files.findIndex(n => n._id == file._id)].processing = false;
                    },
                    error: function(xhr, status, err) {
                        $(`#${file._id}`).removeClass("processing");
                        storage.files[storage.files.findIndex(n => n._id == file._id)].processing = false;
                        createError(xhr.responseJSON?.message ?? err);
                    }
                });
            });

            const $deleteFile = $("#action-delete-file");
            $deleteFile.on("click", function(e) {
                let element = $selected;
                if (element.hasClass("processing")) return;
                let file = storage.files.find(f => f._id == element.attr("id"));

                if (!confirm(deleteFilePrompt.replace("_", file.name))) return;

                element.addClass("processing");
                storage.files[storage.files.findIndex(n => n._id == file._id)].processing = true;
                $.ajax({
                    url: "/api/v2/filestorage/file",
                    method: "DELETE",
                    data: {
                        file: {
                            id: file._id
                        }
                    },
                    success: function(data) {
                        let index = storage.files.findIndex(f => f._id == file._id);
                        storage.size -= storage.files[index].size;
                        storage.files.splice(index, 1);
                        if ($selected?.attr("id") == file._id) {
                            deselectAll();
                            removePreview();
                        }
                        updateFiles();
                        updateAvailableSize();
                        createMessage(data.message);
                        $(`#${file._id}`).removeClass("processing");
                    },
                    error: function(xhr, status, err) {
                        $(`#${file._id}`).removeClass("processing");
                        storage.files[storage.files.findIndex(n => n._id == file._id)].processing = false;
                        createError(xhr.responseJSON?.message ?? err);
                    }
                });
            });

            /**
             * @type {JQuery<HTMLElement>}
             */
            let $selected = undefined;

            updatePath();
            if (storage.path != "/" && !storage.folders.find(f => f.path == storage.path.split("/").slice(0, -2).join("/") + "/" && f.name == storage.path.split("/").slice(-2)[0])) {
                window.history.pushState(null, null, "/filestorage/browse");
                updatePath();
            }
            updateFolders();
            updateFiles();
            updateAvailableSize();

            window.onbeforeunload = () => { if (uploadsInProgress > 0) return "Prevent" }
        }

        $.ajax({
            url: "/api/v2/filestorage",
            method: "GET",
            success: function(data) {
                loadStorage(data.storage);
            },
            error: function(xhr, status, err) {
                createError(xhr.responseJSON?.message ?? err);
            }
        })
    }
}();