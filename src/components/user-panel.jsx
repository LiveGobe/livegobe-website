const React = require('react');

function UserPanel(props) {
    if (!props.user) return (<div id="login"><a href={`/login${props.loginRedirectLink ? "?redirect=" + props.loginRedirectLink : ""}`}>{props.t("user.login")}</a></div>);

    return (
        <div id="user-panel" className="dropdown">
            <button type="button" className="dropbutton">{props.user.name}</button>
            <div className="dropdown-content">
                <a href={`/users/${props.user.username}`}>{props.t("user.profile")}</a>
                <a href="/settings">{props.t("user.settings")}</a>
                <hr style={{ margin: 0 }} />
                <a href="/logout">{props.t("user.logout")}</a>
            </div>
        </div>
    );
}

module.exports = UserPanel;