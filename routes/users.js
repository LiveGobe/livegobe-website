const express = require("express");
const router = express.Router();
const User = require("../models/user");

router.get("/", (req, res) => {
    if (!req.user) return res.redirect("/login");

    User.find().limit(50).then(users => {
        User.countDocuments().then(count => {
            res.serve("users", { users, docsNumber: count, page: req.query.page || 1 });
        }).catch(err => {
            res.status(500).send(err.message);
        })
    }).catch(err => {
        res.status(500).send(err.message);
    })
});

router.get("/:user", (req, res) => {
    if (!req.user) return res.redirect("/login");

    User.findOne({ username: req.params.user }).then(user => {
        res.serve("users-user", { pageUser: user });
    }).catch(err => {
        res.status(500).send(err.message);
    });
});

module.exports = router;