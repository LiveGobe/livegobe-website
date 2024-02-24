const express = require("express");
const router = express.Router();
const fileUpload = require("express-fileupload");
const fs = require("node:fs");
const path = require("node:path");
const utils = require("../../bin/utils");
const config = require("../../config");

const FileStorage = require("../../models/filestorage");

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
    if (!folderName) return res.status(400).json({ message: req.t("api.filestorage.folder.namemissing") });
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
            fs.renameSync(path.join(mvPath, storage.folders[index].name), path.join(mvPath, folderName));
            // change path for all files and folders in this folder
            storage.folders.forEach(folder => {
                if (folder.path.startsWith(storage.folders[index].path + storage.folders[index].name + "/")) {
                    folder.path = folder.path.replace(storage.folders[index].path + storage.folders[index].name + "/", storage.folders[index].path + folderName + "/");
                }
            });
            storage.files.forEach(file => {
                if (file.path.startsWith(storage.folders[index].path + storage.folders[index].name + "/")) {
                    file.path = file.path.replace(storage.folders[index].path + storage.folders[index].name + "/", storage.folders[index].path + folderName + "/");
                }
            });
            storage.folders[index].name = folderName;
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

module.exports = router;