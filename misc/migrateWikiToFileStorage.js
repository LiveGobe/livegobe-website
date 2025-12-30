#!/usr/bin/env node

/**
 * Migration script: MongoDB wiki pages → File Storage
 * 
 * Migrates WikiPage documents from MongoDB to file-based storage
 * - content.txt
 * - html.html
 * - revisions.json
 * 
 * Usage:
 *   node migrateWikiToFileStorage.js [--dry-run] [--wiki=<wikiId>]
 * 
 * Options:
 *   --dry-run         Preview what would be migrated without writing
 *   --wiki=<id>       Migrate only specific wiki (by MongoDB _id)
 *   --verbose         Show detailed progress
 */

const mongoose = require('mongoose');
const path = require('path');
const config = require('../config');
const fileStorage = require('../bin/wiki-file-storage');
const WikiPage = require('../models/wikiPage');
const Wiki = require('../models/wiki');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const wikiIdArg = args.find(a => a.startsWith('--wiki='))?.split('=')[1];

let migratedCount = 0;
let skippedCount = 0;
let errorCount = 0;
const errors = [];

function log(msg) {
    console.log(`[migrate] ${new Date().toISOString()} ${msg}`);
}

function logError(msg, err) {
    console.error(`[migrate] ERROR: ${msg}`, err ? err.message : '');
    errors.push({ msg, err: err?.message });
}

async function connectDb() {
    const mongoUri = process.env.MONGODB_URI || config.mongodb.uriProd;
    log(`Connecting to MongoDB: ${mongoUri}`);
    
    try {
        await mongoose.connect(mongoUri);
        log('Connected to MongoDB ✓');
    } catch (err) {
        logError('Failed to connect to MongoDB', err);
        process.exit(1);
    }
}

async function migratePage(page, dryRunMode = false) {
    const id = page._id.toString();
    const title = `${page.namespace}:${page.path}`;
    
    try {
        // Skip if already migrated (has files on disk)
        const existingContent = await fileStorage.readContent(page.wiki, page.namespace, page.path).catch(() => null);
        if (existingContent && existingContent.length > 0) {
            if (verbose) log(`  SKIP ${title} (already migrated)`);
            skippedCount++;
            return;
        }
        
        if (dryRunMode) {
            const contentSize = page.content ? page.content.length : 0;
            const htmlSize = page.html ? page.html.length : 0;
            const revCount = Array.isArray(page.revisions) ? page.revisions.length : 0;
            log(`  [DRY-RUN] ${title} (content: ${contentSize}B, html: ${htmlSize}B, revisions: ${revCount})`);
            migratedCount++;
            return;
        }
        
        // Migrate content
        if (page.content) {
            await fileStorage.writeContent(page.wiki, page.namespace, page.path, page.content);
            if (verbose) log(`    ✓ Migrated content (${page.content.length} bytes)`);
        }
        
        // Migrate rendered HTML
        if (page.html) {
            await fileStorage.writeHtml(page.wiki, page.namespace, page.path, page.html);
            if (verbose) log(`    ✓ Migrated HTML (${page.html.length} bytes)`);
        }
        
        // Migrate revisions with content
        if (Array.isArray(page.revisions) && page.revisions.length > 0) {
            const revisionsData = page.revisions.map(rev => ({
                content: rev.content || '',
                comment: rev.comment || '',
                author: rev.author,
                timestamp: rev.timestamp,
                minor: rev.minor
            }));
            await fileStorage.writeRevisions(page.wiki, page.namespace, page.path, revisionsData);
            if (verbose) log(`    ✓ Migrated ${revisionsData.length} revisions`);
        }
        
        migratedCount++;
        log(`  ✓ ${title}`);
        
    } catch (err) {
        errorCount++;
        logError(`Failed to migrate ${title}`, err);
    }
}

async function main() {
    log(`Starting migration (dry-run: ${dryRun ? 'YES' : 'NO'})`);
    
    await connectDb();
    
    try {
        let query = {};
        
        // Filter by specific wiki if provided
        if (wikiIdArg) {
            if (!mongoose.Types.ObjectId.isValid(wikiIdArg)) {
                logError(`Invalid wiki ID: ${wikiIdArg}`);
                process.exit(1);
            }
            query.wiki = new mongoose.Types.ObjectId(wikiIdArg);
            const wiki = await Wiki.findById(wikiIdArg);
            if (!wiki) {
                logError(`Wiki not found: ${wikiIdArg}`);
                process.exit(1);
            }
            log(`Filtering to wiki: ${wiki.name} (${wikiIdArg})`);
        }
        
        // Count total
        const total = await WikiPage.countDocuments(query);
        log(`Found ${total} pages to migrate`);
        
        if (total === 0) {
            log('No pages to migrate.');
            process.exit(0);
        }
        
        // Batch migration to avoid memory issues
        const batchSize = 100;
        let processed = 0;
        
        for (let skip = 0; skip < total; skip += batchSize) {
            const batch = await WikiPage.find(query)
                .skip(skip)
                .limit(batchSize)
                .lean();
            
            for (const page of batch) {
                await migratePage(page, dryRun);
                processed++;
                
                // Progress indicator
                if (processed % 10 === 0) {
                    const pct = ((processed / total) * 100).toFixed(1);
                    log(`Progress: ${processed}/${total} (${pct}%)`);
                }
            }
        }
        
        // Summary
        log('');
        log('=' .repeat(50));
        log('MIGRATION SUMMARY');
        log('=' .repeat(50));
        log(`✓ Migrated: ${migratedCount}`);
        log(`⊘ Skipped:  ${skippedCount}`);
        log(`✗ Errors:   ${errorCount}`);
        log(`Total:    ${migratedCount + skippedCount + errorCount}`);
        
        if (errors.length > 0) {
            log('');
            log('ERROR DETAILS:');
            errors.forEach((e, i) => {
                log(`  ${i + 1}. ${e.msg}: ${e.err}`);
            });
        }
        
        if (dryRun) {
            log('');
            log('⚠️  DRY-RUN MODE - No files were written');
            log('Run without --dry-run to perform actual migration');
        }
        
        log('');
        
    } catch (err) {
        logError('Migration failed', err);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        log('Disconnected from MongoDB');
    }
    
    // Exit with error code if there were failures
    process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
