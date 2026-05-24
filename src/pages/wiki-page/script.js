import i18n from "../../js/repack-locales";
import LSPProxyClient from "../../js/lsp-proxy-client";

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
		// --- Built-in template symbols ---
		const BUILTIN_TEMPLATES = {
			"!": "|", "=": "=", "(": "(", ")": ")", "[": "[", "]": "]",
			"{": "{", "}": "}", "<": "<", ">": ">", ":": ":"
		};

		// --- LGWL Base Mode ---
		CodeMirror.defineMode("lgwlBase", function () {
			return {
				startState: () => ({
					inNowiki: false,
					inTemplate: 0,
					inArg: 0,
					inLink: 0,
					inCodeBlock: false
				}),
				token: function (stream, state) {
					// --- Nowiki ---
					if (!state.inNowiki && stream.match("<nowiki>", true)) { state.inNowiki = true; return "nowiki"; }
					if (state.inNowiki) { if (stream.match("</nowiki>", true)) state.inNowiki = false; else stream.next(); return "nowiki"; }

					// --- Redirect ---
					if (stream.sol() && stream.match(/^#REDIRECT\b/i, true)) return "redirect";

					// --- Code block ```
					if (!state.inCodeBlock && stream.sol() && stream.match("```", true)) { state.inCodeBlock = true; return "code-block"; }
					if (state.inCodeBlock) { if (stream.match("```", true)) state.inCodeBlock = false; else stream.skipToEnd(); return "code-block"; }

					// --- Triple-brace argument {{{
					if (stream.match("{{{", true)) { state.inArg++; return "template-arg"; }
					if (state.inArg > 0) { if (stream.match("}}}", true)) { state.inArg--; } else stream.next(); return "template-arg"; }

					// --- Template {{...}}
					if (stream.match("{{", true)) { state.inTemplate++; return "template"; }
					if (state.inTemplate > 0) {
						if (stream.match("}}", true)) { state.inTemplate--; return "template"; }
						const ch = stream.peek();
						if (ch && "!()[]{}<>:=|".includes(ch)) { stream.next(); return "template-builtin"; }
						stream.next(); return "template";
					}

					// --- Link [[...]]
					if (stream.match("[[", true)) { state.inLink++; return "link"; }
					if (state.inLink > 0) {
						if (stream.match("]]", true)) { state.inLink--; return "link"; }
						if (stream.match(/Category:/, true)) return "category-link";
						if (stream.match(/(Tag|Tags?):/, true)) return "tag-link";
						stream.next(); return "link";
					}

					// --- External links [http://...]
					if (!state.inLink && stream.match(/\[(https?:\/\/[^\s\]]+)/, true)) { stream.skipTo("]"); stream.next(); return "link"; }

					// --- Tables ---
					if (stream.sol()) {
						if (stream.match("|-", true)) return "table-divider";
						if (stream.match("||", true)) return "table-pipe";
						if (stream.match("|", true)) return "table-pipe";
						if (stream.match("!", true)) return "table-header";
					}

					// --- Headings ==
					if (stream.sol() && stream.match(/={2,6}(?=\s)/, true)) { stream.skipToEnd(); return "heading"; }

					// --- Lists
					if (stream.sol() && stream.match(/^(\*+|\#+|\-+)\s+/, true)) return "list";

					// --- Blockquote >
					if (stream.sol() && stream.match(/^>\s+/, true)) return "blockquote";

					// --- Horizontal rule
					if (stream.sol() && stream.match(/^(-{4,}|\*{3,})/, true)) return "hr";

					// --- Default
					stream.next(); return null;
				}
			};
		});

		// --- LGWL Inline Mode ---
		CodeMirror.defineMode("lgwlInline", function () {
			return {
				startState: () => ({ strike: false, strong: false, em: false }),
				token: function (stream, state) {
					if (stream.match("~~")) { state.strike = !state.strike; return null; }
					if (stream.match("'''''")) { state.strong = !state.strong; state.em = !state.em; return null; }
					if (stream.match("'''")) { state.strong = !state.strong; return null; }
					if (stream.match("''")) { state.em = !state.em; return null; }
					if (stream.match("`")) { while (!stream.eol() && !stream.match("`", true)) stream.next(); stream.next(); return "inline-code"; }
					stream.next();
					const style = [];
					if (state.strike) style.push("strike");
					if (state.strong) style.push("strong");
					if (state.em) style.push("em");
					return style.length ? style.join(" ") : null;
				}
			};
		});

		// --- LGWL Combined Mode ---
		CodeMirror.defineMode("LGWL", function (config) {
			const base = CodeMirror.getMode(config, "lgwlBase");
			const inline = CodeMirror.getMode(config, "lgwlInline");
			const html = CodeMirror.getMode(config, "htmlmixed");
			return CodeMirror.overlayMode(html, CodeMirror.overlayMode(base, inline));
		});

		// --- JS Overlay for LGML ---
		CodeMirror.defineMode("lgml-js-overlay", function () {
			return {
				token: function (stream) {
					if (stream.match(/\b(exports|module\.exports)\b/, true)) return "lgml-export";
					if (stream.match(/\b(require|requireData)\b/, true)) return "keyword";
					stream.next(); return null;
				}
			};
		});

		CodeMirror.defineMode("lgml-javascript", function (config) {
			const jsMode = CodeMirror.getMode(config, "javascript");
			const overlay = CodeMirror.getMode(config, "lgml-js-overlay");
			const mode = CodeMirror.overlayMode(jsMode, overlay);
			mode.name = "javascript"; // prevent fallback
			return mode;
		});

		// --- Determine editor mode ---
		let editorMode = "LGWL";
		if (pageName.startsWith("Module:") && !pageName.includes("/doc")) editorMode = "lgml-javascript";
		else if (pageName.endsWith(".css")) editorMode = "css";
		else if (pageName.endsWith(".js")) editorMode = "javascript";

		// ============================================
		// LSP Proxy Client Setup (replaces Tern.js)
		// ============================================
		let lspClient = null;

		// Initialize LSP Proxy Client
		async function initializeLSPClient() {
			try {
				lspClient = new LSPProxyClient({
					baseUrl: '/api/lsp',
					wikiName: wikiName,
					editorId: undefined, // Will auto-generate unique editor ID per tab
					debug: false
				});

				await lspClient.connect();
				console.log('[LSP] Connected via proxy');
				return true;
			} catch (error) {
				console.error('[LSP] Failed to initialize:', error);
				return false;
			}
		}

		/* ===== COMMENTED OUT: Tern.js based analysis =====
		const moduleCache = new Map();
		const dataCache = new Map();
		const variableMap = new Map();
		let lastUserCode = "";
		let lastVirtualDoc = "";
		let lastPrefix = "";
		let virtualDocDirty = true;
		let cachedTernLineOffset = 0;
		let lineOffsetDirty = true;

		function markVirtualDocDirty() {
			virtualDocDirty = true;
			lineOffsetDirty = true;
		}

		// --- Initialize editor ---
		const lgmlDefs = {
			"requireData": {
				"!type": "fn(name: string) -> ?",
				"!resolve": function (self, args, graph) {
					const nameNode = args && args[0];
					if (!nameNode) return null;

					function resolveModule(modName) {
						const varName = "__data_" + modName.replace(/[:.-\/]/g, "_");
						const found = graph.lookup(varName, graph.ecma5);
						return found ? found.getType() : null;
					}

					// --- 1. Literal ---
					if (typeof nameNode.value === "string") {
						const t = resolveModule(nameNode.value);
						return t || "?";
					}

					// --- 2. Variable lookup (FIXED)
					const varName =
						(nameNode.node && nameNode.node.name) ||
						nameNode.name;

					if (varName && variableMap.has(varName)) {
						const modName = variableMap.get(varName);
						const t = resolveModule(modName);
						if (t) return t;
					}

					// --- 3. Fallback
					let union = null;

					dataCache.forEach((_, modName) => {
						const t = resolveModule(modName);
						if (t) {
							union = union ? (union.or ? union.or(t) : t) : t;
						}
					});

					return union || "?";
				}
			},
			"require": {
				"!type": "fn(name: string) -> ?",
				// Inside your lgmlDefs.require definition
				"!resolve": function (self, args, graph) {
					const nameNode = args && args[0];
					if (!nameNode) return null;

					// --- 1. Literal string ---
					if (typeof nameNode.value === "string") {
						const varName = "__mod_" + nameNode.value.replace(/[:.-\/]/g, "_");
						const found = graph.lookup(varName, graph.ecma5);
						return found ? found.getType() : "?";
					}

					return null;
				}
			},
			"exports": { "!type": "object" },
			"!define": {
				// This acts as a registry for all your modules
				"modules": {}
			}
		};
		===== END TERN.JS COMMENTED OUT =====
		*/

		// LSP Proxy hint provider (replaces ternHintProvider)
		const lspHintProvider = async function (cm, callback) {
			function getCompletionRange(cm, cur) {
				const line = cm.getLine(cur.line);

				let start = cur.ch;
				let end = cur.ch;

				// Expand left
				while (
					start > 0 &&
					/[\w$]/.test(line[start - 1])
				) {
					start--;
				}

				// Expand right
				while (
					end < line.length &&
					/[\w$]/.test(line[end])
				) {
					end++;
				}

				return {
					from: CodeMirror.Pos(cur.line, start),
					to: CodeMirror.Pos(cur.line, end)
				};
			}

			const cur = cm.getCursor();

			if (!lspClient) {
				return callback({
					list: [],
					from: cur,
					to: cur
				});
			}

			try {
				const textDocument = {
					uri: `wiki://${wikiName}/${pageName}`
				};

				const position = {
					line: cur.line,
					character: cur.ch
				};

				let completions =
					await lspClient.getCompletions(
						textDocument,
						position
					);

				// LSP CompletionList support
				if (
					completions &&
					Array.isArray(completions.items)
				) {
					completions =
						completions.items;
				}

				if (!Array.isArray(completions)) {
					completions = [];
				}

				// Fallback replacement range
				const replaceRange =
					getCompletionRange(cm, cur);

				const result = {
					from: replaceRange.from,
					to: replaceRange.to,

					list: completions.map((item) => {
						// Prefer textEdit
						let insertText =
							item.textEdit?.newText ||
							item.insertText ||
							item.label;

						// Prevent function signatures
						// from being inserted literally
						if (
							!item.insertText &&
							!item.textEdit &&
							insertText.includes("(")
						) {
							insertText =
								insertText.replace(/\(.*$/, "");
						}

						return {
							text: insertText,

							displayText:
								item.label,

							className:
								item.kind
									? `lsp-completion-${item.kind}`
									: "",

							render: (el) => {
								el.className +=
									" lsp-hint-item";

								const container =
									document.createElement(
										"div"
									);

								container.className =
									"lsp-hint-container";

								const name =
									document.createElement(
										"span"
									);

								name.className =
									"lsp-hint-name";

								const signature =
									document.createElement(
										"span"
									);

								signature.className =
									"lsp-hint-signature";

								// Split:
								// foo(bar) -> type
								const match =
									item.label.match(
										/^([^(]+)(.*)$/
									);

								if (match) {
									name.textContent =
										match[1];

									signature.textContent =
										match[2];
								} else {
									name.textContent =
										item.label;
								}

								container.appendChild(
									name
								);

								if (
									signature.textContent
								) {
									container.appendChild(
										signature
									);
								}

								el.appendChild(
									container
								);

								// Optional details
								if (item.detail) {
									const detail =
										document.createElement(
											"div"
										);

									detail.className =
										"lsp-hint-detail";

									detail.textContent =
										item.detail;

									el.appendChild(
										detail
									);
								}
							},

							hint: (
								cm,
								data,
								completion
							) => {
								let from =
									data.from;

								let to =
									data.to;

								// Prefer LSP ranges
								if (
									item.textEdit
										?.range
								) {
									from =
										CodeMirror.Pos(
											item.textEdit
												.range
												.start
												.line,
											item.textEdit
												.range
												.start
												.character
										);

									to =
										CodeMirror.Pos(
											item.textEdit
												.range
												.end
												.line,
											item.textEdit
												.range
												.end
												.character
										);
								}

								cm.replaceRange(
									insertText,
									from,
									to
								);

								// additionalTextEdits
								if (
									Array.isArray(
										item.additionalTextEdits
									)
								) {
									item.additionalTextEdits.forEach(
										(edit) => {
											cm.replaceRange(
												edit.newText,
												CodeMirror.Pos(
													edit.range
														.start
														.line,
													edit.range
														.start
														.character
												),
												CodeMirror.Pos(
													edit.range
														.end
														.line,
													edit.range
														.end
														.character
												)
											);
										}
									);
								}
							}
						};
					})
				};

				callback(result);
			} catch (error) {
				console.error(
					"[LSP] Completion error:",
					error
				);

				callback({
					list: [],
					from: cur,
					to: cur
				});
			}
		};
		lspHintProvider.async = true;

		/* ===== COMMENTED OUT: Tern.js virtual document functions =====
		function extractConstStrings(code) { ... }
		function syncDependencies(cm) { ... }
		function updateVirtualDoc(cm) { ... }
		function getTernLineOffset() { ... }
		const ternHintProvider = function (cm, callback) { ... };
		===== END VIRTUAL DOC FUNCTIONS =====
		*/

		const darkTheme = $("body").data("theme") === "dark";
		const editor = CodeMirror.fromTextArea($editorTextarea[0], {
			lineNumbers: true,
			mode: editorMode,
			theme: (editorMode === "lgml-javascript" || editorMode === "css") ? (darkTheme ? "monokai" : "eclipse") : "lgwl",
			lineWrapping: true,
			viewportMargin: Infinity,
			smartIndent: false,
			indentWithTabs: false,
			indentUnit: 0,
			extraKeys: {
				"Ctrl-S": (cm) => {
					try {
						localStorage.setItem(storageKey, cm.getValue());
						showSaveToast("Draft saved");
					} catch { }
				},
				"Ctrl-Space": (cm) => {
					const cur = cm.getCursor();
					const token = cm.getTokenAt(cur);

					// 1. Check if we are inside a string. 
					// If so, exit immediately and don't show the hint.
					if (token.type && token.type.includes("string")) {
						return;
					}

					// 2. Otherwise, show completions via LSP proxy
					if (cm.state.completionActive) {
						cm.state.completionActive.close();
					}

					cm.showHint({
						hint: lspHintProvider,
						async: true,
						completeSingle: false,
						closeOnUnfocus: true,
						closeOnNoMatch: true,
						updateOnCursorActivity: true
					});
				},
				/* ===== COMMENTED OUT: Tern.js specific key bindings =====
				"F12": (cm) => { ternServer.jumpToDef(cm, ...); },
				"Shift-F12": (cm) => { ternServer.showRefs(cm); },
				"F2": (cm) => { ternServer.rename(cm); },
				"Shift-Ctrl-Space": (cm) => { ternServer.updateArgHints(cm); },
				===== END TERN BINDINGS =====
				*/
				"Enter": (cm) => {
					const completion =
						cm.state.completionActive;

					if (completion?.widget) {
						completion.pick();
						return;
					}

					return CodeMirror.Pass;
				},
				"Space": (cm) => {
					if (cm.state.completionActive) cm.state.completionActive.close();
					return CodeMirror.Pass;
				},
				"Esc": (cm) => {
					// Close autocomplete
					if (cm.state.completionActive) {
						cm.state.completionActive.close();
						return CodeMirror.Pass;
					}

					// Close LSP tooltips
					document.querySelectorAll(".CodeMirror-Tern-tooltip, .lsp-tooltip")
						.forEach(el => el.remove());

					return CodeMirror.Pass;
				}
			}
		});

		if (editorMode.includes("javascript")) {
			// Initialize LSP Proxy Client for this editor
			initializeLSPClient().then(success => {
				if (success) {
					console.log('[LSP] LSP Proxy Client initialized');

					// Send initial document to LSP server
					const initialContent = editor.getValue();
					const textDocument = {
						uri: `wiki://${wikiName}/${pageName}`,
						languageId: 'javascript',
						version: 1,
						text: initialContent
					};

					lspClient.didOpen(textDocument).catch(err => {
						console.error('[LSP] Failed to send initial document:', err);
					});
				} else {
					console.warn('[LSP] Failed to initialize LSP Proxy Client');
				}
			});

			// Setup document change synchronization (debounced)
			let docVersion = 1;

			editor.on("change", (cm, change) => {
				if (!lspClient) return;

				docVersion++;

				const content = cm.getValue();

				const textDocument = {
					uri: `wiki://${wikiName}/${pageName}`,
					version: docVersion
				};

				lspClient.didChange(
					textDocument,
					content
				).catch(err => {
					console.error(
						'[LSP] Failed to sync document changes:',
						err
					);
				});
			});

			/* ===== COMMENTED OUT: Tern.js event handlers =====
			editor.ternServer = ternServer;

			editor.on("change", (cm) => {
				clearTimeout(editor.syncTimeout);
				editor.syncTimeout = setTimeout(() => {
					const code = cm.getValue();
					extractConstStrings(code);
					syncDependencies(cm);
					markVirtualDocDirty();
					updateVirtualDoc(cm);
				}, 500);
			});

			editor.on("change", (cm, change) => {
				ternServer.updateArgHints(cm);
			});

			editor.on("inputRead", function (cm, change) {
				... (auto-trigger logic)
			});

			editor.on("cursorActivity", (cm) => {
				... (cursor activity logic)
			});

			(function initEditorState() {
				... (virtual doc initialization)
			})();
			===== END TERN.JS EVENT HANDLERS =====
			*/

			// Optional: Add auto-trigger for completions via LSP
			let completionRequestId = 0;
			let completionTimeout = null;

			editor.on("inputRead", function (cm, change) {
				// Ignore completion insertions
				if (change.origin === "complete") {
					return;
				}

				const typedChar = change.text?.[0];

				if (!typedChar) {
					return;
				}

				// Close completion on whitespace/newline
				if (/^\s+$/.test(typedChar)) {
					if (cm.state.completionActive?.close) {
						cm.state.completionActive.close();
					}
					return;
				}

				// Ignore obvious non-trigger chars
				if (
					!/[\w$.:]/.test(typedChar)
				) {
					return;
				}

				// Cancel pending completion refresh
				if (completionTimeout) {
					clearTimeout(completionTimeout);
				}

				const requestId = ++completionRequestId;

				completionTimeout = setTimeout(() => {
					// Ignore stale requests
					if (requestId !== completionRequestId) {
						return;
					}

					const cur = cm.getCursor();
					const token = cm.getTokenAt(cur);

					// Disable inside strings/comments
					if (
						token.type?.includes("string") ||
						token.type?.includes("comment")
					) {
						if (cm.state.completionActive?.close) {
							cm.state.completionActive.close();
						}
						return;
					}

					// Trigger conditions
					const shouldTrigger =
						typedChar === "." ||
						typedChar === ":" ||
						/[a-zA-Z0-9_$]/.test(typedChar);

					if (!shouldTrigger) {
						return;
					}

					// Refresh popup instead of stacking sessions
					if (cm.state.completionActive?.close) {
						cm.state.completionActive.close();
					}

					cm.showHint({
						hint: lspHintProvider,
						async: true,

						completeSingle: false,
						closeOnUnfocus: true,
						closeOnNoMatch: true,

						// Important for async LSP
						alignWithWord: false
					});
				}, 80);
			});
		}

		// Send document close notification when page is unloading
		$(window).on('beforeunload', function () {
			if (lspClient && editorMode.includes("javascript")) {
				const textDocument = {
					uri: `wiki://${wikiName}/${pageName}`
				};
				// Fire and forget - we can't wait for response on beforeunload
				lspClient.didClose(textDocument).catch(err => {
					console.warn('[LSP] Failed to send didClose on unload:', err);
				});
			}
		});

		// --- Magic words ---
		const LGWL_MAGIC_WORDS = new Set(["PAGENAME", "NAMESPACE", "FULLPAGENAME", "BASEPAGENAME", "PAGELANGUAGE", "SITENAME", "DATE", "TIME"]);

		// --- Linkify functions ---
		const REQUIRE_REGEX = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;
		function isWikiModule(name) { return !(/^(\.\/|\.\.\/|\/|.*:\/\/|@)/.test(name) || /\.[a-z0-9]+$/i.test(name)); }
		function normalizeModuleName(name) { return name.startsWith("Module:") ? name : "Module:" + name; }

		function linkifyModuleRequires(cm) {
			const text = cm.getValue();
			cm.getAllMarks().forEach(mark => mark.className === "cm-module-link" && mark.clear());
			let match;
			while ((match = REQUIRE_REGEX.exec(text))) {
				const rawName = match[1]; if (!isWikiModule(rawName)) continue;
				const moduleName = normalizeModuleName(rawName);
				const startPos = cm.posFromIndex(match.index + match[0].indexOf(rawName));
				const endPos = cm.posFromIndex(match.index + match[0].indexOf(rawName) + rawName.length);
				cm.markText(startPos, endPos, { className: "cm-module-link", attributes: { "data-module": moduleName }, inclusiveLeft: false, inclusiveRight: false, clearWhenEmpty: true });
			}
		}

		function linkifyTemplates(cm) {
			const text = cm.getValue();
			cm.getAllMarks().forEach(mark => mark.className === "cm-template-link" && mark.clear());
			const regex = /(?<!\{)\{\{(?!\{)([\s\S]{0,1000}?)(?<!\})\}\}(?!\})/g;
			let match;
			while ((match = regex.exec(text))) {
				const fullTemplate = match[1].trim();
				const templateName = fullTemplate.split("|")[0].trim();
				if (!templateName || LGWL_MAGIC_WORDS.has(templateName) || BUILTIN_TEMPLATES[templateName]) continue;
				const startPos = cm.posFromIndex(match.index + 2);
				const endPos = cm.posFromIndex(match.index + 2 + templateName.length);
				cm.markText(startPos, endPos, { className: "cm-template-link", attributes: { "data-template": templateName }, inclusiveLeft: false, inclusiveRight: false, clearWhenEmpty: true });
			}
		}

		editor.on("change", () => { linkifyTemplates(editor); linkifyModuleRequires(editor); });
		linkifyTemplates(editor); linkifyModuleRequires(editor);

		// --- Clickable links ---
		editor.on('mousedown', function (cm, event) {
			const t = event.target;
			if (!event.ctrlKey && !event.metaKey) return;

			if (t.classList.contains('cm-template-link')) {
				let name = decodeURIComponent(t.dataset.template);
				if (name.startsWith('#invoke:')) name = name.slice(8).split('|')[0].trim().replace(/ /g, '_'), window.open(`/wikis/${wikiName}/Module:${name}`, '_blank');
				else window.open(`/wikis/${wikiName}/Template:${name.replace(/ /g, '_')}`, '_blank');
				event.preventDefault();
			}
			else if (t.classList.contains('cm-module-link')) {
				window.open(`/wikis/${wikiName}/${t.dataset.module.replace(/ /g, '_')}`, '_blank');
				event.preventDefault();
			}
		});

		// --- Sync textarea ---
		editor.on("change", () => $editorTextarea.val(editor.getValue()));

		// --- Refresh on resize ---
		$(window).on("resize", () => editor.refresh());

		// --- Autosave every 5s ---
		let lastContent = editor.getValue();
		setInterval(() => { const cur = editor.getValue(); if (cur !== lastContent) { try { localStorage.setItem(storageKey, cur); } catch { } lastContent = cur; } }, 5000);

		// --- Draft restore ---
		const saved = localStorage.getItem(storageKey);
		if (saved && saved !== editor.getValue().trim()) {
			const $banner = $("<div class='draft-banner'>A draft was found</div>").prependTo("form.wiki-edit-form");
			const $btns = $("<div class='draft-buttons'></div>").appendTo($banner);
			$("<button class='restore-draft'>Restore</button>").appendTo($btns).on("click", () => {
				editor.setValue(saved);
				$banner.remove();

				// Sync document with LSP server if in JS mode
				if (lspClient && editorMode.includes("javascript")) {
					const textDocument = {
						uri: `wiki://${wikiName}/${pageName}`,
						version: 1,
						text: saved
					};

					lspClient.didChange(textDocument, saved).catch(err => {
						console.error('[LSP] Failed to sync restored draft:', err);
					});
				}
			});
			$("<button class='discard-draft'>Discard</button>").appendTo($btns).on("click", () => { localStorage.removeItem(storageKey); $banner.remove(); });
		}

		// --- Preview button ---
		const $buttons = $(".edit-buttons");
		if ($buttons.length && !$buttons.find(".preview-btn").length && !pageName.startsWith("Module:")) {
			$("<button type='button' class='preview-btn'>Preview</button>").appendTo($buttons).on("click", () => {
				const content = editor.getValue().trim(); if (!content) return alert("Nothing to preview.");
				showPreviewModal(content);
			});
		}

		// --- Show toast ---
		function showSaveToast(text) {
			let $toast = $(".save-toast"); if (!$toast.length) $toast = $("<div class='save-toast'></div>").appendTo("body");
			$toast.text(text).addClass("visible"); setTimeout(() => $toast.removeClass("visible"), 2000);
		}

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