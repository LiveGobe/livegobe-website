const fs = require('fs').promises;
const path = require('path');

const MAX_CONTENT_SIZE = 50 * 1024 * 1024; // 50MB
const TEMP_SUFFIX = '.tmp';

function log(level, msg, err) {
    const timestamp = new Date().toISOString();
    const logMsg = err ? `${msg} - ${err.message}` : msg;
    console.log(`[wiki-file-storage] [${level}] ${timestamp} ${logMsg}`);
}

function normalizeName(name) {
    return String(name || '').replace(/ /g, '_').replace(/[\\:\*\?"<>\|]/g, '');
}

function getWikiBase(wikiId) {
    const base = `./public/wiki-storage/`;
    // Resolve relative to project root
    return path.resolve(process.cwd(), base, String(wikiId));
}

function getPageDir(wikiId, namespace, pagePath) {
    const base = getWikiBase(wikiId);
    const ns = normalizeName(namespace || 'Main');
    const parts = String(pagePath || '').split('/').map(p => normalizeName(p));
    return path.join(base, ns, ...parts);
}

async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (e) {
        if (e.code !== 'EEXIST') {
            log('WARN', `Failed to create directory ${dir}`, e);
        }
    }
}

async function readFileIfExists(filePath) {
    try {
        return await fs.readFile(filePath, 'utf8');
    } catch (e) {
        if (e.code === 'ENOENT') return null;
        log('WARN', `Failed to read file ${filePath}`, e);
        throw e;
    }
}

async function writeFileAtomic(filePath, content) {
    const tempPath = filePath + TEMP_SUFFIX;
    const dir = path.dirname(filePath);
    
    try {
        await ensureDir(dir);
        // Write to temp file first
        await fs.writeFile(tempPath, content, 'utf8');
        // Atomic rename
        await fs.rename(tempPath, filePath);
        log('DEBUG', `Wrote ${filePath}`);
    } catch (e) {
        log('ERROR', `Failed to write ${filePath}`, e);
        // Cleanup temp file
        try { await fs.unlink(tempPath).catch(() => {}); } catch (ignore) { }
        throw e;
    }
}

async function getFallbackFromDb(wikiId, namespace, pagePath, field) {
    try {
        const WikiPage = require('../models/wikiPage');
        const page = await WikiPage.findOne({ 
            wiki: wikiId, 
            namespace, 
            path: pagePath 
        }).lean();
        
        if (!page) return null;
        
        if (field === 'content') return page.content || '';
        if (field === 'html') return page.html || '';
        if (field === 'revisions') return page.revisions || [];
        
        return null;
    } catch (e) {
        log('ERROR', `Failed to fallback to DB for ${namespace}:${pagePath}`, e);
        return null;
    }
}

module.exports = {
    async readContent(wikiId, namespace, pagePath) {
        const dir = getPageDir(wikiId, namespace, pagePath);
        const file = path.join(dir, 'content.txt');
        let txt = await readFileIfExists(file);
        
        // Fallback to DB if file doesn't exist
        if (txt === null) {
            log('WARN', `Content file missing for ${namespace}:${pagePath}, falling back to DB`);
            txt = await getFallbackFromDb(wikiId, namespace, pagePath, 'content');
        }
        
        return txt === null ? '' : txt;
    },
    
    async writeContent(wikiId, namespace, pagePath, content) {
        const contentStr = String(content || '');
        
        // Size validation
        if (contentStr.length > MAX_CONTENT_SIZE) {
            log('ERROR', `Content too large for ${namespace}:${pagePath} (${contentStr.length} bytes, max ${MAX_CONTENT_SIZE})`);
            throw new Error('Content size exceeds maximum limit');
        }
        
        const dir = getPageDir(wikiId, namespace, pagePath);
        const file = path.join(dir, 'content.txt');
        await writeFileAtomic(file, contentStr);
    },
    
    async readHtml(wikiId, namespace, pagePath) {
        const dir = getPageDir(wikiId, namespace, pagePath);
        const file = path.join(dir, 'html.html');
        let txt = await readFileIfExists(file);
        
        // Fallback to DB if file doesn't exist
        if (txt === null) {
            log('WARN', `HTML file missing for ${namespace}:${pagePath}, falling back to DB`);
            txt = await getFallbackFromDb(wikiId, namespace, pagePath, 'html');
        }
        
        return txt === null ? '' : txt;
    },
    
    async writeHtml(wikiId, namespace, pagePath, html) {
        const htmlStr = String(html || '');
        
        // Size validation
        if (htmlStr.length > MAX_CONTENT_SIZE) {
            log('ERROR', `HTML too large for ${namespace}:${pagePath} (${htmlStr.length} bytes, max ${MAX_CONTENT_SIZE})`);
            throw new Error('HTML size exceeds maximum limit');
        }
        
        const dir = getPageDir(wikiId, namespace, pagePath);
        const file = path.join(dir, 'html.html');
        await writeFileAtomic(file, htmlStr);
    },
    
    async readRevisions(wikiId, namespace, pagePath) {
        const dir = getPageDir(wikiId, namespace, pagePath);
        const file = path.join(dir, 'revisions.json');
        let txt = await readFileIfExists(file);
        
        // Fallback to DB if file doesn't exist
        if (txt === null) {
            log('WARN', `Revisions file missing for ${namespace}:${pagePath}, falling back to DB`);
            const dbRevs = await getFallbackFromDb(wikiId, namespace, pagePath, 'revisions');
            return Array.isArray(dbRevs) ? dbRevs : [];
        }
        
        try {
            return JSON.parse(txt);
        } catch (e) {
            log('ERROR', `Failed to parse revisions JSON for ${namespace}:${pagePath}`, e);
            // Fall back to empty array on parse error
            return [];
        }
    },
    
    async writeRevisions(wikiId, namespace, pagePath, revisions) {
        const revsArray = Array.isArray(revisions) ? revisions : [];
        const jsonStr = JSON.stringify(revsArray);
        
        // Size validation
        if (jsonStr.length > MAX_CONTENT_SIZE) {
            log('ERROR', `Revisions data too large for ${namespace}:${pagePath}`);
            throw new Error('Revisions size exceeds maximum limit');
        }
        
        const dir = getPageDir(wikiId, namespace, pagePath);
        const file = path.join(dir, 'revisions.json');
        await writeFileAtomic(file, jsonStr);
    }
};
