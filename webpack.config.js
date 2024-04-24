const miniCssExtractPlugin = require("mini-css-extract-plugin");
const path = require("node:path");
const glob = require("glob");
const fs = require("node:fs");
const watch = require("node-watch");
const colors = require("colors");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const config = require("./config");
const Webpack = require("webpack");
const env = process.env.NODE_ENV == "production" ? "production" : "development";
const package = require("./package.json");

function renderFile(page) {
    let staticDir = path.resolve(__dirname, config.public.pagesFolder);
    try {
        delete require.cache[require.resolve(page)];
        let component = require(page);
        // component can be either ES6 or CommonJS module
        component = component.default || component;
        // render component
        let result = config.render.doctype + renderToStaticMarkup(createElement(component));
        // save it to output folder
        let pageName = path.dirname(page).split(/\\|\//).at(-1).slice(config.render.keepPrefix ? 0 : config.render.staticPrefix.length);
        fs.mkdirSync(staticDir, { recursive: true });
        fs.writeFileSync(path.join(staticDir, pageName + ".html"), result);
        console.log(`Static page ${colors.yellow(pageName)} rendered ${colors.green("sccessfully")}`);
    } catch (e) {
        console.log(`Static page ${colors.yellow(pageName)} render ${colors.red("failed")}`);
        console.log(e);
    }
}

// render static React templates
let staticPages = glob.sync(`${config.pages.folderPath}${config.render.staticPrefix}*/${config.pages.pageName}.jsx`).map(val => path.resolve(val));
// use babel to 'require' react components
require("@babel/register")({only: [config.source.folder], presets: [ '@babel/preset-react', [ '@babel/preset-env', { targets: { node: 'current' } } ] ], plugins: ['@babel/transform-flow-strip-types'] })
staticPages.forEach((page) => {
    renderFile(page);
    if (process.argv.includes("--watch")) watch(page, () => {
        renderFile(page);
    });
});

let sources = glob.sync(`${config.pages.folderPath}*/@(${config.pages.scriptName}.js|${config.pages.styleName}.scss)`);

// combine js and css of same page to the same array
let entries = {};
sources.forEach(source => {
    let page = path.dirname(source).replace(config.pages.folderPath, "");
    if (!entries[page]) {
        entries[page] = [];
    }
    entries[page].push(source);
});

/**
 * @type {import("webpack").Configuration}
 */
module.exports = {
    mode: env,
    experiments: {
        topLevelAwait: true
    },
    externals: config.public.externals || {},
    entry: entries,
    output: {
        path: path.resolve(__dirname, config.public.bundlesFolder),
        filename: `[name]-${package.version}.js`,
        clean: true
    },
    devtool: env == "production" ? undefined : "eval-source-map",
    module: {
        rules: [
            {
                test: /\.scss$/,
                use: [
                    miniCssExtractPlugin.loader,
                    {
                        loader: "css-loader",
                        options: {
                            url: false
                        }
                    },
                    {
                        loader: "sass-loader",
                        options: {
                            additionalData: `$staticLink: "${env == "production" ? config.public.staticLinkProd : config.public.staticLinkDev}";`
                        }
                    }
                ]
            }
        ]
    },
    plugins: [
        new miniCssExtractPlugin({
            filename: `[name]-${package.version}.css`
        }),
        new Webpack.DefinePlugin({
            config: JSON.stringify(config)
        })
    ]
};