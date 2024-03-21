const React = require("react");
const Head = require("../../components/head");
const utils = require("../../../bin/utils");
const config = require("../../../config");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.register.title")}>
                <script src={utils.bundleUrl("register.js")} />
                <link rel="stylesheet" href={utils.bundleUrl("register.css")} />
                <meta property="og:title" content={`Register`} />
                <meta property="og:image" content={utils.staticUrl("images/home.png")} />
                <meta property="og:description" content={`Register an account on ${config.domainName}`} />
                <meta property="og:url" content={`https://${config.domainName}/register${props.key ? "?=" + encodeURI(props.key) : ""}`} />
            </Head>
            
            <body data-theme={props.theme}>
                <div id="register-form">
                    <form>
                        <label>
                            <span>{props.t("page.register.username")}</span>
                        </label>
                        <input type="text" name="username" id="username" required />
                        <label>
                            <span>{props.t("page.register.name")}</span>
                        </label>
                        <input type="text" name="name" id="name" required />
                        <label>
                            <span>{props.t("page.register.password")}</span>
                        </label>
                        <input type="password" name="password" id="password" required />
                        <label>
                            <span>{props.t("page.register.passwordconfirm")}</span>
                        </label>
                        <input type="password" name="passwordConfirm" id="password-confirm" required />
                        <label>
                            <span>{props.t("page.register.key")}</span>
                        </label>
                        <input type="text" name="key" id="key" required />
                        <div id="register-buttons">
                            <input type="submit" id="submit" value={props.t("page.register.submit")} />
                            <a href="/">
                                <button type="button" id="back">{props.t("page.register.back")}</button>
                            </a>
                        </div>
                    </form>
                    <div id="error-message" hidden />
                </div>
            </body>
        </html>
    )
}