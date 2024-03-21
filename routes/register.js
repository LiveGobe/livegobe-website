const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.serve("register", { key: req.query.key || "" });
});

module.exports = router;