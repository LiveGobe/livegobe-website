const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    if (!req.user) return res.redirect("/login?redirect=/password_generator");

    res.serve("password-generator");
});

module.exports = router;