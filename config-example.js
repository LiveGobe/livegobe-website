module.exports = {
    source: {
        folder: "./src/"
    },
    pages: {
        pageName: "page",
        scriptName: "script",
        styleName: "style",
        folderPath: "./src/pages/"
    },
    public: {
        staticLinkDev: "/public/",
        staticLinkProd: "https://static.livegobe.ru/",
        bundlesFolder: "./public/bundles/",
        pagesFolder: "./public/pages/",
        externals: {
            jquery: "jQuery"
        }
    },
    render: {
        doctype: "<!DOCTYPE html>",
        staticPrefix: "_",
        keepPrefix: false
    },
    mongodb: {
        uriDev: "devURI",
        uriProd: "prodURI"
    },
    session: {
        secret: "secret",
        cookieAge: 1000 * 60 * 60 * 24,
        touchAfter: 60 * 60
    },
    filestorage: {
        path: "/filestorage/"
    },
    port: 8080
}