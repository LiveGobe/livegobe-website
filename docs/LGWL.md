# LGWL/Wiki Renderer Features Roadmap

## Core Text
- [x] Paragraphs separated by single or double newlines
- [x] Escaping plain text to prevent XSS
- [x] Support for multiple wikis (relative links use `wikiName`)
- [x] Omit `Main` namespace in URLs for cleaner links

## Links
- [x] Internal wiki links `[[Page]]`
- [x] Links with custom labels `[[Page|Label]]`
- [x] Namespaced links `[[Namespace:Page]]`
- [x] Relative links always point to the current wiki
- [x] External links `[http://example.com Label]` syntax
- [x] Anchor links `[[#Section]]`

## Text Styling
- [x] Bold `'''bold'''`
- [x] Italic `''italic''`
- [x] Bold + Italic `'''''bold italic'''''`
- [x] Inline code `` `code` ``
- [x] Strikethrough `~~strikethrough~~`

## Headings
- [x] Headings with `== Heading ==` syntax
- [x] Auto-generate IDs for headings for anchor links
- [x] Table of Contents generation

## Lists
- [x] Unordered lists with `*` or `-`
- [x] Nested unordered lists
- [x] Ordered lists with `#`
- [x] Nested ordered lists
- [x] Mixed nested lists

## Blocks
- [x] Blockquotes `> quote`
- [x] Code blocks with triple backticks ``` or indentation
- [x] Horizontal rules `----` or `***`

## Templates & Macros
- [x] Template inclusion `{{TemplateName}}`
- [x] Template parameters `{{TemplateName|param=value}}`
- [ ] Conditional content in templates
- [ ] Loops in templates
- [x] `<includeonly>`, `<noinclude>`, `<onlyinclude>` support
- [x] Template scoping and transclusion

## Media
- [x] Image embedding `[[File:Example.png]]`
- [x] Audio/video embedding
- [x] Gallery support

## Tables
- [x] Simple tables with `|` syntax
- [x] Header rows and alignment
- [x] Table captions
- [x] Cell spanning (rowspan/colspan)
- [x] Advanced table styling

## Categories & Metadata
- [x] Category links `[[Category:Name]]`
- [x] Tags and metadata parsing
- [x] Automatic category indexing

## Advanced Features
- [x] Nested/recursive templates
- [x] Parser magic words (like `{{PAGENAME}}`)
- [x] Purge cache functionality
- [x] `<nowiki>` tags to disable parsing
- [ ] Parser functions (like `#if`, `#expr`)
- [ ] Custom extensions/hooks for rendering
- [ ] Syntax highlighting for code blocks
- [ ] Table of Contents customization
- [x] Redirect pages
- [ ] Modules for advanced logic
- [x] Characters escaping

## Accessibility & UX
- [x] Sanitized HTML for XSS protection
- [ ] Responsive rendering (mobile-friendly)
- [ ] Smooth scrolling to anchors
- [ ] Custom CSS classes for styling
- [ ] Custom JavaScript for interactivity
- [x] LGWL editor with syntax highlighting