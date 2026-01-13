const React = require("react");
const utils = require("../../bin/utils");

function Head(props) {
    return (
        <head>
            <title>{props.title}</title>
            <meta charSet="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            {!props.doIndex ? <meta name="robots" content="noindex, nofollow" /> : ""}
            <link rel="apple-touch-icon" sizes="180x180" href={utils.staticUrl("apple-touch-icon.png")} />
            <link rel="icon" type="image/png" sizes="32x32" href={utils.staticUrl("favicon-32x32.png")} />
            <link rel="icon" type="image/png" sizes="16x16" href={utils.staticUrl("favicon-16x16.png")} />
            <link rel="icon" type="image/ico" href={utils.staticUrl("favicon.ico")} />
            <link rel="mask-icon" href={utils.staticUrl("safari-pinned-tab.svg")} color="#555555" />
            <script src="https://code.jquery.com/jquery-3.7.1.min.js" integrity="sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=" crossOrigin="anonymous" />
            {props.children}
        </head>
    );
}

module.exports = Head;