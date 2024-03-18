const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    if (!req.user) return res.redirect("/");

    res.serve("settings");
});

module.exports = router;