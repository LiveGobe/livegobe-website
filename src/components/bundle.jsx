const React = require('react');
const pck = require("../../package.json");
const utils = require("../../bin/utils");

function Bundle(props) {
    if (props.name.endsWith("js")) return (
        <script src={utils.bundleUrl(props.name.replace(".", `-${pck.version}.`))} defer/>
    );
    else if (props.name.endsWith("css")) return (
        <link rel="stylesheet" href={utils.bundleUrl(props.name.replace(".", `-${pck.version}.`))} />
    );
    
    return "";
}

module.exports = Bundle;