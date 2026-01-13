const express = require("express");
const passport = require("passport");
const router = express.Router();
const utils = require("../../bin/utils");
const bcrypt = require("bcrypt");

const User = require("../../models/user");
const RegisterKey = require("../../models/registerKey");

router.use((req, res, next) => {
    // If there's a session, then we're good
    if (req.user) return next();

    // Otherwise, check the API key
    passport.authenticate('custom', { session: false }, (err, user, info) => {
        if (err) return next(err);

        if (!user) return next();

        req.logIn(user, (err) => {
            if (err) return next(err);
            next();
        });
    })(req, res, next);
});

// Default routes
router.get("/locales", (req, res) => {
    let locale, language = req.query.lang || req.body.lang, message;
    if (typeof language == "string") language = utils.sanitizeFilename(language);
    else language = "";
    try {
        locale = require(`../../locales/${language}.json`);
        message = req.t("api.locales.message.success", { "0": language });
    }
    catch (e) {
        locale = require("../../locales/en.json");
        language = "en";
        message = req.t("api.locales.message.fail");
    }
    res.json({ success: true, language: language, locales: locale, message: message })
});

router.post("/login", (req, res, next) => {
    if (req.user) return res.status(400).json({ message: req.t("api.login.loggedin")})
    
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);

        if (!user) return res.status(403).json({ message: req.t("api.login.invalid")});

        req.logIn(user, (err) => {
            if (err) return next(err);
            if (req.body.remember == "true") req.session.cookie.maxAge = null;
            res.json({ message: req.t("api.login.success")});
        });
    })(req, res, next);
});

router.post("/register", (req, res) => {
    let username = req.query.username || req.body.username;
    let name = req.query.name || req.body.name;
    let password = req.query.password || req.body.password;
    let key = req.query.key || req.body.key;

    if (!username) return res.status(400).json({ message: req.t("api.register.usernamemissing") });
    if (username.length > 25) return res.status(400).json({ message: req.t("api.register.usernametoolong") });
    if (!name) return res.status(400).json({ message: req.t("api.register.namemissing") });
    if (name.length > 25) return res.status(400).json({ message: req.t("api.register.nametoolong") });
    if (!password) return res.status(400).json({ message: req.t("api.register.passwordmissing") });
    if (!key) return res.status(400).json({ message: req.t("api.register.keymissing") });

    User.findOne({ username: username }, "username").then(user => {
        if (user) return res.status(400).json({ message: req.t("api.register.userexist") });

        RegisterKey.findOne({ key: key }).then(registerKey => {
            if (!registerKey) return res.status(400).json({ message: req.t("api.register.keymismatch") });

            if (registerKey.count <= 0) {
                return res.status(400).json({ message: req.t("api.register.keyusedup") });
            }

            const newUser = new User({
                username,
                name,
                password: bcrypt.hashSync(password, 10)
            });

            newUser.save().then(() => {
                registerKey.count -= 1;

                // Delete key if used up, otherwise just save
                const keyAction = registerKey.count <= 0
                    ? registerKey.deleteOne()
                    : registerKey.save();

                keyAction.then(() => {
                    res.json({ message: req.t("api.register.success") });
                }).catch(err => {
                    res.status(500).json({ message: err.toString() });
                });
            }).catch(err => {
                res.status(500).json({ message: err.toString() });
            });
        }).catch(err => {
            res.status(500).json({ message: err.toString() });
        });
    }).catch(err => {
        res.status(500).json({ message: err.toString() });
    });
});

// Versioned routes
router.use("/v1", (req, res) => { res.status(500).json({ message: req.t("api.deprecated") }) }, require("./v1"));
router.use("/v2", require("./v2"));

// 404 hanler
router.use((req, res) => {
    res.status(404).json({ message: req.t("api.error.404") });
})

module.exports = router;