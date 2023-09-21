const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    if (!req.user) return res.redirect("/login");
    
    req.session.destroy(() => {
        res.redirect("/");
    });
});

module.exports = router;