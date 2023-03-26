const React = require('react');
const UserPanel = require('./user-panel');
const NavigationSidebar = require("./navigation-sidebar");

function ControlPanel(props) {
    return (
        <>
            <NavigationSidebar {...props} />
            <header className="control-panel" id="control-panel">
                <div id="control-panel-content">
                    <div id="control-panel-content-left">
                        <button type="button" id="open-navigation">{props.t(`navigation.${props.page}`)}</button>
                        <button type="button" id="theme-switch">{props.t("theme.switch")}</button>
                    </div>
                    <div id="control-panel-content-right">
                        <UserPanel {...props} />
                    </div>
                </div>
            </header>
        </>
    );
}

module.exports = ControlPanel;