const express = require("express");
const router = express.Router();
const User = require("../models/user");

router.get("/", (req, res) => {
    if (!req.user) return res.redirect("/login");

    let maxOnPage = 25;
    let page = (req.query.page || 1) - 1;

    User.countDocuments().then(count => {
        User.find().skip(maxOnPage * Math.max(0, Math.min(count / maxOnPage - 1, page))).limit(maxOnPage).then(users => {
            res.serve("users", { users, docsNumber: count, page: Math.max(0, Math.min(count / maxOnPage - 1, page)) + 1, maxOnPage });
        }).catch(err => {
            res.status(500).send(err.message);
        })
    }).catch(err => {
        res.status(500).send(err.message);
    })
});

router.get("/:user", (req, res, next) => {
    if (!req.user) return res.redirect("/login");

    User.findOne({ username: req.params.user }).then(user => {
        if (!user) return next();

        res.serve("users-user", { pageUser: user });
    }).catch(err => {
        res.status(500).send(err.message);
    });
});

module.exports = router;