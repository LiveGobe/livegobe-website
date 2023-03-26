const React = require("react");
const Head = require("../../components/head");
const utils = require("../../../bin/utils");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.users-user.name")}>
                <link rel="stylesheet" href={utils.bundleUrl("users-user.css")} />
            </Head>
            <body>
                <div id="wrapper">
                    {props.pageUser.name} ({props.pageUser.username}) {props.pageUser.username == props.user.username ? "(Current)" : ""}
                </div>
            </body>
        </html>
    )
}