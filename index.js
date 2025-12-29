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
const WikiPage = require("./models/wikiPage")

async function main() {
    // Connet to DB
    try {
        await mongoose.connect(process.env.NODE_ENV == "production" ? config.mongodb.uriProd : config.mongodb.uriDev);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }

    // Clear WikiPage isPurging flag
    await WikiPage.updateMany({}, { $set: { isPurging: false } });

    // Initialize passport
    require("./passport")(passport);
    
    const app = express();

    // Use React for templating
    app.set("view engine", "jsx");
    app.set("views", path.resolve(config.source.folder));
    app.engine("jsx", JSXEngine);

    app.disable("x-powered-by");
    app.set("trust proxy", app.get("env") == "production");

    app.use(bodyParser.json({ limit: "50mb" }));
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
            sameSite: "lax",
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
            directives: config.helmet.directives
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
    const redirect = lnk => (req, res) => { res.redirect(lnk) }

    app.use("/", routes.home);
    app.use("/users", routes.users);
    app.use("/settings", routes.settings);
    app.use("/register", routes.register);
    app.use("/login", routes.login);
    app.use("/logout", routes.logout);
    app.use("/filestorage", routes.filestorage);
    app.use("/passwordgenerator", redirect("/password_generator"));
    app.use("/password_generator", routes.passwordGenerator);
    app.use("/admin", routes.admin);
    app.use("/modsportal", redirect("/mods_portal"));
    app.use("/mods_portal", routes.modsportal);
    app.use("/albiontools", redirect("/albion_tools"));
    app.use("/albion_tools", routes.albion);
    app.use("/wiki", redirect("/wikis"));
    app.use("/wikis", routes.wiki);

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
    const httpServer = http.createServer({ requestTimeout: config.server.requestTimeout }, app);
    const io = new sio.Server(httpServer);

    // Socket Handling
    const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);
    io.use(wrap(sessionMiddleware));
    io.use(wrap(passport.initialize()));
    io.use(wrap(passport.session()));
    require("./bin/socket-handler")(io);

    const server = httpServer.listen(config.port, "0.0.0.0", () => {
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