const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
    res.serve("password-generator", { canonicalLink: "/password_generator" });
});

module.exports = router;