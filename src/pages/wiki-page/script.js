import i18n from "../../js/repack-locales";

// Initialize locale helper
await i18n.init();

$(function () {
	// Theme Switcher
	$("#wiki-theme-switch").on("click", function () {
		const currentTheme = $("body").attr("data-theme") || "light";
		const newTheme = currentTheme === "light" ? "dark" : "light";
		document.cookie = `theme=${newTheme}; path=/; max-age=31536000`; // 1 year

		// Update the DOM attribute and jQuery's cached data so subsequent reads reflect the change
		$("body").attr("data-theme", newTheme).data("theme", newTheme);
	});

	// Language Switcher
	$("#wiki-lang-switch").on("change", function () {
		const newLang = $(this).val();
		document.cookie = `lang=${newLang}; path=/; max-age=31536000`; // 1 year
		location.reload();
	});

	// === Helpers ===
	function parsePath() {
		const m = window.location.pathname.match(/^\/wikis\/([^\/]+)\/(.+)$/);
		return m ? { wiki: decodeURIComponent(m[1]), page: decodeURIComponent(m[2]) } : null;
	}

	const path = parsePath();
	const wikiName = path?.wiki || $("meta[name=wiki]").attr("content");
	const pageName = path?.page || $("meta[name=page]").attr("content");
	const storageKey = `wiki-draft:${wikiName}:${pageName}`;

	// === CodeMirror Editor ===
	const $editorTextarea = $("textarea.wiki-editor");
	if ($editorTextarea.length) {
		const BUILTIN_TEMPLATES = {
			"!": "|",
			"=": "=",
			"(": "(",
			")": ")",
			"[": "[",
			"]": "]",
			"{": "{",
			"}": "}",
			"<": "<",
			">": ">",
			":": ":"
		};

		// Add this helper function to find the object before the dot
		function getObjectAtCursor(cm, cursor) {
			const line = cm.getLine(cursor.line);
			let end = cursor.ch;

			let start = end;
			while (start > 0 && /[\w$.]/.test(line.charAt(start - 1))) {
				start--;
			}

			const fullExpr = line.slice(start, end);

			// Remove trailing dot safely
			const cleaned = fullExpr.replace(/\.$/, "");

			return cleaned;
		}

		function getMembersOf(objName) {
			if (!objName) return [];

			try {
				let target = window;
				const paths = objName.split('.');

				for (const segment of paths) {
					if (!target) return [];
					target = target[segment];
				}

				if (!target) return [];

				const props = new Set();

				// Own props
				Object.getOwnPropertyNames(target).forEach(p => props.add(p));

				// Prototype props (VERY IMPORTANT)
				let proto = Object.getPrototypeOf(target);
				while (proto) {
					Object.getOwnPropertyNames(proto).forEach(p => props.add(p));
					proto = Object.getPrototypeOf(proto);
				}

				return [...props].filter(p => !p.startsWith("_"));
			}
			catch (e) {
				return [];
			}
		}

		function extractVariables(cm) {
			const code = cm.getValue();
			const vars = new Set();

			// Updated regex to capture the entire declaration LHS
			const regex = /\b(const|let|var|function)\s+([\w$]+|\{[\s\S]+?\})\s*=/g;
			let match;

			while ((match = regex.exec(code))) {
				const lhs = match[2].trim();

				if (lhs.startsWith("{")) {
					// It's a destructuring assignment
					const inside = lhs.slice(1, -1);
					inside.split(",").forEach(part => {
						// Handle "orig: alias" or just "name"
						const pieces = part.split(":");
						const name = (pieces.length > 1 ? pieces[1] : pieces[0]).trim();
						// Filter out non-word characters (like trailing commas/whitespace)
						const cleanName = name.match(/[a-zA-Z_$][\w$]*/);
						if (cleanName) vars.add(cleanName[0]);
					});
				} else {
					// Normal variable or function name
					vars.add(lhs);
				}
			}

			return [...vars];
		}

		function smartMatch(item, word) {
			item = item.toLowerCase();
			word = word.toLowerCase();

			if (!word) return true;

			// 🔥 PRIORITY: exact prefix
			if (item.startsWith(word)) return true;

			// 🔥 fallback fuzzy
			let i = 0;
			for (let j = 0; j < item.length && i < word.length; j++) {
				if (item[j] === word[i]) i++;
			}
			return i === word.length;
		}

		function extractObjectKeys(objBody, set) {
			objBody.split(",").forEach(p => {
				const part = p.trim();
				if (!part) return;

				// handle:
				// foo
				// foo: ...
				// "foo": ...
				// 'foo': ...
				const match = /^["']?(\w+)["']?\s*:?\s*/.exec(part);
				if (match) {
					set.add(match[1]);
				}
			});
		}

		function resolveRequireBindings(cm) {
			const varMap = {};           // normal variable → module
			const destructuredMap = {};  // destructured variable → { module, export }

			const lines = cm.getValue().split("\n");

			const requireRegex = /const\s+([\w{},\s:]+)\s*=\s*await\s+require\(\s*["']([^"']+)["']\s*\)/g;

			lines.forEach(line => {
				let m;
				while ((m = requireRegex.exec(line))) {
					const lhs = m[1].trim();      // e.g. Utils OR { foo, bar: baz }
					const moduleName = m[2];      // e.g. "Utils"

					// Destructured
					if (lhs.startsWith("{") && lhs.endsWith("}")) {
						const inside = lhs.slice(1, -1); // remove braces
						inside.split(",").forEach(part => {
							const [orig, alias] = part.split(":").map(s => s.trim());
							const varName = alias || orig;
							destructuredMap[varName] = { module: moduleName, export: orig };
						});
					} else {
						// Normal variable
						varMap[lhs] = moduleName;
					}
				}
			});

			return { varMap, destructuredMap };
		}

		let __BINDINGS_CACHE__ = null;
		let __BINDINGS_CACHE_DOC__ = null;

		function getBindings(cm) {
			const doc = cm.getValue();

			if (__BINDINGS_CACHE_DOC__ === doc) {
				return __BINDINGS_CACHE__;
			}

			const result = resolveRequireBindings(cm);

			__BINDINGS_CACHE__ = result;
			__BINDINGS_CACHE_DOC__ = doc;

			return result;
		}

		function extractExportsFromCode(code) {
			const exportsSet = new Set();

			/* =========================
			   1. module.exports = { ... }
			========================= */
			const moduleObjMatch = /module\.exports\s*=\s*{([\s\S]*?)}/g;
			let m;

			while ((m = moduleObjMatch.exec(code))) {
				extractObjectKeys(m[1], exportsSet);
			}

			/* =========================
			   2. exports = { ... }  🔥 FIX
			========================= */
			const exportsObjMatch = /\bexports\s*=\s*{([\s\S]*?)}/g;

			while ((m = exportsObjMatch.exec(code))) {
				extractObjectKeys(m[1], exportsSet);
			}

			/* =========================
			   3. exports.foo = ...
			========================= */
			const propRegex = /exports\.(\w+)\s*=/g;
			while ((m = propRegex.exec(code))) {
				exportsSet.add(m[1]);
			}

			/* =========================
			   4. module.exports.foo = ...
			========================= */
			const modPropRegex = /module\.exports\.(\w+)\s*=/g;
			while ((m = modPropRegex.exec(code))) {
				exportsSet.add(m[1]);
			}

			return [...exportsSet];
		}

		async function fetchModuleExports(moduleName) {
			if (MODULE_METADATA[moduleName]) return MODULE_METADATA[moduleName];

			try {
				const res = await $.get(`/api/v2/wikis/${wikiName}/pages/${"Module:" + moduleName}`);
				const code = res.page.content || "";

				const exports = extractExportsFromCode(code);

				MODULE_METADATA[moduleName] = exports;
				return exports;
			} catch (e) {
				console.error("Failed to fetch module:", moduleName, e);
				MODULE_METADATA[moduleName] = [];
				return [];
			}
		}

		const JS_KEYWORDS = [
			"const", "continue", "class", "catch", "case",
			"break", "function", "return", "if", "else",
			"for", "while", "switch", "import", "export",
			"default", "new", "try", "finally", "throw",
			"let", "var", "async", "await"
		];

		CodeMirror.registerHelper("hint", "javascript-smart", function (cm) {
			const cursor = cm.getCursor();
			const token = cm.getTokenAt(cursor);
			const line = cm.getLine(cursor.line);

			if (token.type === "string" || token.type === "comment") return null;

			let start = cursor.ch;
			while (start > 0 && /[\w$]/.test(line.charAt(start - 1))) start--;

			const word = line.slice(start, cursor.ch);
			const isProperty = line.charAt(start - 1) === ".";

			let candidates = [];

			if (isProperty) {
				const objName = getObjectAtCursor(cm, { line: cursor.line, ch: start - 1 });

				// 🔥 Handle require("X").something
				const requireMatch = /require\s*\(\s*["']([^"']+)["']\s*\)$/.exec(objName);
				if (requireMatch) {
					const moduleName = requireMatch[1];
					candidates = MODULE_METADATA[moduleName] || [];
				}
				else {
					candidates = getMembersOf(objName);
				}
			}
			else {
				const variables = extractVariables(cm);

				candidates = [
					...JS_KEYWORDS,
					...variables,
					...Object.getOwnPropertyNames(window)
				];
			}

			// 🔥 Smart ranking
			const ranked = candidates
				.map(item => {
					const text = typeof item === "string" ? item : item.text;
					let score = 0;

					if (text.startsWith(word)) score = 100;
					else if (text.includes(word)) score = 50;
					else {
						let i = 0;
						for (let j = 0; j < text.length && i < word.length; j++) {
							if (text[j] === word[i]) i++;
						}
						if (i === word.length) score = 10;
					}

					return { item, score };
				})
				.filter(x => x.score > 0)
				.sort((a, b) => b.score - a.score)
				.map(x => x.item);

			return {
				list: ranked,
				from: CodeMirror.Pos(cursor.line, start),
				to: cursor
			};
		});

		const MODULE_METADATA = {}; // Cache of what modules export

		CodeMirror.registerHelper("hint", "lgml-javascript", function (cm, callback) {
			const cursor = cm.getCursor();
			const token = cm.getTokenAt(cursor);
			const line = cm.getLine(cursor.line);
			const lineToCursor = line.slice(0, cursor.ch);

			// 🚫 Block autocomplete inside normal strings (except require)
			const requireMatch = /require\s*\(\s*["']([\w/:]*)$/.exec(lineToCursor);
			const isString = token.type && (token.type.includes("string") || token.type.includes("template"));
			if (isString && !requireMatch) return;

			/* =========================
			   1. REQUIRE("...") PATH HINTS
			========================== */
			if (requireMatch) {
				const query = requireMatch[1];

				if (!window.__MODULE_LIST_CACHE__) {
					window.__MODULE_LIST_CACHE__ = $.getJSON(`/api/v2/wiki/${wikiName}/modules`);
				}

				window.__MODULE_LIST_CACHE__.then(data => {
					const suggestions = data.modules
						.map(p => p.title)
						.filter(t => t !== pageName.replace("Module:", "") && !t.includes("/doc"))
						.map(title => {
							let score = 0;
							if (title.startsWith(query)) score = 100;
							else if (title.includes(query)) score = 50;
							else if (smartMatch(title, query)) score = 10;
							return { title, score };
						})
						.filter(x => x.score > 0)
						.sort((a, b) => b.score - a.score)
						.map(x => ({
							text: x.title,
							displayText: x.title,
							className: "intellisense-module",
							render: (el, data, cur) => el.innerHTML = `<span>📦</span> ${cur.displayText}`
						}));

					callback({
						list: suggestions,
						from: CodeMirror.Pos(cursor.line, cursor.ch - query.length),
						to: cursor
					});
				});

				return;
			}

			/* =========================
			   2. REQUIRE("X").EXPORTS
			========================== */
			const requirePropMatch = /require\s*\(\s*["']([^"']+)["']\s*\)\.(\w*)$/.exec(lineToCursor);
			if (requirePropMatch) {
				const moduleName = requirePropMatch[1];
				const query = requirePropMatch[2] || "";

				fetchModuleExports(moduleName).then(exports => {
					const suggestions = exports
						.map(name => {
							let score = 0;
							if (name.startsWith(query)) score = 100;
							else if (name.includes(query)) score = 50;
							else if (smartMatch(name, query)) score = 10;
							return { name, score };
						})
						.filter(x => x.score > 0)
						.sort((a, b) => b.score - a.score)
						.map(x => ({
							text: x.name,
							displayText: x.name,
							className: "intellisense-export",
							render: (el, data, cur) => el.innerHTML = `<span>📤</span> ${cur.displayText}`
						}));

					callback({
						list: suggestions,
						from: CodeMirror.Pos(cursor.line, cursor.ch - query.length),
						to: cursor
					});
				});

				return;
			}

			/* =========================
   3. VARIABLE → MODULE EXPORTS (supports destructuring)
========================== */
			const varPropMatch = /(\w+)\.(\w*)$/.exec(lineToCursor);
			if (varPropMatch) {
				const varName = varPropMatch[1];
				const query = varPropMatch[2] || "";

				// Get mappings from editor (variables → module, destructured)
				const { varMap, destructuredMap } = getBindings(cm);

				// Handle destructured variables
				const destruct = destructuredMap[varName];
				if (destruct) {
					// We found the variable is a destructured export (e.g., 'kek').
					// We return an empty list here so the logic falls through to 
					// "4. DEFAULT INTELLISENSE", allowing standard JS methods to show up
					// instead of suggesting 'kek.kek'.
					callback({
						list: [],
						from: CodeMirror.Pos(cursor.line, cursor.ch - query.length),
						to: cursor
					});
					return;
				}

				// Handle normal module variables (e.g., 'Utils.foo')
				const moduleName = varMap[varName];
				if (moduleName) {
					fetchModuleExports(moduleName).then(exports => {
						const suggestions = exports
							.map(name => {
								let score = 0;
								if (name.startsWith(query)) score = 100;
								else if (name.includes(query)) score = 50;
								else if (smartMatch(name, query)) score = 10;
								return { name, score };
							})
							.filter(x => x.score > 0)
							.sort((a, b) => b.score - a.score)
							.map(x => ({
								text: x.name,
								displayText: x.name,
								className: "intellisense-export",
								render: (el, data, cur) => el.innerHTML = `<span>📤</span> ${cur.displayText}`
							}));

						callback({
							list: suggestions,
							from: CodeMirror.Pos(cursor.line, cursor.ch - query.length),
							to: cursor
						});
					});
					return;
				}
			}

			/* =========================
			   4. DEFAULT INTELLISENSE
			========================== */
			const base = CodeMirror.hint["javascript-smart"](cm) || { list: [], from: cursor, to: cursor };
			const word = line.slice(base.from.ch, cursor.ch);

			// 🔥 Detect property access and skip base for module property autocompletes
			const isProperty = /\.\w*$/.test(lineToCursor);
			if (isProperty && base.list.length) {
				callback(base);
				return;
			}

			const lgmlKeywords = ["require", "requireData", "module", "exports"];
			const normalize = item => typeof item === "string" ? { text: item, displayText: item } : item;

			const merged = [
				...new Map([...base.list, ...lgmlKeywords].map(normalize).map(i => [i.text, i])).values()
			];

			const ranked = merged
				.map(item => {
					const text = item.text.toLowerCase();
					const w = word.toLowerCase();
					let score = 0;
					if (text.startsWith(w)) score = 100;
					else if (text.includes(w)) score = 50;
					else if (smartMatch(text, w)) score = 10;
					return { item, score };
				})
				.filter(x => x.score > 0)
				.sort((a, b) => b.score - a.score)
				.map(x => x.item);

			callback({ list: ranked, from: base.from, to: base.to });
		});

		// CRITICAL: Tell CodeMirror this helper uses a callback
		CodeMirror.hint["lgml-javascript"].async = true;

		// === LGWL Base Mode ===
		CodeMirror.defineMode("lgwlBase", function (config) {
			return {
				startState: function () {
					return {
						inNowiki: false,
						inTemplate: 0,
						inArg: 0,
						inLink: 0,
						inCodeBlock: false
					};
				},

				token: function (stream, state) {
					// --- Nowiki ---
					if (!state.inNowiki && stream.match("<nowiki>", true)) {
						state.inNowiki = true;
						return "nowiki";
					}
					if (state.inNowiki) {
						if (stream.match("</nowiki>", true)) state.inNowiki = false;
						else stream.next();
						return "nowiki";
					}

					// --- Redirects ---
					if (stream.sol() && stream.match(/^#REDIRECT\b/i, true)) return "redirect";

					// --- Code block ```
					if (!state.inCodeBlock && stream.sol() && stream.match("```", true)) {
						state.inCodeBlock = true;
						return "code-block";
					}
					if (state.inCodeBlock) {
						if (stream.match("```", true)) state.inCodeBlock = false;
						else stream.skipToEnd();
						return "code-block";
					}

					// --- Triple-brace {{{argument}}} ---
					if (stream.match("{{{", true)) {
						state.inArg++;
						return "template-arg";
					}
					if (state.inArg > 0) {
						if (stream.match("}}}", true)) {
							state.inArg--;
							return "template-arg";
						} else {
							stream.next();
							return "template-arg";
						}
					}

					// --- Template {{...}} ---
					if (stream.match("{{", true)) {
						state.inTemplate++;
						return "template";
					}
					if (state.inTemplate > 0) {
						if (stream.match("}}", true)) {
							state.inTemplate--;
							return "template";
						} else {
							// Optional: detect builtins like {{!}} or {{=}}
							const ch = stream.peek();
							if (ch && "!()[]{}<>:=|".includes(ch)) {
								stream.next();
								return "template-builtin";
							}
							stream.next();
							return "template";
						}
					}

					// --- Link [[...]] ---
					if (stream.match("[[", true)) {
						state.inLink++;
						return "link";
					}
					if (state.inLink > 0) {
						if (stream.match("]]", true)) {
							state.inLink--;
							return "link";
						}
						if (stream.match(/Category:/, true)) return "category-link";
						if (stream.match(/(Tag|Tags?):/, true)) return "tag-link";
						stream.next();
						return "link";
					}

					// --- External link [http://...] ---
					if (!state.inLink && stream.match(/\[(https?:\/\/[^\s\]]+)/, true)) {
						stream.skipTo("]");
						stream.next();
						return "link";
					}

					// --- Tables ---
					if (stream.sol()) {
						if (stream.match("|-", true)) return "table-divider";
						if (stream.match("||", true)) return "table-pipe";
						if (stream.match("|", true)) return "table-pipe";
						if (stream.match("!", true)) return "table-header";
					}

					// --- Headings == ... ==
					if (stream.sol() && stream.match(/={2,6}(?=\s)/, true)) {
						stream.skipToEnd();
						return "heading";
					}

					// --- Lists *, #, - ---
					if (stream.sol() && stream.match(/^(\*+|\#+|\-+)\s+/, true)) return "list";

					// --- Blockquote > ---
					if (stream.sol() && stream.match(/^>\s+/, true)) return "blockquote";

					// --- Horizontal rule (---- or ***) ---
					if (stream.sol() && stream.match(/^(-{4,}|\*{3,})/, true)) return "hr";

					// --- Default ---
					stream.next();
					return null;
				}
			};
		});

		// === LGWL Inline Formatting Overlay ===
		CodeMirror.defineMode("lgwlInline", function () {
			return {
				startState: function () { return { strike: false, strong: false, em: false }; },
				token: function (stream, state) {
					// Strike
					if (stream.match("~~")) { state.strike = !state.strike; return null; }
					// Bold+italic
					if (stream.match("'''''")) { state.strong = !state.strong; state.em = !state.em; return null; }
					// Bold
					if (stream.match("'''")) { state.strong = !state.strong; return null; }
					// Italic
					if (stream.match("''")) { state.em = !state.em; return null; }
					// Inline code
					if (stream.match("`")) {
						while (!stream.eol() && !stream.match("`", true)) stream.next();
						stream.next(); // skip closing `
						return "inline-code";
					}

					// Consume one char and apply styles
					stream.next();
					let style = [];
					if (state.strike) style.push("strike");
					if (state.strong) style.push("strong");
					if (state.em) style.push("em");
					return style.length ? style.join(" ") : null;
				}
			};
		});

		// === Final LGWL Mode ===
		CodeMirror.defineMode("LGWL", function (config) {
			const base = CodeMirror.getMode(config, "lgwlBase");
			const inline = CodeMirror.getMode(config, "lgwlInline");
			const htmlMode = CodeMirror.getMode(config, "htmlmixed");

			return CodeMirror.overlayMode(htmlMode, CodeMirror.overlayMode(base, inline));
		});

		CodeMirror.defineMode("lgml-js-overlay", function (config) {
			return {
				token: function (stream) {
					// === LGML keywords ===
					if (stream.match(/\b(exports|module\.exports)\b/, true)) {
						return "lgml-export";
					}

					// === require("...") schema ===
					// Highlight ONLY the word "require"
					if (stream.match(/\b(require|requireData)\b/, true)) {
						return "keyword";
					}

					stream.next();
					return null;
				}
			};
		});

		CodeMirror.defineMode("lgml-javascript", function (config) {
			const jsMode = CodeMirror.getMode(config, "javascript");
			const overlay = CodeMirror.getMode(config, "lgml-js-overlay");

			const mode = CodeMirror.overlayMode(jsMode, overlay);

			mode.name = "javascript"; // 🔥 prevent XML fallback

			return mode;
		});

		// === Determine proper editor mode ===
		let editorMode = "LGWL";

		if (pageName.startsWith("Module:") && !pageName.includes("/doc")) {
			editorMode = "lgml-javascript";
		}
		else if (pageName.endsWith(".css")) {
			editorMode = "css";
		}
		else if (pageName.endsWith(".js")) {
			editorMode = "javascript";
		}

		// === Editor Initialization ===
		const darkTheme = $("body").data("theme") == "dark";
		const editor = CodeMirror.fromTextArea($editorTextarea[0], {
			lineNumbers: true,
			mode: editorMode,
			theme: editorMode == "lgml-javascript" || editorMode == "css" ? (darkTheme ? "monokai" : "eclipse") : "lgwl",
			lineWrapping: true,
			viewportMargin: Infinity,
			smartIndent: false,
			indentWithTabs: false,
			indentUnit: 0,
			extraKeys: {
				"Ctrl-S": function (cm) {
					const content = cm.getValue();
					try {
						localStorage.setItem(storageKey, content);
						console.log(`[Draft saved @ ${new Date().toLocaleTimeString()}]`);
						showSaveToast(i18n.t ? i18n.t("wiki.edit.draft_saved") : "Draft saved");
					} catch (e) {
						console.warn("Autosave failed:", e);
					}
				},
				"Ctrl-Space": function (cm) {
					let hint = CodeMirror.hint.anyword;

					if (editorMode === "lgml-javascript") {
						hint = CodeMirror.hint["lgml-javascript"];
					}
					else if (editorMode === "javascript") {
						hint = CodeMirror.hint["javascript-smart"]; // 🔥 use strict version
					}
					else if (editorMode === "css") {
						hint = CodeMirror.hint.css;
					}

					cm.showHint({ hint, useGlobalScope: false, completeSingle: false });
				}
			}
		});

		// === Magic words that should NOT become links ===
		const LGWL_MAGIC_WORDS = new Set([
			"PAGENAME",
			"NAMESPACE",
			"FULLPAGENAME",
			"BASEPAGENAME",
			"PAGELANGUAGE",
			"SITENAME",
			"DATE",
			"TIME"
		]);

		// === Function to linkify only module names ===
		const REQUIRE_REGEX = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

		function isWikiModule(name) {
			// Relative paths
			if (name.startsWith("./") || name.startsWith("../")) return false;

			// Absolute paths or URLs
			if (name.startsWith("/") || name.includes("://")) return false;

			// File extensions
			if (/\.[a-z0-9]+$/i.test(name)) return false;

			// Node-style scoped packages
			if (name.startsWith("@")) return false;

			return true;
		}

		function normalizeModuleName(name) {
			if (name.startsWith("Module:")) return name;
			return "Module:" + name;
		}

		function linkifyModuleRequires(cm) {
			const doc = cm.getDoc();

			// Clear old marks
			cm.getAllMarks().forEach(mark => {
				if (mark.className === "cm-module-link") mark.clear();
			});

			const text = doc.getValue();
			let match;

			while ((match = REQUIRE_REGEX.exec(text)) !== null) {
				const rawName = match[1];

				if (!isWikiModule(rawName)) continue;

				const moduleName = normalizeModuleName(rawName);

				const startIndex =
					match.index + match[0].indexOf(rawName);
				const endIndex = startIndex + rawName.length;

				const startPos = cm.posFromIndex(startIndex);
				const endPos = cm.posFromIndex(endIndex);

				cm.markText(startPos, endPos, {
					className: "cm-module-link",
					attributes: {
						"data-module": moduleName
					},
					inclusiveLeft: false,
					inclusiveRight: false,
					clearWhenEmpty: true
				});
			}
		}

		// === Function to linkify only template names ===
		function linkifyTemplates(cm) {
			const doc = cm.getDoc();
			const lineCount = doc.lineCount();

			// Clear old marks
			cm.getAllMarks().forEach(mark => {
				if (mark.className === "cm-template-link") mark.clear();
			});

			// Combine all lines into one string with newlines for global regex matching
			const fullText = doc.getValue();

			// Match {{ ... }} but NOT {{{ ... }}}
			const regex = /(?<!\{)\{\{(?!\{)([\s\S]{0,1000}?)(?<!\})\}\}(?!\})/g;
			let match;

			while ((match = regex.exec(fullText)) !== null) {
				const fullTemplate = match[1].trim();
				const [templateName] = fullTemplate.split("|").map(s => s.trim());

				// Skip if template is a magic word or a built-in template
				if (!templateName || LGWL_MAGIC_WORDS.has(templateName) || BUILTIN_TEMPLATES[templateName]) continue;

				// Convert absolute character offsets to line/ch positions
				const startPos = cm.posFromIndex(match.index + 2); // after {{
				const endPos = cm.posFromIndex(match.index + 2 + templateName.length);

				cm.markText(startPos, endPos, {
					className: "cm-template-link",
					attributes: { "data-template": templateName },
					inclusiveLeft: false,
					inclusiveRight: false,
					clearWhenEmpty: true,
				});
			}
		}

		// === Autocomplete ===
		editor.on("inputRead", function (cm, change) {
			const cursor = cm.getCursor();
			const line = cm.getLine(cursor.line);
			const lineToCursor = line.slice(0, cursor.ch);

			// 1. Check what was just typed
			const typed = change.text[0];

			// 2. Define our conditions
			const isTriggerChar = /[\w.$]/.test(typed);
			const isQuote = /["']/.test(typed);
			const isInsideRequire = /require\s*\(\s*["']$/.test(lineToCursor);

			// 3. Only trigger if it's a normal word OR a quote inside a require()
			if (!cm.state.completionActive && (isTriggerChar || (isQuote && isInsideRequire))) {
				let hintFn = editorMode === "lgml-javascript"
					? CodeMirror.hint["lgml-javascript"]
					: CodeMirror.hint["javascript-smart"];

				cm.showHint({
					hint: hintFn,
					completeSingle: false,
					async: hintFn.async
				});
			}
		});

		// === Make template and module marks clickable ===
		editor.on('mousedown', function (cm, event) {
			const target = event.target;
			if (target.classList.contains('cm-template-link')) {
				// Only open if CTRL/COMMAND is held
				if (!event.ctrlKey && !event.metaKey) return;

				let templateName = decodeURIComponent(target.getAttribute('data-template')).trim();

				// Handle {{#invoke:ModuleName|...}} calls
				if (templateName.startsWith('#invoke:')) {
					const moduleName = templateName.slice(8).split('|')[0].trim().replace(/ /g, '_');
					window.open(`/wikis/${wikiName}/Module:${moduleName}`, '_blank');
				}
				// Handle normal {{TemplateName}} calls
				else {
					const safeName = templateName.replace(/ /g, '_');
					window.open(`/wikis/${wikiName}/Template:${safeName}`, '_blank');
				}

				event.preventDefault();
			}
			else if (target.classList.contains("cm-module-link")) {
				if (!event.ctrlKey && !event.metaKey) return;

				const moduleName = target.getAttribute("data-module");
				window.open(
					`/wikis/${wikiName}/${moduleName.replace(/ /g, "_")}`,
					"_blank"
				);
				event.preventDefault();
			}
		});

		// Keep textarea synced for autosave + preview
		editor.on("change", () => $editorTextarea.val(editor.getValue()));

		// === Call linkifyTemplates on editor changes ===
		editor.on('change', () => linkifyTemplates(editor));
		linkifyTemplates(editor); // initial pass
		linkifyModuleRequires(editor); // initial pass

		// === Call linkifyModuleRequires on editor changes ===
		editor.on('change', () => linkifyModuleRequires(editor));

		// Refresh editor on window resize
		$(window).on("resize", () => editor.refresh());

		// Autosave every 5 seconds if content changed
		let lastContent = editor.getValue();
		setInterval(() => {
			const cur = editor.getValue();
			if (cur !== lastContent) {
				try { localStorage.setItem(storageKey, cur); } catch (e) { }
				lastContent = cur;
			}
		}, 5000);

		// Intercept wiki edit form submission
		$("form.wiki-edit-form").on("submit", async function (e) {
			e.preventDefault();
			const $form = $(this);
			const content = editor.getValue();
			const summary = $form.find("input[name=summary]").val() || "";
			const minor = $form.find("input[name=minor]").is(":checked");

			if (!wikiName || !pageName) {
				alert("Missing wiki or page name.");
				return;
			}

			try {
				$form.find("button, input, textarea").prop("disabled", true);

				const resp = await $.ajax({
					url: `/api/v2/wikis/${encodeURIComponent(wikiName)}/pages/${encodeURIComponent(pageName)}`,
					method: "POST",
					data: JSON.stringify({ content, summary, minor }),
					contentType: "application/json",
					dataType: "json"
				});

				if (resp && resp.message) alert(resp.message);

				// Clear local draft
				try { localStorage.removeItem(storageKey); } catch (e) { }

				// Redirect to page view
				window.location = `/wikis/${wikiName}/${pageName}`;
			} catch (err) {
				console.error(err);
				alert("Failed to save page: " + (err.responseJSON?.message || err.statusText || err));
			} finally {
				$form.find("button, input, textarea").prop("disabled", false);
			}
		});

		// Optional toast feedback for autosave
		function showSaveToast(text) {
			let $toast = $(".save-toast");
			if (!$toast.length) $toast = $("<div class='save-toast'></div>").appendTo("body");
			$toast.text(text).addClass("visible");
			setTimeout(() => $toast.removeClass("visible"), 2000);
		}

		// Preview button
		const $buttons = $(".edit-buttons");
		if ($buttons.length && $buttons.find(".preview-btn").length === 0 && !pageName.startsWith("Module:")) {
			$buttons.append(
				$("<button type='button' class='preview-btn'>Preview</button>").on("click", () => {
					const content = editor.getValue().trim();
					if (!content) return alert("Nothing to preview.");
					showPreviewModal(content);
				})
			);
		}

		// === Restore draft UI ===
		const saved = localStorage.getItem(storageKey);
		const currentContent = editor.getValue().trim();
		if (saved && saved !== currentContent) {
			const $banner = $("<div class='draft-banner'></div>")
				.text(i18n.t ? i18n.t("wiki.edit.draft_exists") : "A draft was found")
				.append(
					$("<div class='draft-buttons'></div>")
						.append(
							$("<button class='restore-draft'>Restore</button>").on("click", () => {
								editor.setValue(saved);
								$banner.remove();
							})
						)
						.append(
							$("<button class='discard-draft'>Discard</button>").on("click", () => {
								localStorage.removeItem(storageKey);
								$banner.remove();
							})
						)
				);

			$("form.wiki-edit-form").prepend($banner);
		}
	}

	// === Preview Modal ===
	function showPreviewModal(content) {
		const path = parsePath();
		const wikiName = path?.wiki || $("meta[name=wiki]").attr("content");
		const { namespace, page } = (() => {
			if (!path?.page) return { namespace: "Main", page: "Preview" };
			const split = path.page.split(":");
			if (split.length > 1) return { namespace: split.shift(), page: split.join(":") };
			return { namespace: "Main", page: path.page };
		})();

		const $modal = $("<div class='modal preview-modal'/>");
		const $inner = $("<div class='modal-inner'/>");
		const $header = $("<div class='modal-header'><h3>Preview</h3></div>");
		const $close = $("<button class='modal-close' aria-label='Close'>×</button>").on("click", () => $modal.remove());
		const $body = $("<div class='preview-body'><div class='loading'>Rendering preview...</div></div>");

		$header.append($close);
		$inner.append($header).append($body);
		$modal.append($inner);
		$("body").append($modal);

		fetch(`/api/v2/wikis/${encodeURIComponent(wikiName)}/render`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ content, namespace, path: page })
		})
			.then(resp => resp.json())
			.then(json => {
				if (json.html) {
					// Build preview HTML + render time footer
					const renderStats = json.renderTimeMs
						? `<div class='preview-render-time'>Rendered in ${json.renderTimeMs} ms${json.frameSize ? `, Frame size: ${json.frameSize} / 104857600 Bytes` : ""}</div>`
						: "";

					$body.html(`
					${renderStats}
					<div class='wiki-preview'>
						${json.html}
					</div>
				`);
				} else {
					$body.html(`<div class='error'>${json.message || "Preview unavailable"}</div>`);
				}
			})
			.catch(err => {
				console.error(err);
				$body.html(`<div class='error'>Failed to load preview: ${err.message}</div>`);
			});
	}

	// === Purge button ===
	const $purge = $(".dropdown-item.purge-page");
	if ($purge.length) {
		$purge.on("click", async function (e) {
			e.preventDefault();
			const $this = $(this);
			const wiki = $this.data("wiki") || path?.wiki;
			const page = $this.data("page") || path?.page;
			const promptText = $this.data("confirmPrompt") || "Are you sure you want to purge this page?";
			if (!wiki || !page || !window.confirm(promptText)) return;

			try {
				const resp = await fetch(`/api/v2/wikis/${encodeURIComponent(wiki)}/pages/${encodeURIComponent(page)}/purge`, {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" }
				});
				const json = await resp.json().catch(() => ({}));
				if (json.message) alert(json.message);
				window.location.reload();
			} catch (err) {
				alert("Error purging page: " + err);
			}
		});
	}

	// === Purge All button ===
	const $purgeAll = $("#purge-all");
	if ($purgeAll.length) {
		$purgeAll.on("click", async function (e) {
			e.preventDefault();
			const $this = $(this);
			const wiki = $this.data("wiki") || path?.wiki;
			const promptText = $this.data("confirmPrompt") || "Are you sure you want to purge all pages on this wiki?";
			if (!wiki || !window.confirm(promptText)) return;

			try {
				const resp = await fetch(`/api/v2/wikis/${encodeURIComponent(wiki)}/purge`, {
					method: "POST",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" }
				});
				const json = await resp.json().catch(() => ({}));
				if (json.message) alert(json.message);
				window.location.reload();
			} catch (err) {
				alert("Error purging wiki cache: " + err);
			}
		});
	}

	// === Delete button ===
	const $del = $("#confirm-delete");
	if ($del.length) {
		$del.on("click", async function (e) {
			e.preventDefault();
			const $this = $(this);
			const wiki = $this.data("wiki") || path?.wiki;
			const page = $this.data("page") || path?.page;
			const promptText = $this.data("confirmPrompt");
			if (promptText && !window.confirm(promptText)) return;

			try {
				const resp = await fetch(`/api/v2/wikis/${encodeURIComponent(wiki)}/pages/${encodeURIComponent(page)}`, {
					method: "DELETE",
					credentials: "same-origin",
					headers: { "Content-Type": "application/json" }
				});
				const json = await resp.json().catch(() => ({}));
				if (json.message) alert(json.message);
				window.location = `/wikis/${encodeURIComponent(wiki)}`;
			} catch (err) {
				alert("Error: " + err);
			}
		});
	}

	// === History/diff link enhancements ===
	$(document).on("click", "a[data-revision]", function (e) {
		e.preventDefault();
		window.location = $(this).attr("href");
	});

	const $uploadForm = $("form.upload-form");
	if ($uploadForm.length) {
		const $fileInput = $uploadForm.find("input[type=file]");
		const $summaryInput = $uploadForm.find("input[name=summary]");
		const $minorCheckbox = $uploadForm.find("input[name=minor]");
		const $submitBtn = $uploadForm.find("button[type=submit]");

		// Pre-fill file name from ?file= query parameter if available
		const urlParams = new URLSearchParams(window.location.search);
		const fileNameParam = urlParams.get("file");
		if (fileNameParam) {
			$uploadForm.find("input[name=name]").val(fileNameParam);
		}

		// Display selected file name
		const $fileNameDisplay = $("<span class='file-name-display'></span>").insertAfter($fileInput);
		$fileInput.on("change", function () {
			const files = this.files;
			$fileNameDisplay.text($uploadForm.find("input[name=name]").val() || (files && files.length ? files[0].name : ""));
		});

		// Progress bar
		const $progressBar = $("<div class='upload-progress'><div class='progress-inner'></div></div>").insertAfter($submitBtn);
		$progressBar.hide();

		$uploadForm.on("submit", function (e) {
			e.preventDefault();
			const file = $fileInput[0].files[0];
			if (!file) return alert("Please select a file to upload.");

			// Use the query parameter ?file if available, else fallback to actual filename
			let fileName = $uploadForm.find("input[name=name]").val() || new URLSearchParams(window.location.search).get("file") || uploadFile.name;

			const formData = new FormData();
			formData.append("file", file);
			formData.append("fileName", fileName);
			formData.append("summary", $summaryInput.val() || "");
			formData.append("minor", $minorCheckbox.is(":checked") ? "1" : "0");

			$submitBtn.prop("disabled", true);
			$progressBar.show();
			$progressBar.find(".progress-inner").css("width", "0%");

			$.ajax({
				url: $uploadForm.attr("action"),
				method: "POST",
				data: formData,
				processData: false,
				contentType: false,
				xhr: function () {
					const xhr = $.ajaxSettings.xhr();
					if (xhr.upload) {
						xhr.upload.addEventListener("progress", function (evt) {
							if (evt.lengthComputable) {
								const percent = (evt.loaded / evt.total) * 100;
								$progressBar.find(".progress-inner").css("width", percent + "%");
							}
						}, false);
					}
					return xhr;
				},
				success: function (json) {
					if (json.error) {
						alert("Upload failed: " + json.error);
					} else if (json.file.path) {
						alert("Upload successful!");
						// Redirect to the file's wiki page
						const safeName = encodeURIComponent(json.file.path.replace(/ /g, "_"));
						window.location.href = `/wikis/${wikiName}/File:${safeName}`;
					} else {
						alert("Upload completed, but no file information returned.");
					}
				},
				error: function (xhr, status, err) {
					console.error(err);
					alert("Upload failed: " + (xhr.responseJSON?.error || err));
				},
				complete: function () {
					$submitBtn.prop("disabled", false);
					$progressBar.hide();
				}
			});
		});
	}

	$(document).on("click", ".revert-button", async function (e) {
		e.preventDefault();
		const $btn = $(this);
		const revisionId = $btn.data("revision") || $btn.val();
		const wiki = $btn.data("wiki") || $("meta[name=wiki]").attr("content");
		const page = $btn.data("page") || $("meta[name=page]").attr("content");

		if (!revisionId || !wiki || !page) return alert("Missing revision, wiki, or page info.");

		if (!confirm(i18n.t ? i18n.t("wiki.history.revert_confirm") : "Are you sure you want to revert to this revision?")) return;

		try {
			$btn.prop("disabled", true).text(i18n.t ? i18n.t("wiki.history.reverting") : "Reverting...");

			// 1️⃣ Fetch the current page with all revisions
			const pageResp = await $.getJSON(`/api/v2/wikis/${encodeURIComponent(wiki)}/pages/${page.replace(/ /g, "_")}?includeRevisions=1`);
			console.log(pageResp)
			if (!pageResp.exists) {
				throw new Error("Failed to fetch page or revisions.");
			}

			// 2️⃣ Find the revision content
			const revision = pageResp.page.revisions.find(r => r.id === revisionId);
			if (!revision) throw new Error("Revision not found.");

			// 3️⃣ POST the revision content to update the page
			const resp = await $.ajax({
				url: `/api/v2/wikis/${encodeURIComponent(wiki)}/pages/${page.replace(/ /g, "_")}`,
				method: "POST",
				contentType: "application/json",
				dataType: "json",
				data: JSON.stringify({
					content: revision.content,
					summary: i18n.t ? i18n.t("wiki.history.revert_summary", { rev: revisionId }) : `Reverted to revision ${revisionId}`,
					minor: false
				})
			});

			if (resp && resp.message) alert(resp.message);
			window.location.reload();

		} catch (err) {
			console.error(err);
			alert(err.responseJSON?.error || err.statusText || err.message || "Failed to revert page.");
			$btn.prop("disabled", false).text(i18n.t ? i18n.t("wiki.history.revert") : "Revert");
		}
	});

	const $searchInput = $("#wiki-search");
	const $results = $("#wiki-search-results");
	let searchTimer;

	// Input debounce + search
	$searchInput.on("input", function () {
		clearTimeout(searchTimer);
		const query = $(this).val().trim();

		searchTimer = setTimeout(function () {
			if (!query) {
				$results.hide().empty();
				return;
			}

			$.ajax({
				url: `/api/v2/wiki/${encodeURIComponent(wikiName)}/search`,
				method: "GET",
				data: { search: query },
				dataType: "json"
			}).done(function (data) {
				renderResults(data.results);
			});
		}, 250);
	});

	// Hide results when clicking outside the search wrapper
	$(document).on("click", function (e) {
		if (!$(e.target).closest(".wiki-search").length) {
			$results.hide();
		}
	});

	// Optional: show results if input has value on focus
	$searchInput.on("focus", function () {
		if ($(this).val().trim() && $results.children().length) {
			$results.show();
		}
	});

	function renderResults(results) {
		const container = $("#wiki-search-results");
		container.empty();

		if (!results.length) {
			container
				.html('<div class="wiki-search-empty">No results</div>')
				.show();
			return;
		}

		results.forEach(r => {
			const isMain = r.namespace === "Main";
			const title = isMain ? r.title : `${r.namespace}:${r.title}`;

			// Final target: If it's a redirect, use redirectTo.path for the link;
			// display the redirect name (meta override) if present, otherwise the path.
			let finalTarget = isMain ? r.path : `${r.namespace}:${r.path}`;
			let redirectDisplay = null;
			if (r.isRedirect && r.redirectTo) {
				// `redirectTo` is now an object: { path, name }
				if (r.redirectTo.path) finalTarget = r.redirectTo.path;
				redirectDisplay = r.redirectTo.name || r.redirectTo.path || null;
			}

			const href = `/wikis/${wikiName}/${encodeURI(finalTarget.replace(/ /g, "_"))}`;

			container.append(`
				<a class="wiki-search-item" href="${href}">
					<div class="wiki-search-title">
						${title}
						${r.isRedirect && redirectDisplay ? `<span class="wiki-search-redirect">→ ${redirectDisplay.replace(/_/g, " ")}</span>` : ""}
					</div>
				</a>
			`);
		});

		container.show();
	}
});