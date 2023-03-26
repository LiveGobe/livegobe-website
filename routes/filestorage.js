const express = require('express');
const router = express.Router();
const path = require('node:path');
const config = require("../config"); 

const FileStorage = require('../models/filestorage');

router.get('/', (req, res) => {
    res.redirect("/filestorage/browse");
});

function browseFilestorage(req, res) {
    if (!req.user) return res.redirect("/login?redirect=/filestorage/browse");

    FileStorage.findOne({ owner: req.user.id }).then(storage => {
        res.serve("filestorage", { storage: storage, user: req.user });
    }).catch(err => {
        res.status(500).serve("500", { message: err });
    });
}

router.get("/browse", browseFilestorage);
router.get("/browse/*", browseFilestorage);

router.get("/v/:userId/:fileId", (req, res) => {
    FileStorage.findOne({ owner: req.params.userId }, "owner files").populate("owner").then(storage => {
        if (!storage) return res.status(404).serve("404");

        let file = storage.files.find(file => file.id == req.params.fileId);

        if (!file || (file.private && storage.owner.id != req.user?.id)) return res.status(404).serve("404");
        
        res.serve("filestorage-file", { file: file, user: req.user, owner: storage.owner });
    }).catch(err => {
        res.status(500).serve("500", { message: err });
    });
});

router.get("/d/:userId/:fileId", (req, res) => {
    FileStorage.findOne({ owner: req.params.userId }, "owner files").populate("owner").then(storage => {
        if (!storage) return res.status(404).serve("404");

        let file = storage.files.find(file => file.id == req.params.fileId);

        if (!file || (file.private && storage.owner.id != req.user?.id)) return res.status(404).serve("404");

        res.download(path.join(__dirname, "..", config.filestorage.path, `${storage.owner.id}${file.path}${file.name}`), file.name);
    }).catch(err => {
        console.log(err)
        res.status(500).serve("500", { message: err });
    });
});

module.exports = router;