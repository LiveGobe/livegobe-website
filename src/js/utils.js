export function even(n) {
	return n % 2 === 0;
}

export function formatBytes(a,b=2,k=1024){let d=Math.floor(Math.log(a)/Math.log(k));return 0==a?"0 Bytes":parseFloat((a/Math.pow(k,d)).toFixed(Math.max(0,b)))+" "+["Bytes","KiB","MiB","GiB","TiB","PiB","EiB","ZiB","YiB"][d]}

export function reverseFormatBytes(s){return (m => m ? parseFloat(m[1]) * Math.pow(1024, {'Bytes': 0, 'KiB': 1, 'MiB': 2, 'GiB': 3, 'TiB': 4, 'PiB': 5, 'EiB': 6, 'ZiB': 7, 'YiB': 8}[m[2]]) : NaN)(s.match(/^([\d.]+) *(Bytes|KiB|MiB|GiB|TiB|PiB|EiB|ZiB|YiB)$/));};

export function filenameValid(filename, length = 260) {
    const rg1 = /[<>:"/\\,|?*\u0000-\u001F]/g;
    const rg2 = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
    return !rg1.test(filename) && !rg2.test(filename) && filename.length > 0 && filename.length <= length && !filename.endsWith('.');
}

export function foldernameValid(foldername, length = 260) {
    const rg1 = /[\.<>:"/\\,|?*\u0000-\u001F]/g;
    const rg2 = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
    return !rg1.test(foldername) && !rg2.test(foldername) && foldername.length > 0 && foldername.length <= length;
}

export function staticUrl(url) {
	if (process.env.NODE_ENV == "production") return `${config.public.staticLinkProd}${url}`
	else return `${config.public.staticLinkDev}${url}`;
}

export function formatTime(s) {
    let hours = Math.floor(s / 3600);
    let minutes = Math.floor((s % 3600) / 60);
    let seconds = Math.floor(s % 60);
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export function stob(val) { return val == "true"}