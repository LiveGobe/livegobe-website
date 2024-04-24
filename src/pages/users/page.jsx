const React = require("react");
const Head = require("../../components/head");
const Bundle = require("../../components/bundle");

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
        list.push(i + 1 == props.page ? <li><span>{i + 1}</span></li> : <li><a href={`/users?page=${i + 1}`}><span>{i + 1}</span></a></li>)
    }

    let removed = [];
    if (props.page >= 5) {
        list[1] = <li><span>…</span></li>;
        removed = list.splice(2, Math.max(1, Math.min(props.maxPages - 7, props.page - 4)));
    }

    if (props.page <= props.maxPages - 4) {
        list[props.maxPages - 2 - removed.length] = <li><span>…</span></li>;
        list.splice(props.maxPages - props.maxPages + 5, Math.max(1, Math.min(props.maxPages - 7, props.maxPages - props.page - 3)));
    }

    return list;
}

module.exports = function(props) {
    const maxPages = Math.ceil(props.docsNumber / props.maxOnPage);
    return (
        <html lang={props.language}>
            <Head title={props.t("page.users.name")}>
                <Bundle name="users.css" />
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
                        <li>{props.page == 1 ? "<=" : <a href={`/users?page=${props.page - 1}`}>{"<="}</a>}</li>
                        <PagesList maxPages={maxPages} {...props}/>
                        <li>{props.page == maxPages ? "=>" : <a href={`/users?page=${props.page + 1}`}>{"=>"}</a>}</li>
                    </menu>
                </footer>
            </body>
        </html>
    )
}