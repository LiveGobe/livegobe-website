const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.login.name")}>
                <Bundle name="login.js" />
                <Bundle name="login.css" />
            </Head>
            
            <body data-theme={props.theme}>
                <div id="login-form">
                    <form>
                        <label>
                            <span>{props.t("page.login.content.username")}</span>
                        </label>
                        <input type="text" name="username" id="username" required />
                        <label>
                            <span>{props.t("page.login.content.password")}</span>
                        </label>
                        <input type="password" name="password" id="password" required />
                        <div id="remember-form">
                            <input type="checkbox" name="remember" id="remember" />
                            <label><span>{props.t("page.login.content.remember")}</span></label>
                        </div>
                        <div id="login-buttons">
                            <input type="submit" id="submit" value={props.t("page.login.content.submit")} />
                            <a href="/">
                                <button type="button" id="back">{props.t("page.login.content.back")}</button>
                            </a>
                        </div>
                        <a href="/register">{props.t("page.login.content.register")}</a>
                    </form>
                    <div id="error-message" hidden />
                </div>
            </body>
        </html>
    )
}