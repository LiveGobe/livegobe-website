const React = require('react');

function NavigationSidebar(props) {
    return (
        <div id="navigation-sidebar" className="sidebar" style={{display: 'none'}}>
            <button className="sidebar-button" id="close-navigation">CLOSE</button>
            <div id="navigation-sidebar-content">
                {props.page == "home" ? <span>{props.t("navigation.home")}</span> : <a href="/">{props.t("navigation.home")}</a>}
                {props.page == "filestorage" ? <span>{props.t("navigation.filestorage")}</span> : <a href="/filestorage/browse">{props.t("navigation.filestorage")}</a>}
            </div>
        </div>
    );
}

module.exports = NavigationSidebar;