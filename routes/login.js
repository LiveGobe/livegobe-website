const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    if (req.user) res.redirect("/");

    res.serve("login");
});

module.exports = router;