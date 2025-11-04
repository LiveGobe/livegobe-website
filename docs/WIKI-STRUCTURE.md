# Multi-Wiki System Structure

## Overview
A flexible multi-wiki system that allows creating and managing multiple independent wikis within the LiveGobe platform. This document tracks the implementation status and planned features.

## Core Concepts

### Wiki Namespace & Unified Routing
- Each wiki is a namespace (e.g., "docs", "guides").
- All wiki content and special pages are accessed via a single route pattern:

```
/wikis/{wikiName}/{PageName}
```

- Special pages use the `Special:` prefix in the page name, e.g.:
  - `/wikis/{wikiName}/Special:Settings` (settings page)
  - `/wikis/{wikiName}/Special:AllPages` (all pages list)
  - `/wikis/{wikiName}/{PageName}?action=history` (history for a page)
- Language is handled via cookies (no URL prefix needed)
  - Content language matches the user's language preference
  - Special page names are translated based on cookie value
  - UI strings come from `locales/{lang}.json`
- There are no separate routes for settings, history, etc.—they are just special page names within the namespace.
- This approach is similar to MediaWiki and allows for easy extension of special features.

## Data Models

### Wiki
```javascript
{
  name: {                    // URL-friendly name (e.g., "docs")
    type: String,
    required: true,
    unique: true
  },
  language: {                // Default language (e.g., "en")
    type: String,
    required: true
  },
  title: {                   // Display name (e.g., "API Documentation")
    type: String,
    required: true
  },
  description: String,       // Brief description
  settings: {
    theme: String,          // Theme identifier
    allowAnonymousRead: Boolean,
    allowAnonymousEdit: Boolean,
    defaultLayout: String   // Wiki page layout template
  },
  createdAt: Date,
  updatedAt: Date
}
```

### WikiPage
```javascript
{
  wiki: {                              // References parent wiki
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wiki',
    required: true,
    index: true
  },
  title: {                            // Page title without namespace
    type: String,
    required: true
  },
  namespace: {                        // Page namespace (Main, Template, etc)
    type: String,
    required: true,
    default: "Main",
    enum: utils.getSupportedNamespaces()
  },
  path: {                            // Full path including parent pages
    type: String,                    // e.g., "Parent/Child/Subpage"
    required: true
  },
  content: {                         // Current markdown content
    type: String,
    required: true
  },
  html: {                           // Rendered HTML (generated on save)
    type: String
  },
  revisions: [{                     // Full revision history
    content: String,               
    comment: String,
    author: {                      // Reference to User model
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: Date,
    minor: Boolean                 // Minor edit flag
  }],
  createdAt: Date,
  createdBy: {                     // Original author
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedAt: Date,
  lastModifiedBy: {                // Last editor
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  categories: [String],            // Category links
  templateUsedBy: [{               // For template pages, tracks usage
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WikiPage'
  }],
  protected: {                     // Page protection level
    type: String,
    enum: ["none", "edit", "move", "full"],
    default: "none"
  }
}
```

## Permissions System

Permissions are tied to individual users using the existing `permissions` array on the `User` model (a list of lowercase strings). We recommend a simple, namespaced permission-string convention so permissions remain human-readable and map cleanly to the existing codebase.

### Permission string convention
- Format: `wiki:{wiki}:{role}`
  - Examples:
    - `wiki:docs:admin` — full control over the `docs` wiki
    - `wiki:guides:editor` — can edit pages in the `guides` wiki
    - `wiki:guides:viewer` — can view private pages in `guides` wiki
  - Keep role names lowercase and simple (`admin`, `editor`, `viewer`, `creator`).

### Global roles
- `admin` — global administrator (keeps backwards compatibility with existing `hasRole('admin')` checks)
- `wiki_creator` — allowed to create new wikis

### Behaviour and examples
- Public wikis: if `wiki.settings.allowAnonymousRead` is true, anonymous users may view pages without a `wiki:{wiki}:viewer` permission.
- Global admin override: code should treat the global `admin` permission as an override for wiki-level checks.
- Granting: to give a user editor rights for `docs` wiki, add the string `wiki:docs:editor` to their `permissions` array.

## Implementation Status

