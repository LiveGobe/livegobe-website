const config = require("../config");
const path = require("node:path");

module.exports = function() {
    return function(req, res, next) {
        res.serve = (name, options) => {
            if (name.startsWith(config.render.staticPrefix)) {
                res.sendFile(path.resolve(config.public.pagesFolder, (config.render.keepPrefix ? name : name.slice(config.render.staticPrefix.length)) + ".html"))
            } else {
                res.render(`pages/${name}/page`, options);
            }
        }
        next();
    }
}