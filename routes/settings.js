const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.serve("settings");
});

module.exports = router;