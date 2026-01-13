const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");
const utils = require("../../../bin/utils");
const config = require("../../../config");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.register.title")}>
                <Bundle name="register.js" />
                <Bundle name="register.css" />
                <meta property="og:title" content={`Register`} />
                <meta property="og:image" content={utils.staticUrl("images/home.png")} />
                <meta property="og:description" content={`Register an account on ${config.domainName}`} />
                <meta property="og:url" content={`https://${config.domainName}/register${props.registerKey ? "?=" + encodeURI(props.key) : ""}`} />
            </Head>
            
            <body data-theme={props.theme}>
                <div id="register-form">
                    <form>
                        <label>
                            <span>{props.t("page.register.username")}</span>
                            <input type="text" name="username" id="username" required />
                        </label>
                        <label>
                            <span>{props.t("page.register.name")}</span>
                            <input type="text" name="name" id="name" required />
                        </label>
                        <label>
                            <span>{props.t("page.register.password")}</span>
                            <input type="password" name="password" id="password" required autoComplete="new-password" />
                        </label>
                        <label>
                            <span>{props.t("page.register.passwordconfirm")}</span>
                            <input type="password" name="passwordConfirm" id="password-confirm" required autoComplete="new-password" />
                        </label>
                        <label>
                            <span>{props.t("page.register.key")}</span>
                            <input type="text" name="key" id="key" required autoComplete="off" />
                        </label>
                        <div id="register-buttons">
                            <input type="submit" id="submit" value={props.t("page.register.submit")} />
                            <a href="/">
                                <button type="button" id="back">{props.t("page.register.back")}</button>
                            </a>
                        </div>
                        <div id="legal">
                            By registering, you agree to our <a href="https://livegobe.ru/wikis/livegobe-wiki/Legal"> Terms of Service and Privacy Policy</a>.
                        </div>
                    </form>
                    <div id="error-message" hidden />
                </div>
            </body>
        </html>
    )
}