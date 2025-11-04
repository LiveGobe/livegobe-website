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

function versionValid(version, length = 260) {
    const rg1 = /[\<>:"/\\,|?*\u0000-\u001F]/g;
    const rg2 = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
    return !rg1.test(version) && !rg2.test(version) && !version.endsWith(".") && !version.startsWith(".") && version.length > 0 && version.length <= length;
}

function staticUrl(url) {
    if (process.env.NODE_ENV == "production") return `${config.public.staticLinkProd}${url}`
	else return `${config.public.staticLinkDev}${url}`;
}

function bundleUrl(bundle) {
    return staticUrl(`bundles/${bundle}`);
}

function sanitizeFilename(input, replacement = "") {
    if (typeof input !== 'string') {
        throw new Error('Input must be string');
    }

    let illegalRe = /[\/\?<>\\:\*\|"]/g;
    let controlRe = /[\x00-\x1f\x80-\x9f]/g;
    let reservedRe = /^\.+$/;
    let windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    let windowsTrailingRe = /[\. ]+$/;
    let sanitized = input
        .replace(illegalRe, replacement)
        .replace(controlRe, replacement)
        .replace(reservedRe, replacement)
        .replace(windowsReservedRe, replacement)
        .replace(windowsTrailingRe, replacement);
    return sanitized;
}

function getSupportedNamespaces() {
    return ["Main", "Help", "User", "File", "Category", "Template", "Module", "Special"];
}

module.exports = {
    formatBytes,
    filenameValid,
    foldernameValid,
    staticUrl,
    bundleUrl,
    sanitizeFilename,
    versionValid,
    getSupportedNamespaces
}