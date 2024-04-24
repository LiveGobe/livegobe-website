const React = require("react");
const Head = require("../../components/head");
const Bundle = require ("../../components/bundle");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.passwordgenerator.title")}>
                <Bundle name="password-generator.js" />
                <Bundle name="password-generator.css" />
            </Head>
            <body data-theme={props.theme}>
                <div id="wrapper">
                    <div id="title">
                        <a id="back" href="/">
                            <div>{props.t("page.passwordgenerator.back")}</div>
                        </a>
                        <h1>{props.t("page.passwordgenerator.title")}</h1>
                    </div>
                    <div id="body">
                        <input id="password" name="password" type="text" readOnly placeholder={props.t("page.passwordgenerator.passwordhere")} />
                        <button id="generate">{props.t("page.passwordgenerator.generate")}</button>
                        <div id="options">
                            <div className="column">
                                <div>
                                    <input type="number" name="passwordlength" id="passwordlength" min="5" max="75" defaultValue="10" />
                                    <label id="passlength" htmlFor="passwordlength">{props.t("page.passwordgenerator.passwordlength")}</label>
                                </div>
                                <div>
                                    <input type="checkbox" name="includenumbers" id="includenumbers" />
                                    <label htmlFor="includenumbers">{props.t("page.passwordgenerator.includenumbers")}</label>
                                </div>
                                <div>
                                    <input type="checkbox" name="includeuppercase" id="includeuppercase" />
                                    <label htmlFor="includeuppercase">{props.t("page.passwordgenerator.includeuppercase")}</label>
                                </div>
                                <div>
                                    <input type="checkbox" name="includespecial" id="includespecial" />
                                    <label htmlFor="includespecial">{props.t("page.passwordgenerator.includespecial")}</label>
                                </div>
                            </div>
                            <div className="column">
                                <div>
                                    <input type="checkbox" name="copytoclipboard" id="copytoclipboard" />
                                    <label htmlFor="copytoclipboard">{props.t("page.passwordgenerator.copytoclipboard")}</label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="footer">{props.t("copyright")}</div>
                </div>
            </body>
        </html>
    )
}