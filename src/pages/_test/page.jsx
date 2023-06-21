const React = require("react");

let txt = "RENDERED WITH REACT SUCKERS!"

module.exports = function(props) {
    return (
        <>
            <head>
                <script src="https://code.jquery.com/jquery-3.6.0.min.js" integrity="sha256-/xUj+3OJU5yExlq6GSYGSHk7tPXikynS7ogEvDej/m4=" crossOrigin="anonymous" />
            </head>
            <div>
                <h1 id="header">Test page</h1>
                <p>This is a test page.</p>
                <p>{txt}</p>
                <img id="img1" />
                <img id="img2" />
                <img id="img3" />
            </div>
            <script src="/public/bundles/_test.js" />
            <link rel="stylesheet" href="/public/bundles/_test.css" />
        </>
    )
}