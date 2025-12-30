# Wiki Migration Scripts

## migrateWikiToFileStorage.js

Migrates WikiPage documents from MongoDB to file-based storage.

### What it does

- Reads all `WikiPage` documents from MongoDB
- Writes to disk:
  - `content.txt` - Source wiki text
  - `html.html` - Rendered HTML output
  - `revisions.json` - Revision history with content
- Skips pages already migrated (file exists on disk)
- Handles errors gracefully (one failure doesn't stop the process)
- Provides detailed progress reporting

### Usage

#### Preview without making changes
```bash
node misc/migrateWikiToFileStorage.js --dry-run
```

#### Run actual migration
```bash
node misc/migrateWikiToFileStorage.js
```

#### Migrate specific wiki only
```bash
node misc/migrateWikiToFileStorage.js --wiki=<mongoId>
```

#### Verbose mode (see each page)
```bash
node misc/migrateWikiToFileStorage.js --verbose
```

### Options

- `--dry-run` - Preview what would be migrated without writing files
- `--wiki=<mongoId>` - Migrate only specific wiki by MongoDB _id
- `--verbose` - Show detailed progress for each page

### Output

- Progress every 10 pages
- Summary with counts (migrated, skipped, errors)
- Error details if any failures occur
- Exit code 0 on success, 1 if errors occurred

### Idempotency

Safe to run multiple times:
- Skips pages that already have files on disk
- Won't overwrite unless explicitly run again
- Each page migration is independent

### Rollback

Files are stored in `./public/wiki-storage/<wikiId>/` directory.
To rollback, simply delete this directory and re-run the app (it will read from DB).
