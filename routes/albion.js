const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.serve("albion", { canonicalLink: "/albion_tools" });
});

module.exports = router;