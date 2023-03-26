const express = require("express");
const http = require("node:http");
const sio = require("socket.io");
const path = require("node:path");
const passport = require("passport");
const mongoose = require("mongoose");
const helmet = require("helmet");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const config = require("./config");
const JSXEngine = require("express-react-views").createEngine({ doctype: config.render.doctype });

const routes = require("./routes");

async function main() {
    // Connet to DB
    try {
        await mongoose.connect(process.env.NODE_ENV == "production" ? config.mongodb.uriProd : config.mongodb.uriDev, { useNewUrlParser: true });
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
    // Initialize passport
    require("./passport")(passport);
    
    const app = express();

    // Use React for templating
    app.set("view engine", "jsx");
    app.set("views", path.resolve(config.source.folder));
    app.engine("jsx", JSXEngine);

    app.disable("x-powered-by");
    app.set("trust proxy", app.get("env") == "production");

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(cookieParser());
    const sessionMiddleware = session({
        secret: config.session.secret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: config.session.cookieAge,
            secure: app.get("env") == "production",
            httpOnly: true,
            sameSite: "strict",
        },
        store: new MongoStore({
            mongoUrl: app.get("env") == "production" ? config.mongodb.uriProd : config.mongodb.uriDev,
            stringify: false,
            touchAfter: config.session.touchAfter
        })
    })
    app.use(sessionMiddleware);
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(require("./bin/repack-locales-middleware")({ supportedLanguages: ["en", "ru"] }));

    // API routes
    app.use("/api", routes.api);

    // Headers
    app.use(helmet({
        contentSecurityPolicy: {
            useDefaults: false,
            directives: {
                defaultSrc: ["'self'", "livegobe.ru", "*.livegobe.ru"],
                baseUri: ["'self'", "livegobe.ru", "*.livegobe.ru"],
                blockAllMixedContent: [],
                fontSrc: ["*"],
                formAction: ["'self'", "livegobe.ru", "*.livegobe.ru"],
                frameAncestors: ["'self'", "livegobe.ru", "*.livegobe.ru"],
                imgSrc: ["*"],
                objectSrc: ["'none'"],
                scriptSrc: ["*", "'unsafe-eval'", "'unsafe-inline'"],
                scriptSrcAttr: ["'none'"],
                styleSrc: ["'self'", "livegobe.ru", "*.livegobe.ru", "'unsafe-inline'"]
            }
        }
    }));

    if (app.get("env") == "development") app.use("/public", express.static("public", { fallthrough: false }));
    app.use(require("./bin/repack-serve-middleware")());
    
    // Pass data to locals
    app.use((req, res, next) => {
        res.locals.theme = req.cookies.theme || "light";
        res.locals.user = req.user || undefined;
        next();
    });

    // Normal routes
    app.use("/", routes.home);
    app.use("/users", routes.users);
    app.use("/login", routes.login);
    app.use("/logout", routes.logout);
    app.use("/filestorage", routes.filestorage);
    app.use("/passwordgenerator", (req, res) => { res.redirect("/password_generator") });
    app.use("/password_generator", routes.passwordGenerator);

    // Test page
    if (app.get("env") == "development") {
        app.get("/test", (req, res) => {
            res.serve("_test");
        })
    }

    // 404 handler
    app.use((req, res) => {
        res.status(404).serve("_404");
    });

    // Socket Server
    const httpServer = http.createServer(app);
    const io = new sio.Server(httpServer);

    // Socket Handling
    const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
    io.use(wrap(sessionMiddleware));
    io.use(wrap(passport.initialize()));
    io.use(wrap(passport.session()));
    require("./bin/socket-handler")(io);

    server = httpServer.listen(config.port, () => {
        console.log(`Server started on port ${config.port} in ${app.get("env")} mode`);
    });

    process.on("SIGTERM", () => {
        mongoose.connection.close().then(() => {
            console.log("Mongoose connection closed");
            server.close((e) => {
                if (e) console.log(e);
                process.exit(0);
            });
        });
    });
}

main();