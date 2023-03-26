const React = require("react");
const Head = require("../../components/head");
const utils = require("../../../bin/utils");

function UserElement(props) {
    return (
        <a href={`/users/${props.user.username}`}>
            <li>{props.user.name} ({props.user.username})</li>
        </a>
    )
}

function PagesList(props) {
    let list = [];
    for (let i = 0; i < props.maxPages; i++) {
        list.push(i + 1 == props.page ? <li><span>{i + 1}</span></li> : <li><a href={`/users?page=${i + 1}`}><span>i + 1</span></a></li>)
    }
    return list;
}

module.exports = function(props) {
    const maxPages = Math.ceil(props.docsNumber / 50);
    return (
        <html lang={props.language}>
            <Head title={props.t("page.users.name")}>
                <link rel="stylesheet" href={utils.bundleUrl("users.css")} />
            </Head>
            <body>
                <div id="wrapper">
                    <ol>
                        {props.users.map(user => {
                            return <UserElement user={user} key={user.id} />
                        })}
                    </ol>
                </div>
                <footer>
                    <menu>
                        <li>{props.page == 1 ? "left" : <a href={`/users?page=${props.page - 1}`}>{"<"}</a>}</li>
                        <PagesList maxPages={maxPages} {...props}/>
                        <li>{props.page == maxPages ? "right" : <a href={`/users?page=${props.page + 1}`}>{">"}</a>}</li>
                    </menu>
                </footer>
            </body>
        </html>
    )
}