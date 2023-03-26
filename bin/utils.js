const config = require("../config");

function formatBytes(a,b=2,k=1024){with(Math){let d=floor(log(a)/log(k));return 0==a?"0 Bytes":parseFloat((a/pow(k,d)).toFixed(max(0,b)))+" "+["Bytes","KiB","MiB","GiB","TiB","PiB","EiB","ZiB","YiB"][d]}}

function filenameValid(filename, length = 260) {
    const rg1 = /[<>:"/\\,|?*\u0000-\u001F]/g;
    const rg2 = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
    return !rg1.test(filename) && !rg2.test(filename) && filename.length > 0 && filename.length <= length && !filename.endsWith('.');
}

function foldernameValid(foldername, length = 260) {
    const rg1 = /[\.<>:"/\\,|?*\u0000-\u001F]/g;
    const rg2 = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
    return !rg1.test(foldername) && !rg2.test(foldername) && foldername.length > 0 && foldername.length <= length;
}

function staticUrl(url) {
    if (process.env.NODE_ENV == "production") return `${config.public.staticLinkProd}${url}`
	else return `${config.public.staticLinkDev}${url}`;
}

function bundleUrl(bundle) {
    return staticUrl(`bundles/${bundle}`);
}

module.exports = {
    formatBytes,
    filenameValid,
    foldernameValid,
    staticUrl,
    bundleUrl
}