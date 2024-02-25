module.exports = {
    helmet: {
        directives: {
            defaultSrc: ["'self'", "example.com", "*.example.com"],
            baseUri: ["'self'", "example.com", "*.example.com"],
            blockAllMixedContent: [],
            fontSrc: ["*"],
            formAction: ["'self'", "example.com", "*.example.com"],
            frameAncestors: ["'self'", "example.com", "*.example.com"],
            imgSrc: ["*"],
            objectSrc: ["'none'"],
            scriptSrc: ["*", "'unsafe-eval'", "'unsafe-inline'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", "example.com", "*.example.com", "'unsafe-inline'"]
        }
    },
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
        staticLinkProd: "https://static.example.com/",
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
    port: 8080,
    domainName: "your domain name",
    server: {
        requestTimeout: 60 * 60 * 1000
    }
}