const express = require("express");
const router = express.Router();
const path = require("node:path")
const utils = require("../bin/utils");

const ModsPortalGame = require("../models/modsportalGame");

function browsePortal(req, res) {
    const link = req.originalUrl;
    res.serve("modsportal", { link });
}

router.get('/', (req, res) => {
    res.redirect("/mods_portal/browse");
});

router.get("/browse", browsePortal);
router.get("/browse/*", browsePortal);

router.get("/d/:gameName/:modId/:modVersion", (req, res) => {
    ModsPortalGame.findOne({ name: req.params.gameName }).then(game => {
        if (!game) return res.sendStatus(404);

        const mod = game.mods.find(mod => mod.id == req.params.modId);
        if (!mod) return res.sendStatus(404);

        const version = mod.versions.find(ver => ver.version == req.params.modVersion);
        if (!version) return res.sendStatus(404);

        res.download(path.join(utils.staticUrl(`files/mods/${req.params.gameName}/${req.params.modId}/${req.params.modVersion}/${mod.modId}`)));
    }).catch(err => {
        res.status(500).serve("500", { message: err });
    });
});

router.get("/game/new", (req, res) => {
    if (!req.user) return res.redirect("/login?redirect=/mods_portal/game/new");

    res.serve("modsportal-new-game");
});

router.get("/mod/new", (req, res) => {
    if (!req.user) return res.redirect("/login?redirect=/mods_portal/mod/new");

    ModsPortalGame.find({}, "-mods").sort({ name: -1 }).then(games => {
        res.serve("modsportal-new-mod", { games, selectedGame: req.query.game });
    });
});

router.get("/mod/update/:modId", (req, res) => {
    if (!req.user) return res.redirect("/login?redirect=/mods_portal/mod/new");

    ModsPortalGame.findOne({ mods: { $elemMatch: { _id: req.params.modId }}}, { name: true, mods: { $elemMatch: { _id: req.params.modId }}}).then(game => {
        if (!game) return res.redirect("/mods_portal/browse");

        res.serve("modsportal-update-mod", { game });
    });
});

module.exports = router;