### Completed Features
- [x] Multiple independent wikis with unique URLs
- [x] Wiki creation with slugified names
- [x] Page creation and editing with revision history
- [x] Permission management and access control
- [x] Namespace support (Main, Template, Category, Help)
- [x] Special pages (AllPages, RecentChanges)
- [x] Page protection levels
- [x] Category system
- [x] Basic API endpoints (GET pages)
- [x] Client-side editor improvements
- [x] Additional API endpoints (create/edit/history)

### In Progress
- [-] Page history view with diff support
- [-] Custom wiki parser

### Pending Features
- [ ] Custom themes per wiki
- [ ] Custom navigation structure
- [ ] Page templates
- [ ] Cross-wiki linking
- [ ] Search within wiki
- [ ] Global search across wikis
- [ ] Wiki import/export
- [ ] Full API coverage

### Wiki Markup Features
- [ ] Headers (h1-h6)
- [ ] Text formatting (bold, italic)
- [ ] Links (internal/external)
- [ ] Lists (ordered/unordered)
- [ ] Code blocks with syntax highlighting
- [ ] Tables
- [ ] Images
- [ ] Embedded media
- [ ] Math equations

## Next Steps

1. Complete page middleware implementation:
   - Centralize wiki/page loading
   - Handle 404/403 responses consistently
   - Clean up route handlers

2. Enhance page editing:
   - Add client-side preview
   - Implement autosave
   - Add diff view for revisions
   - Improve edit summary UI

3. Complete API implementation:
   - Add remaining CRUD endpoints
   - Add revision management
   - Add proper error responses
   - Document API fully

4. Add tests and documentation:
   - Unit tests for models
   - Integration tests for API
   - Update locale files
   - Complete API documentation

## API Endpoints

### Wiki Management
```
GET    /api/v2/wikis                # List accessible wikis
POST   /api/v2/wikis                # Create new wiki
GET    /api/v2/wikis/:name          # Get wiki details
PUT    /api/v2/wikis/:name          # Update wiki settings
DELETE /api/v2/wikis/:name          # Delete wiki (admin only)
```

### Page Management
```
GET    /api/v2/wikis/:name/pages/:title*        # Get page content/metadata
POST   /api/v2/wikis/:name/pages/:title*        # Create/update page
DELETE /api/v2/wikis/:name/pages/:title*        # Delete page

# Special endpoints
GET    /api/v2/wikis/:name/pages/Special:AllPages       # List all pages
GET    /api/v2/wikis/:name/pages/Special:RecentChanges  # Recent changes
```

Query parameters for page endpoints:
- `mode=view|edit|history` - View mode
- `includeRevisions=1` - Include revision history (editors only)
- `namespace=Main|Template|Category|Help` - Filter by namespace
- `page=1&limit=50` - Pagination for listings

### Revision Management (Planned)
```
GET    /api/v2/wikis/:name/pages/:title*/revisions      # List revisions
GET    /api/v2/wikis/:name/pages/:title*/revisions/:id  # Get specific revision
POST   /api/v2/wikis/:name/pages/:title*/restore/:id    # Restore old revision
GET    /api/v2/wikis/:name/pages/:title*/diff/:from/:to # View diff between revisions
```

## Integration Points

### User System
- Uses existing User model
- Integrates with current authentication
- Extends user profiles with wiki preferences

### Frontend
- Follows current site theme
- Responsive design
- Accessible
- SEO-friendly URLs

### Search
- Elasticsearch integration
- Full-text search
- Faceted navigation
- Real-time suggestions

## Development Guidelines

### Security Considerations
1. Input sanitization
2. XSS prevention
3. CSRF protection
4. Rate limiting
5. Permission validation

### Performance
1. Caching strategy
2. Pagination
3. Lazy loading
4. Search optimization
5. Asset optimization

### Language Handling
- Language preference is stored in cookies (using existing app mechanism)
- Fallback chain:
  1. Language cookie value (e.g., 'en' or 'ru')
  2. User's default language preference (if logged in)
  3. Default to 'en'
- Content storage:
  - Wiki content is stored with translations in the database
  - UI strings use existing `locales/{lang}.json` files
  - Special pages names are localized via locale files
- Language switching:
  - Uses existing language switcher component
  - Persists selection in cookie
  - Maintains current page when switching languages

## Future Considerations

### Scalability
- Horizontal scaling
- Caching layers
- Database optimization
- Content delivery

### Integration
- External auth providers
- Third-party plugins
- API webhooks
- Export formats

### Community Features
- Comments
- Ratings
- Contributor badges
- Activity feed
- Notifications