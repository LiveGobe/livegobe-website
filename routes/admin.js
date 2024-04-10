const express = require("express");
const router = express.Router();
const User = require("../models/user");
const Filestorage = require("../models/filestorage");

router.get("/", (req, res) => {
    if (!req.user) return res.redirect("/login?redirect=/admin");
    if (!req.user.hasRole("admin")) return res.redirect("/");

    const userDocuments = User.countDocuments();
    const userFilestorageDocuments = User.countDocuments({ $or: [{ permissions: "admin" }, {permissions: "filestorage" }]});
    const aggregation = Filestorage.aggregate().match({}).group({ _id: null, size: { $sum: "$size" }, maxSize: { $sum: "$maxSize" }}).exec();

    Promise.all([userDocuments, userFilestorageDocuments, aggregation]).then(([usersTotal, usersFilestorage, filestorage]) => {
        filestorage = filestorage[0];
        res.serve("admin", { usersTotal, usersFilestorage, spaceTotal: filestorage.maxSize, spaceUsed: filestorage.size });
    }).catch(error => {
        res.status(500).send(error.toString());
    });
});

module.exports = router;