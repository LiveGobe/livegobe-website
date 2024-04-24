const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");

module.exports = function(props) {
    return (
        <html lang={props.language}>
            <Head title={props.t("page.users-user.name", { "0": props.pageUser.name } )}>
                <Bundle name="users-user.css" />
            </Head>
            <body>
                <div id="wrapper">
                    {props.pageUser.name} ({props.pageUser.username}) {props.pageUser.username == props.user.username ? "(Current)" : ""}
                </div>
            </body>
        </html>
    )
}