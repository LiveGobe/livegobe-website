const express = require("express");
const passport = require("passport");
const router = express.Router();
const utils = require("../../bin/utils");

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
    if (req.user) return res.json({ success: false, message: req.t("api.login.loggedin")})
    
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);

        if (!user) return res.json({ success: false, message: req.t("api.login.invalid")});

        req.logIn(user, (err) => {
            if (err) return next(err);
            if (req.body.remember == "true") req.session.cookie.maxAge = null;
            res.json({ success: true, message: req.t("api.login.success")});
        });
    })(req, res, next);
});

// Versioned routes
router.use("/v1", require("./v1"));

// 404 hanler
router.use((req, res) => {
    res.status(404).json({ success: true, message: req.t("api.error.404") });
})

module.exports = router;