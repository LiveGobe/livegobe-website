const express = require("express");
const router = express.Router();
const fs = require("node:fs");
const path = require("node:path");
const utils = require("../../bin/utils");
const config = require("../../config");
const uuid = require("uuid");
const mongoose = require("mongoose");
const sharp = require("sharp");
const marked = require("marked");
const sanitize = require("isomorphic-dompurify").sanitize;
const fileUpload = require("express-fileupload");
const axios = require("axios");
const slugify = require('slugify');

const FileStorage = require("../../models/filestorage");
const User = require("../../models/user");
const ModsPortalGame = require("../../models/modsportalGame");
const Wiki = require("../../models/wiki");
const WikiPage = require("../../models/wikiPage");

router.route("/filestorage").get((req, res) => {
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing")});

    FileStorage.findOne({ owner: req.user.id }).then(storage => {
        res.json({ storage: storage });
    }).catch(err => {
        res.status(500).json({ message: err.toString()});
    });
}).post((req, res) => {
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing") });

    FileStorage.exists({ owner: req.user.id }).then(exists => {
        if (exists) return res.status(400).json({ message: req.t("api.filestorage.exists") });

        let storage = new FileStorage({
            owner: req.user.id,
            files: [],
            folders: []
        });

        storage.save().then(storage => {
            res.json({ message: req.t("api.filestorage.success") });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
});

router.route("/filestorage/folder").post((req, res) => {
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing") });

    let folderName = req.query.name || req.body.name;
    let folderPath = req.query.path || req.body.path;
    if (!folderName) return res.status(400).json({ message: req.t("api.filestorage.folder.gamenamemissing") });
    if (!folderPath) return res.status(400).json({ message: req.t("api.filestorage.pathmissing") });
    if (!utils.foldernameValid(folderName)) return res.status(400).json({ message: req.t("api.filestorage.folder.nameinvalid") });
    
    FileStorage.findOne({ owner: req.user.id }).then(storage => {
        if (!storage) return res.status(400).json({ message: req.t("api.filestorage.missing") });
        if (folderPath != "/") {
            if (!storage.folders.find(folder => folder.path + `${folder.name}/` == folderPath)) return res.status(400).json({ message: req.t("api.filestorage.pathinvalid") });
        }
        if (storage.folders.find(folder => folder.name == folderName && folder.path == folderPath) || storage.files.find(file => file.name == folderName && file.path == folderPath)) return res.status(400).json({ message: req.t("api.filestorage.fexists", { "0": folderName }) });

        fs.mkdirSync(path.join(process.cwd(), config.filestorage.path, `${req.user.id}${folderPath}${folderName}`), { recursive: true });

        let folderObj = {
            name: folderName,
            path: folderPath
        }

        storage.folders.push(folderObj);

        storage.save().then(storage => {
            res.json({ message: req.t("api.filestorage.folder.created", { "0": folderName }), folder: storage.folders.find(f => f.name == folderName && f.path == folderPath) });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
}).patch((req, res) => {
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing") });

    let folderId = req.query["folder[id]"] || req.body.folder?.id;
    let folderName = req.query["folder[name]"] || req.body.folder?.name;
    let folderPath = req.query["folder[path]"] || req.body.folder?.path;
    if (!folderId) return res.status(400).json({ message: req.t("api.filestorage.folder.idmissing") });
    if (folderName && !utils.foldernameValid(folderName)) return res.status(400).json({ message: req.t("api.filestorage.folder.nameinvalid") });

    FileStorage.findOne({ owner: req.user.id }).then(storage => {
        if (!storage) return res.status(400).json({ message: req.t("api.filestorage.missing") });
        if (!storage.folders.find(f => f.id == folderId)) return res.status(400).json({ message: req.t("api.filestorage.folder.idinvalid") });

        let index = storage.folders.findIndex(f => f.id == folderId);
        let changed = false;
        if (folderPath && folderPath != "/" && !storage.folders.find(folder => folder.path + `${folder.name}/` == folderPath)) return res.status(400).json({ message: req.t("api.filestorage.pathinvalid") });

        folderName = folderName || storage.folders[index].name;
        folderPath = folderPath || storage.folders[index].path;

        if (folderName != storage.folders[index].name || folderPath != storage.folders[index].path) {
            if (storage.folders.find(f => f.name == folderName && f.path == folderPath) || storage.files.find(f => f.name == folderName && f.path == folderPath)) return res.status(400).json({ message: req.t("api.filestorage.fexists", { "0": folderName }) });

            let mvPath = path.join(process.cwd(), config.filestorage.path, `${req.user.id}${storage.folders[index].path}`);
            fs.renameSync(path.join(mvPath, storage.folders[index].name), path.join(process.cwd(), config.filestorage.path, `${req.user.id}${folderPath}`, folderName));
            // change path for all files and folders in this folder
            storage.folders.forEach((folder, i) => {
                if (folder.path.startsWith(storage.folders[index].path + storage.folders[index].name + "/")) {
                    storage.folders[i].path = folder.path.replace(storage.folders[index].path + storage.folders[index].name + "/", folderPath + folderName + "/");
                }
            });
            storage.files.forEach((file, i) => {
                if (file.path.startsWith(storage.folders[index].path + storage.folders[index].name + "/")) {
                    storage.files[i].path = file.path.replace(storage.folders[index].path + storage.folders[index].name + "/", folderPath + folderName + "/");
                }
            });
            storage.folders[index].name = folderName;
            storage.folders[index].path = folderPath;
            changed = true;
        }

        if (!changed) return res.status(400).json({ message: req.t("api.filestorage.folder.unchanged") });

        storage.save().then(storage => {
            res.json({ message: req.t("api.filestorage.folder.changed", { "0": folderName }), folder: storage.folders.find(f => f.id == folderId) });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
}).delete((req, res) => {
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing") });

    let folderId = req.query["folder[id]"] || req.body.folder?.id;
    if (!folderId) return res.status(400).json({ message: req.t("api.filestorage.folder.idmissing") });

    FileStorage.findOne({ owner: req.user.id }).then(storage => {
        if (!storage) return res.status(400).json({ message: req.t("api.filestorage.missing") });

        let index = storage.folders.findIndex(f => f.id == folderId);
        if (index == -1) return res.status(400).json({ message: req.t("api.filestorage.folder.idinvalid") });

        let folderName = storage.folders[index].name;
        let mvPath = path.join(process.cwd(), config.filestorage.path, `${req.user.id}${storage.folders[index].path}`);
        fs.rmSync(path.join(mvPath, storage.folders[index].name), { recursive: true, force: true });
        // delete all files and folders in this folder
        // use for loop (forEach doesn't change index after deletion)
        for (let i = 0; i < storage.folders.length; i++) {
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

        storage.save().then(storage => {
            res.json({ message: req.t("api.filestorage.folder.deleted", { "0": folderName }) });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
});

router.route("/filestorage/file").post(fileUpload({ useTempFiles: true, tempFileDir: path.join(process.cwd(), "tmp"), defParamCharset: "utf-8", uploadTimeout: 0 }), (req, res) => {
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing") });

    let filePath = req.query.path || req.body.path;
    let private = req.query.private || req.body.private;
    if (typeof private == "string") private = private == "true";
    if (!filePath) return res.status(400).json({ message: req.t("api.filestorage.pathmissing") });
    if (!req.files) return res.status(400).json({ message: req.t("api.filestorage.filemissing") });

    FileStorage.findOne({ owner: req.user.id }).then(storage => {
        if (!storage) return res.status(400).json({ message: req.t("api.filestorage.missing") });
        if (filePath != "/") {
            if (!storage.folders.find(folder => folder.path + `${folder.name}/` == filePath)) return res.status(400).json({ message: req.t("api.filestorage.pathinvalid") });
        }

        // if there's one file to upload
        if (req.files.file) {
            let file = req.files.file;
            
            if (storage.files.find(f => f.name == file.name && f.path == filePath) || storage.folders.find(f => f.name == file.name && f.path == filePath)) return res.status(400).json({ message: req.t("api.filestorage.fexists", { "0": file.name }) });
            if (storage.size + file.size > storage.maxSize) return res.status(400).json({ message: req.t("api.filestorage.file.toobig"), size: file.size, available: storage.maxSize - storage.size });

            let mvPath = path.join(process.cwd(), config.filestorage.path, `${req.user.id}${filePath}`);
            if (!fs.existsSync(mvPath)) fs.mkdirSync(mvPath, { recursive: true });
                
            let promise = new Promise((resolve, reject) => {
                if (!utils.filenameValid(file.name)) return reject("Invalid filename");
                file.mv(path.join(mvPath, file.name), (err) => {
                    if (err) return reject(err);

                    let fileObj = {
                        name: file.name,
                        path: filePath,
                        size: file.size,
                        date: new Date(),
                        private: private ?? true,
                        md5: file.md5
                    };

                    storage.files.push(fileObj);
                    storage.size += file.size;
                    return resolve(fileObj);
                });
            });
            
            promise.then(result => {
                storage.save().then(storage => {
                    res.json({ message: req.t("api.filestorage.file.uploaded", { "0": file.name }), file: storage.files.find(f => f.name == result.name && f.path == result.path) });
                }).catch(err => {
                    res.status(500).json({ message: err.toString() });
                });
            }).catch(err => {
                res.status(500).json({ message: err.toString() });
            });
        }
        // else if there's multiple files to upload
        else {
            let files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
            let size = 0;
            let originalLength = files.length;

            // Check and remove existing files
            let skippedFiles = [];
            for (let i = 0; i < files.length; i++) {
                if (storage.files.find(f => f.name == files[i].name && f.path == filePath) || storage.folders.find(f => f.name == files[i].name && f.path == filePath)) {
                    skippedFiles.push(files[i]);
                    files.splice(i, 1);
                    i--;
                }
            }

            // If there are no files to upload, return
            if (files.length == 0) return res.status(400).json({ message: req.t("api.filestorage.files.skipped") });

            // Check if files are too big
            files.forEach(file => {
                size += file.size;
            });
            if (storage.size + size > storage.maxSize) return res.status(400).json({ message: req.t("api.filestorage.files.toobig"), size: size, available: storage.maxSize - storage.size });

            // Save files and add them to the storage
            let promises = [];
            files.forEach(file => {
                let mvPath = path.join(process.cwd(), config.filestorage.path, `${req.user.id}${filePath}`);
                if (!fs.existsSync(mvPath)) fs.mkdirSync(mvPath, { recursive: true });
                
                promises.push(new Promise((resolve, reject) => {
                    if (!utils.filenameValid(file.name)) return reject("Invalid filename");
                    file.mv(path.join(mvPath, file.name), (err) => {
                        if (err) return reject(err);

                        let fileObj = {
                            name: file.name,
                            path: filePath,
                            size: file.size,
                            private: private ?? true,
                            md5: file.md5
                        };
            
                        storage.files.push(fileObj);
                        storage.size += file.size;
                        return resolve();
                    });
                }));
            });
            
            Promise.allSettled(promises).then(results => {
                storage.save().then(storage => {
                    let failedFiles = [], counter = 0;
                    results.forEach(result => { if (result.status == "rejected") failedFiles.push(files[counter++]); });
                    res.json({
                        message: req.t("api.filestorage.files.uploaded", { "0": `${files.length}/${originalLength}`, "1": `${skippedFiles.length}/${originalLength}`, "2": `${failedFiles.length}/${originalLength}` }),
                        files: storage.files.filter(f => f.path == filePath && files.find(file => file.name == f.name)),
                        skipped: storage.files.filter(f => f.path == filePath && skippedFiles.find(file => file.name == f.name)),
                        failed: storage.files.filter(f => f.path == filePath && failedFiles.find(file => file.name == f.name))
                    });
                }).catch(err => {
                    res.status(500).json({ message: err });
                });
            }).catch(err => {
                res.status(500).json({ message: err });
            });
        }
    });
}).patch((req, res) => {
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing") });

    let fileId = req.query["file[id]"] || req.body.file?.id;
    let fileName = req.query["file[name]"] || req.body.file?.name;
    let filePath = req.query["file[path]"] || req.body.file?.path;
    let filePrivate = req.query["file[private]"] || req.body.file?.private;
    if (typeof filePrivate == "string") filePrivate = filePrivate == "true";
    FileStorage.findOne({ owner: req.user.id }).then(storage => {
        if (!storage) return res.status(400).json({ message: req.t("api.filestorage.missing") });
        if (!storage.files.find(f => f.id == fileId)) return res.status(400).json({ message: req.t("api.filestorage.file.idinvalid") });

        let index = storage.files.findIndex(f => f.id == fileId);
        let changed = false;
        if (fileName && !utils.filenameValid(fileName)) return res.status(400).json({ message: req.t("api.filestorage.file.nameinvalid") });
        if (filePath && filePath != "/" && !storage.folders.find(folder => folder.path + `${folder.name}/` == filePath)) return res.status(400).json({ message: req.t("api.filestorage.pathinvalid") });

        fileName = fileName || storage.files[index].name;
        filePath = filePath || storage.files[index].path;
        filePrivate = filePrivate ?? storage.files[index].private;

        if (filePrivate != storage.files[index].private) {
            storage.files[index].private = filePrivate;
            changed = true;
        }

        if (fileName != storage.files[index].name || filePath != storage.files[index].path) {
            if (storage.files.find(f => f.name == fileName && f.path == filePath) || storage.folders.find(f => f.name == fileName && f.path == filePath)) return res.status(400).json({ message: req.t("api.filestorage.fexists", { "0": fileName }) });1

            let mvPath = path.join(process.cwd(), config.filestorage.path, `${req.user.id}${storage.files[index].path}`);
            fs.renameSync(path.join(mvPath, storage.files[index].name), path.join(process.cwd(), config.filestorage.path, `${req.user.id}${filePath}`, fileName));
            storage.files[index].name = fileName;
            storage.files[index].path = filePath;
            changed = true;
        }

        if (!changed) return res.status(400).json({ message: req.t("api.filestorage.file.unchanged") });

        storage.save().then(storage => {
            res.json({ message: req.t("api.filestorage.file.changed", { "0": fileName }), file: storage.files.find(f => f.id == fileId) });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
}).delete((req, res) => {
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing") });

    let fileId = req.query["file[id]"] || req.body.file?.id;
    FileStorage.findOne({ owner: req.user.id }).then(storage => {
        if (!storage) return res.status(400).json({ message: req.t("api.filestorage.missing") });
        if (!storage.files.find(f => f.id == fileId)) return res.status(400).json({ message: req.t("api.filestorage.file.idinvalid") });

        let index = storage.files.findIndex(f => f.id == fileId);
        let file = storage.files[index];
        let mvPath = path.join(process.cwd(), config.filestorage.path, `${req.user.id}${file.path}`);
        fs.rmSync(path.join(mvPath, file.name), { force: true, recursive: true });
        storage.files.splice(index, 1);
        storage.size -= file.size;
        storage.save().then(storage => {
            res.json({ message: req.t("api.filestorage.file.deleted", { "0": file.name }) });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
});

router.route("/settings/name").patch((req, res) => {
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing")});

    let name = req.query["name"] || req.body.name;
    if (!name) return res.status(400).json({ message: req.t("api.settings.name.missing") });
    if (name == req.user.name) return res.status(400).json({ message: req.t("api.settings.name.notchanged") });
    if (typeof name != "string") return res.status(400);
    if (name.length > 25) return res.status(400).json({ message: req.t("api.settings.name.toolong") });

    User.findById(req.user._id).then(user => {
        user.name = name;
        user.save().then(user => {
            res.json({ message: req.t("api.settings.name.changed"), name });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString()});
    });
});

router.route("/settings/apikey").get((req, res) => {
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing")});

    res.json({ apikey: req.user.apiKey });
}).post((req, res) => {
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing")});

    User.findById(req.user._id).then(user => {
        user.apiKey = uuid.v4();
        user.save().then(user => {
            res.json({ message: req.t("api.settings.api.changed") });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
});

router.route("/users").get((req, res) => {
    let id = req.query.id ?? req.body.id;
    let username = req.query.username ?? req.body.username;
    let name = req.query.name ?? req.body.name;

    let query;

    const conditions = [];

    if (id) {
        // Assuming 'id' is the MongoDB ObjectID
        if (mongoose.Types.ObjectId.isValid(id)) {
            conditions.push({ _id: id });
        } else {
            // If the ID is not valid, you might want to handle this case differently
            return res.status(400).json({ message: req.t("api.users.invalidid") });
        }
    }

    if (username) {
        conditions.push({ username: new RegExp('^'+username+'$', "i") });
    }

    if (name) {
        conditions.push({ name: new RegExp('^'+name+'$', "i") });
    }

    query = conditions.length > 0 ? { $or: conditions } : {};

    User.find(query).then(users => {
        res.json({ users });
    }).catch(err => {
        res.status(500).json({ message: err.toString() })
    });
});

router.route("/users/:username/permissions").patch((req, res) => {
    if (!req.user) return res.status(401).json({ message: req.t("api.usermissing")});
    if (!req.user.hasRole("admin")) return res.status(403).json({ message: req.t("api.adminonly")});

    let username = req.params.username;
    let permissions = req.query.permissions ?? req.body.permissions;
    if (!username || typeof username != "string") return res.status(400).json({ message: req.t("api.users.usernamemissing") });
    if (!permissions || typeof permissions != "object") return res.status(400).json({ message: req.t("api.users.permissionmissing") });

    User.findOne({ username }).then(user => {
        if (!user) return res.status(400).json({ message: req.t("api.users.usernotfound") });

        user.permissions = permissions;
        user.save().then(user => {
            res.json({ message: req.t("api.users.permissionschanged", { username: user.username, name: user.name }), permissions: user.permissions });
        }).catch(err => {
            res.status(500).json({ message: err.toString() })
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() })
    });
});

router.route("/users/filestorage").get((req, res) => {
    if (!req.user) return res.status(401).json({ message: req.t("api.usermissing")});
    if (!req.user.hasRole("admin")) return res.status(403).json({ message: req.t("api.adminonly")});

    let id = req.query.id ?? req.body.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: req.t("api.users.invalidid") });

    FileStorage.findOne({ owner: id }).populate("owner", "id").then(storage => {
        if (!storage) return res.status(400).json({ message: req.t("api.users.filestoragenonexistent") });

        res.json({ storage });
    }).catch(err => {
        res.status(500).json({ message: err.toString() })
    });
}).patch((req, res) => {
    if (!req.user) return res.status(401).json({ message: req.t("api.usermissing")});
    if (!req.user.hasRole("admin")) return res.status(403).json({ message: req.t("api.adminonly")});

    let id = req.query.id ?? req.body.id;
    let maxSize = Number(req.query.maxSize ?? req.body.maxSize);
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: req.t("api.users.invalidid") });
    if (!maxSize || typeof maxSize != "number") return res.status(400).json({ message: req.t("api.users.maxsizemissing") });

    FileStorage.findById(id).then(filestorage => {
        if (!filestorage) return res.status(400).json({ message: req.t("api.users.filestoragenonexistent") });

        filestorage.maxSize = maxSize;
        filestorage.save().then(filestorage => {
            res.json({ message: req.t("api.users.filestoragechanged"), storage: filestorage });
        }).catch(err => {
            res.status(500).json({ message: err.toString() })
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() })
    });
});

router.route("/modsportal/games").get((req, res) => {
    ModsPortalGame.find({}).then(games => {
        res.json({ games });
    }).catch(err => {
        res.status(500).json({ message: err.toString() })
    });
}).post(fileUpload({ defParamCharset: "utf-8" }), (req, res) => {
    if (!req.user) return res.status(401).json({ message: req.t("api.usermissing")});
    if (!req.user.hasRole("admin")) return res.status(403).json({ message: req.t("api.adminonly")});

    let name = req.query.name ?? req.body.name;
    let image = req.files?.file;
    if (!name) return res.status(400).json({ message: req.t("api.modsportal.namemissing") });
    if (!image) return res.status(400).json({ message: req.t("api.modsportal.gameimagemissing") });

    name = sanitize(name);
    ModsPortalGame.findOne({ name }).then(async game => {
        if (game) return res.status(400).json({ message: req.t("api.modsportal.gameexists") });

        const resizedImage = await sharp(image.data).resize(150, 225, { fit: "fill" }).toBuffer();
        const fileName = name + ("." + image.name.split(".").at(-1)) ?? "";
        const newGame = new ModsPortalGame({ name, imageLink: utils.staticUrl(`images/gamecards/${fileName}`), mods: [] })
        fs.mkdirSync(path.join(process.cwd(), "public/images/gamecards"), { recursive: true });
        fs.writeFileSync(path.join(process.cwd(), "public/images/gamecards", fileName), resizedImage);
        newGame.save().then(savedGame => {
            res.json({ message: req.t("api.modsportal.gamecreated"), game: savedGame });
        }).catch(err => {
            res.status(500).json({ message: err.toString() })
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() })
    });
});

router.route("/modsportal/games/:gameName/mods").post(fileUpload({ defParamCharset: "utf-8" }), (req, res) => {
    if (!req.user) return res.status(401).json({ message: req.t("api.usermissing")});
    if (!req.user.allowModsUpload()) return res.status(403).json({ message: req.t("api.nopermission")});

    let fileFile = req.files?.file;
    let imageFile = req.files?.image;
    let modName = req.query.name ?? req.body.name;
    let modAuthor = req.query.author ?? req.body.author;
    let modDescription = req.query.description ?? req.body.description;
    let fileName = req.query.fileName ?? req.body.fileName;
    let modVersion = req.query.modVersion ?? req.body.modVersion;
    let gameVersion = req.query.gameVersion ?? req.body.gameVersion;
    let modTags = req.query.tags ?? req.body.tags;
    if (!modName) return res.status(400).json({ message: req.t("api.modsportal.modnamemissing") });
    if (!modAuthor) return res.status(400).json({ message: req.t("api.modsportal.modauthormissing") });
    if (!modDescription) return res.status(400).json({ message: req.t("api.modsportal.moddescriptionmissing") });
    if (!fileName) return res.status(400).json({ message: req.t("api.modsportal.modidmissing") });
    if (!utils.filenameValid(fileName)) return res.status(400).json({ message: req.t("api.modsportal.modidinvalid") });
    if (!modVersion) return res.status(400).json({ message: req.t("api.modsportal.modversionmissing") });
    if (!utils.versionValid(modVersion)) return res.status(400).json({ message: req.t("api.modsportal.versioninvalid") });
    if (!modTags) return res.status(400).json({ message: req.t("api.modsportal.modtagsmissing") });
    if (!fileFile) return res.status(400).json({ message: req.t("api.modsportal.modfilemissing") });

    ModsPortalGame.findOne({ name: req.params.gameName }).then(async game => {
        if (!game) return res.status(400).json({ message: req.t("api.modsportal.gamenotexists") });
        if (game.mods.find(mod => mod.name == modName)) return res.status(400).json({ message: req.t("api.modsportal.modexists") });

        const newID = new mongoose.Types.ObjectId();
        const newMod = {
            _id: newID,
            name: sanitize(modName.replace(/\n\s*/g, "")),
            modId: sanitize(fileName.replace(/\n\s*/g, "")),
            author: sanitize(modAuthor.replace(/\n\s*/g, "")),
            description: sanitize(modDescription.replace(/\n\s*/g, "\n\n")),
            tags: sanitize(modTags.replace(/\n\s*/g, "")).split(" "),
            versions: [{
                version: sanitize(modVersion.replace(/\n\s*/g, "")),
                gameVersion: sanitize(gameVersion.replace(/\n\s*/g, "")),
                uploadedAt: new Date()
            }],
            iconLink: imageFile ? utils.staticUrl(`images/modcards/${newID}/${imageFile.name}`) : ""
        }
        let resizedImage;
        if (imageFile) resizedImage = await sharp(imageFile.data).resize(160, 160, { fit: "fill" }).toBuffer();

        game.mods.unshift(newMod);
        game.save().then(savedGame => {
            const mod = savedGame.mods.find(mod => mod.name == newMod.name);
            fs.mkdirSync(path.join(process.cwd(), `public/files/mods/${savedGame.name}/${mod.id}/${mod.versions[0].version}`), { recursive: true });
            if (imageFile) fs.mkdirSync(path.join(process.cwd(), `public/images/modcards/${mod.id}`), { recursive: true });
            fs.writeFileSync(path.join(process.cwd(), `public/files/mods/${savedGame.name}/${mod.id}/${mod.versions[0].version}`, fileName), fileFile.data);
            if (imageFile) fs.writeFileSync(path.join(process.cwd(), `public/images/modcards/${mod.id}`, imageFile.name), resizedImage);
            res.json({ message: req.t("api.modsportal.modcreated"), mod });
        }).catch(err => {
            res.status(500).json({ message: err.toString() })
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() })
    });
});

router.route("/modsportal/mods/:modId").post(fileUpload({ defParamCharset: "utf-8" }), (req, res) => {
    if (!req.user) return res.status(401).json({ message: req.t("api.usermissing")});
    if (!req.user.allowModsUpload()) return res.status(403).json({ message: req.t("api.nopermission")});

    let fileFile = req.files?.file;
    let modVersion = req.query.modVersion ?? req.body.modVersion;
    let gameVersion = req.query.gameVersion ?? req.body.gameVersion;
    if (!modVersion) return res.status(400).json({ message: req.t("api.modsportal.modversionmissing") });
    if (!utils.versionValid(modVersion)) return res.status(400).json({ message: req.t("api.modsportal.versioninvalid") });
    if (!fileFile) return res.status(400).json({ message: req.t("api.modsportal.modfilemissing") });
    
    ModsPortalGame.findOne({ mods: { $elemMatch: { _id: req.params.modId }}}).then(game => {
        if (!game) return res.status(400).json({ message: req.t("api.modsportal.gamenotexists") });
        const mod = game.mods.find(mod => mod.id == req.params.modId);
        if (!mod) return res.status(400).json({ message: req.t("api.modsportal.modnotexists") });
        if (mod.versions.find(v => v.version == modVersion)) return res.status(400).json({ message: req.t("api.modsportal.versionexists") });

        const newVersion = {
            version: sanitize(modVersion),
            gameVersion: sanitize(gameVersion),
            uploadedAt: new Date()
        }

        mod.versions.push(newVersion);
        game.save().then(savedGame => {
            const savedMod = savedGame.mods.find(m => m.id == mod.id);
            fs.mkdirSync(path.join(process.cwd(), `public/files/mods/${savedGame.name}/${savedMod.id}/${savedMod.versions.at(-1).version}`), { recursive: true });
            fs.writeFileSync(path.join(process.cwd(), `public/files/mods/${savedGame.name}/${savedMod.id}/${savedMod.versions.at(-1).version}`, savedMod.modId), fileFile.data);
            res.json({ message: req.t("api.modsportal.modupdated"), mod: savedMod });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
}).patch(fileUpload({ defParamCharset: "utf-8" }), (req, res) => {
    if (!req.user) return res.status(401).json({ message: req.t("api.usermissing")});
    if (!req.user.allowModsEdit()) return res.status(403).json({ message: req.t("api.nopermission")});

    let imageFile = req.files?.image;
    let modName = req.query.name ?? req.body.name;
    let modAuthor = req.query.author ?? req.body.author;
    let modDescription = req.query.description ?? req.body.description;
    let modTags = req.query.tags ?? req.body.tags;
    if (!modName) return res.status(400).json({ message: req.t("api.modsportal.modnamemissing") });
    if (!modAuthor) return res.status(400).json({ message: req.t("api.modsportal.modauthormissing") });
    if (!modDescription) return res.status(400).json({ message: req.t("api.modsportal.moddescriptionmissing") });
    if (!modTags) return res.status(400).json({ message: req.t("api.modsportal.modtagsmissing") });

    ModsPortalGame.findOne({ mods: { $elemMatch: { _id: req.params.modId }}}).then(async game => {
        if (!game) return res.status(400).json({ message: req.t("api.modsportal.gamenotexists") });
        const mod = game.mods.find(mod => mod.id == req.params.modId);

        const oldImageName = mod.iconLink.split("/").at(-1);

        mod.name = sanitize(modName.replace(/\n\s*/g, "")) ?? mod.name;
        mod.author = sanitize(modAuthor.replace(/\n\s*/g, "")) ?? mod.author;
        mod.description = sanitize(modDescription.replace(/\n\s*/g, "\n\n")) ?? mod.description;
        mod.tags = sanitize(modTags.replace(/\n\s*/g, ""))?.split(" ") ?? mod.tags;
        mod.iconLink = imageFile ? utils.staticUrl(`images/modcards/${mod.id}/${imageFile.name}`) : mod.iconLink;
        let resizedImage;
        if (imageFile) resizedImage = await sharp(imageFile.data).resize(160, 160, { fit: "fill" }).toBuffer();

        game.save().then(savedGame => {
            if (imageFile) {
                fs.rmSync(path.join(process.cwd(), `public/images/modcards/${mod.id}`, oldImageName), { recursive: true, force: true });
                fs.mkdirSync(path.join(process.cwd(), `public/images/modcards/${mod.id}`), { recursive: true });
                fs.writeFileSync(path.join(process.cwd(), `public/images/modcards/${mod.id}`, imageFile.name), resizedImage);
            }
            res.json({ message: req.t("api.modsportal.modupdated"), mod });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
}).delete((req, res) => {
    if (!req.user) return res.status(401).json({ message: req.t("api.usermissing")});
    if (!req.user.hasRole("admin")) return res.status(403).json({ message: req.t("api.adminonly")});

    ModsPortalGame.findOne({ mods: { $elemMatch: { _id: req.params.modId }}}).then(game => {
        if (!game) return res.status(400).json({ message: req.t("api.modsportal.gamenotexists") });
        const modIndex = game.mods.findIndex(m => m.id == req.params.modId);
        if (modIndex == -1) return res.status(400).json({ message: req.t("api.modsportal.modnotexists") });

        const modObject = game.mods[modIndex];
        game.mods.splice(modIndex, 1);
        game.save().then(savedGame => {
            fs.rmSync(path.join(process.cwd(), `public/files/mods/${savedGame.name}/${modObject._id}`), { recursive: true, force: true });
            fs.rmSync(path.join(process.cwd(), `public/images/modcards/${modObject._id}`), { recursive: true, force: true });
            res.json({ message: req.t("api.modsportal.moddeleted") });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
});

router.route("/modsportal/mods/:modId/:modVersion").delete((req, res) => {
    if (!req.user) return res.status(401).json({ message: req.t("api.usermissing")});
    if (!req.user.allowModsEdit()) return res.status(403).json({ message: req.t("api.nopermission")});

    ModsPortalGame.findOne({ mods: { $elemMatch: { _id: req.params.modId }}}).then(game => {
        if (!game) return res.status(400).json({ message: req.t("api.modsportal.gamenotexists") });
        const mod = game.mods.find(mod => mod.id == req.params.modId);
        if (!mod) return res.status(400).json({ message: req.t("api.modsportal.modnotexists") });
        if (mod.versions.length <= 1) return res.status(400).json({ message: req.t("api.modsportal.modonlyversion") });
        const versionIndex = mod.versions.findIndex(v => v.version == req.params.modVersion);
        if (versionIndex == -1) return res.status(400).json({ message: req.t("api.modsportal.modversionnotexists") });

        mod.versions.splice(versionIndex, 1);
        game.save().then(savedGame => {
            const savedMod = savedGame.mods.find(m => m.id == mod.id);
            fs.rmSync(path.join(process.cwd(), `public/files/mods/${savedGame.name}/${savedMod.id}/${req.params.modVersion}`), { recursive: true, force: true });
            res.json({ message: req.t("api.modsportal.modversiondeleted") });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
});

router.get("/albion/market_data", (req, res) => {
    // Fetch market data from localhost:1000/api/market_data
    const marketDataUrl = "http://localhost:1000/api/market-data";
    axios.get(marketDataUrl).then(response => {
        res.json(response.data);
    }).catch(error => {
        console.error("Error fetching market data:", error);
        res.status(500).json({ message: "Failed to fetch market data" });
    });
});

// Wiki API
router.route("/wikis").get((req, res) => {
    // TODO: Implement GET /wiki
    res.status(501).json({ message: "Not implemented" });
}).post((req, res) => {
    // Create a new wiki
    if (!req.user) return res.status(403).json({ message: req.t("api.usermissing") });

    // Only admins or users with wiki_creator role can create wikis
    if (!req.user.hasRole?.("admin") && !req.user.hasRole?.("wiki_creator")) return res.status(403).json({ message: req.t("api.nopermission") });


    // rawName is the user-supplied display name (e.g. "Awesome Wiki").
    // We'll derive a slug from it and store slug in `wiki.name`, and store the original as `wiki.title`.
    let rawName = req.query.name || req.body.name;
    let description = req.query.description || req.body.description || "";
    let language = req.query.language || req.body.language || "en";

    if (!rawName) return res.status(400).json({ message: req.t("api.wikis.name_required") });

    // Derive title and slug using slugify for transliteration and wider language support
    let title;
    let slug;
    try {
        // Keep original display title
        title = String(rawName).trim();
        // Use slugify to transliterate and produce a URL-safe slug
        slug = slugify(title, { lower: true, strict: true });
    } catch (e) {
        return res.status(400).json({ message: req.t("api.wikis.name_required") });
    }

    if (!slug || !/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ message: req.t("api.wikis.invalid_name") });

    // Validate language — accept any language that has a locale file, otherwise fall back to 'en'
    try {
        language = utils.sanitizeFilename(String(language || 'en'));
    } catch (e) {
        language = 'en';
    }

    if (!fs.existsSync(path.join(process.cwd(), 'locales', `${language}.json`))) {
        language = 'en';
    }

    Wiki.exists({ name: slug }).then(exists => {
        if (exists) return res.status(400).json({ message: req.t("api.wikis.exists") });

        const wiki = new Wiki({ name: slug, title, description, language });

        wiki.save().then(saved => {
            // Return created wiki object
            res.status(201).json({ message: req.t("api.wikis.created"), wiki: saved });
        }).catch(err => {
            console.error("Error creating wiki:", err);
            res.status(500).json({ message: req.t("api.wikis.create_failed") });
        });
    }).catch(err => {
        console.error("Error checking wiki existence:", err);
        res.status(500).json({ message: req.t("api.error.500") });
    });
});

// Purge page cache (for admins or editors)
router.post("/wikis/:wikiName/pages/:pageTitle*/purge", async (req, res) => {
  try {
    const wikiName = req.params.wikiName;
    let pageTitle = req.params.pageTitle || "Main_Page";
    const subPath = req.params[0] || "";

    // parse namespace
    let namespace = "Main";
    if (pageTitle.includes(":")) {
      [namespace, pageTitle] = pageTitle.split(":", 2);
      if (!utils.getSupportedNamespaces().includes(namespace)) {
        pageTitle = `${namespace}:${pageTitle}`;
        namespace = "Main";
      }
    }

    // Find wiki
    const wiki = await Wiki.findOne({ name: wikiName });
    if (!wiki) return res.status(404).json({ message: req.t("api.wikis.not_found") });

    // Must be logged in
    if (!req.user) return res.status(401).json({ message: req.t("api.usermissing") });

    // Must have edit permission or be admin
    if (!wiki.canEdit(req.user) && !req.user.hasRole?.("admin")) {
      return res.status(403).json({ message: req.t("api.nopermission") });
    }

    // Build full path including subpages
    const fullPath = subPath ? `${pageTitle}${subPath}` : pageTitle;
    const page = await WikiPage.findOne({ wiki: wiki._id, namespace, path: fullPath });
    if (!page) return res.status(404).json({ message: req.t("api.wikis.page_not_found", { page: fullPath }) });

    // Trigger purge
    await page.purgeCache();

    return res.json({ message: req.t("api.wikis.page_purged", { page: fullPath }) });
  } catch (err) {
    console.error("API: error purging wiki page:", err);
    res.status(500).json({ message: err.toString() });
  }
});

// Page endpoints (get, create/update)
router.route("/wikis/:wikiName/pages/:pageTitle*")
    .get(async (req, res) => {
        try {
            const wikiName = req.params.wikiName;
            let pageTitle = req.params.pageTitle || "Main_Page";
            const subPath = req.params[0] || "";

            // parse namespace
            let namespace = "Main";
            if (pageTitle.includes(":")) {
                [namespace, pageTitle] = pageTitle.split(":", 2);
                if (!utils.getSupportedNamespaces().includes(namespace)) {
                    pageTitle = `${namespace}:${pageTitle}`;
                    namespace = "Main";
                }
            }

            // Find wiki
            const wiki = await Wiki.findOne({ name: wikiName });
            if (!wiki) return res.status(404).json({ message: req.t("api.wikis.not_found") });

            // Special pages
            if (namespace === "Special") {
                const special = pageTitle.toLowerCase();
                if (special === "allpages") {
                    const ns = req.query.namespace || "Main";
                    const page = parseInt(req.query.page) || 1;
                    const limit = 50;
                    const pages = await WikiPage.listPages(wiki._id, ns, limit, (page - 1) * limit);
                    const total = await WikiPage.countDocuments({ wiki: wiki._id, namespace: ns });
                    return res.json({ wiki: { name: wiki.name, title: wiki.title }, namespace: ns, pages, pagination: { current: page, total: Math.ceil(total / limit) } });
                }
                if (special === "recentchanges") {
                    const days = parseInt(req.query.days) || 7;
                    const page = parseInt(req.query.page) || 1;
                    const limit = 50;
                    const since = new Date();
                    since.setDate(since.getDate() - days);
                    const changes = await WikiPage.find({ wiki: wiki._id, lastModifiedAt: { $gte: since } })
                        .sort({ lastModifiedAt: -1 })
                        .skip((page - 1) * limit)
                        .limit(limit)
                        .populate("lastModifiedBy", "username");
                    const total = await WikiPage.countDocuments({ wiki: wiki._id, lastModifiedAt: { $gte: since } });
                    return res.json({ wiki: { name: wiki.name, title: wiki.title }, days, changes, pagination: { current: page, total: Math.ceil(total / limit) } });
                }

                return res.status(404).json({ message: req.t("api.wikis.special_not_found", { page: pageTitle }) });
            }

            // Check access
            if (!wiki.canAccess(req.user)) return res.status(403).json({ message: req.t("api.nopermission") });

            const fullPath = subPath ? `${pageTitle}${subPath}` : pageTitle;
            const page = await WikiPage.findOne({ wiki: wiki._id, namespace, path: fullPath }).populate("lastModifiedBy", "username");

            if (!page) {
                return res.json({ exists: false, title: fullPath, namespace, path: fullPath });
            }

            // include revisions only for editors when requested
            let revisions = undefined;
            const includeRevisions = req.query.includeRevisions === "1" || req.query.includeRevisions === "true";
            if (includeRevisions && wiki.canEdit(req.user)) {
                revisions = page.revisions.map(r => ({ id: r._id, author: r.author, timestamp: r.timestamp, comment: r.comment, minor: r.minor }));
            }

            return res.json({
                exists: true,
                page: {
                    title: page.title || page.path,
                    namespace: page.namespace,
                    path: page.path,
                    content: page.content,
                    html: page.html,
                    lastModifiedAt: page.lastModifiedAt,
                    lastModifiedBy: page.lastModifiedBy,
                    categories: page.categories,
                    protected: page.protected,
                    revisions
                }
            });
        } catch (err) {
            console.error("API: error fetching wiki page:", err);
            res.status(500).json({ message: err.toString() });
        }
    })
    .post(async (req, res) => {
        try {
            const wikiName = req.params.wikiName;
            let pageTitle = req.params.pageTitle || "Main_Page";
            const subPath = req.params[0] || "";
            const { content, summary = "", minor = false } = req.body;

            // Require content for new pages/edits
            if (!content) {
                return res.status(400).json({ message: req.t("api.wikis.content_required") });
            }

            // Parse namespace and path
            let namespace = "Main";
            if (pageTitle.includes(":")) {
                [namespace, pageTitle] = pageTitle.split(":", 2);
                if (!utils.getSupportedNamespaces().includes(namespace)) {
                    pageTitle = `${namespace}:${pageTitle}`;
                    namespace = "Main";
                }
            }

            // Build full path including subpages
            const fullPath = subPath ? `${pageTitle}${subPath}` : pageTitle;

            // Find wiki and check permissions
            const wiki = await Wiki.findOne({ name: wikiName });
            if (!wiki) {
                return res.status(404).json({ message: req.t("api.wikis.not_found") });
            }

            // Must be logged in to edit
            if (!req.user) {
                return res.status(401).json({ message: req.t("api.usermissing") });
            }

            // Must have edit permission
            if (!wiki.canEdit(req.user)) {
                return res.status(403).json({ message: req.t("api.nopermission") });
            }

            // Try to find existing page
            let page = await WikiPage.findOne({
                wiki: wiki._id,
                namespace,
                path: fullPath
            });

            if (page) {
                // Check if page is protected
                if (page.protected !== "none" && !wiki.isAdmin(req.user)) {
                    return res.status(403).json({ 
                        message: req.t("api.wikis.page_protected"),
                        protection: page.protected
                    });
                }

                // ✅ Skip saving if content hasn't changed
                if (page.content === content) {
                    return res.status(400).json({
                        message: req.t("api.wikis.no_change_detected"),
                        page: {
                            title: page.title || page.path,
                            namespace: page.namespace,
                            path: page.path,
                            content: page.content,
                            html: page.html,
                            lastModifiedAt: page.lastModifiedAt,
                            lastModifiedBy: await User.findById(page.lastModifiedBy).select("username"),
                            categories: page.categories,
                            protected: page.protected,
                            revision: page.revisions[page.revisions.length - 1]._id
                        }
                    });
                }

                // Update existing page
                page.addRevision(content, req.user._id, summary, minor);
            } else {
                // Create new page
                page = await WikiPage.createPage(
                    wiki._id,
                    pageTitle.replace(/_/g, " "),
                    namespace,
                    fullPath,
                    content,
                    req.user._id,
                    summary
                );
            }

            await page.save();

            // Return the updated/created page
            return res.json({
                message: page ? req.t("api.wikis.page_updated") : req.t("api.wikis.page_created"),
                page: {
                    title: page.title || page.path,
                    namespace: page.namespace,
                    path: page.path,
                    content: page.content,
                    html: page.html,
                    lastModifiedAt: page.lastModifiedAt,
                    lastModifiedBy: await User.findById(page.lastModifiedBy).select("username"),
                    categories: page.categories,
                    protected: page.protected,
                    revision: page.revisions[page.revisions.length - 1]._id
                }
            });
        } catch (err) {
            console.error("API: error creating/updating wiki page:", err);
            res.status(500).json({ message: err.toString() });
        }
    })
    .delete(async (req, res) => {
        try {
            const wikiName = req.params.wikiName;
            let pageTitle = req.params.pageTitle || "Main_Page";
            const subPath = req.params[0] || "";

            // parse namespace
            let namespace = "Main";
            if (pageTitle.includes(":")) {
                [namespace, pageTitle] = pageTitle.split(":", 2);
                if (!utils.getSupportedNamespaces().includes(namespace)) {
                    pageTitle = `${namespace}:${pageTitle}`;
                    namespace = "Main";
                }
            }

            // Do not allow deletion of special pages
            if (namespace === "Special") {
                return res.status(400).json({ message: req.t("api.wikis.special_not_found", { page: pageTitle }) });
            }

            // Find wiki
            const wiki = await Wiki.findOne({ name: wikiName });
            if (!wiki) return res.status(404).json({ message: req.t("api.wikis.not_found") });

            // Must be logged in
            if (!req.user) return res.status(401).json({ message: req.t("api.usermissing") });

            // Only global admins or wiki admins can delete pages
            if (!req.user.hasRole?.("admin") && !wiki.isAdmin(req.user)) {
                return res.status(403).json({ message: req.t("api.adminonly") });
            }

            const fullPath = subPath ? `${pageTitle}${subPath}` : pageTitle;
            const page = await WikiPage.findOne({ wiki: wiki._id, namespace, path: fullPath });
            if (!page) return res.status(404).json({ message: req.t("api.wikis.page_not_found", { page: fullPath }) });

            await page.deleteOne();

            return res.json({ message: req.t("api.wikis.page_deleted") });
        } catch (err) {
            console.error("API: error deleting wiki page:", err);
            res.status(500).json({ message: err.toString() });
        }
    });

// Render page content (for preview)
router.post("/wikis/:wikiName/render", async (req, res) => {
	try {
		const wikiName = req.params.wikiName;
		const { content, namespace, path } = req.body;

		if (!content) {
			return res.status(400).json({ message: req.t("api.wikis.content_required") });
		}

		// Find wiki
		const wiki = await Wiki.findOne({ name: wikiName });
		if (!wiki) {
			return res.status(404).json({ message: req.t("api.wikis.not_found") });
		}

		// Check permission (canView or canEdit)
		if (!wiki.canAccess(req.user)) {
			return res.status(403).json({ message: req.t("api.nopermission") });
		}

		const WikiPage = mongoose.model("WikiPage");

		// Create a temporary instance to reuse render logic
		const tempPage = new WikiPage({
			wiki: wiki._id,
			namespace: namespace || "Main",
			path: path || "Preview_Page",
			content
		});

		// Render content (simple LGWL -> HTML)
		await tempPage.renderContent();

		return res.json({
			message: req.t("api.wikis.page_rendered"),
			html: tempPage.html,
			categories: tempPage.categories || []
		});
	} catch (err) {
		console.error("API: error rendering wiki preview:", err);
		res.status(500).json({ message: err.toString() });
	}
});

module.exports = router;