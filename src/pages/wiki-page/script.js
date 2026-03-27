import i18n from "../../js/repack-locales";
import * as tern from "tern";

window.tern = tern;

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

		const moduleCache = new Map();
		const dataCache = new Map();
		const variableMap = new Map();

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

		const editorDefs = [
			require("../../../node_modules/tern/defs/ecmascript.json"),
			require("../../../node_modules/tern/defs/browser.json"),
			lgmlDefs
		];

		const ternServer = new CodeMirror.TernServer({
			defs: editorDefs,
			plugins: { doc_comment: true },
			autoClose: true,
			ecmaVersion: 8,
			cmOptions: {
				hintOptions: {
					completeSingle: false,
					alignWithWord: true
				}
			},
			typeTip: (data) => {
				if (!data) return null;

				const div = document.createElement("div");
				div.className = "cm-tern-type-tip";

				// Show the Type (e.g. fn(obj: ?, key: ?)) if no Doc exists
				// This helps you debug why things are "?" 
				const typeLabel = data.type ? `Type: ${data.type}` : "";
				const docText = data.doc ? data.doc.split("\n")[0] : "";

				div.textContent = docText || typeLabel || data.name || "No type info found";

				return div;
			},
			completionTip: (data) => {
				if (!data) return null;

				const div = document.createElement("div");
				div.className = "cm-tern-completion-tip";

				const header = document.createElement("div");
				header.className = "cm-tern-header";

				// --- ICON ---
				const icon = document.createElement("span");
				icon.className = "cm-tern-icon";

				const type = data.type || "";
				if (type.startsWith("fn")) icon.classList.add("is-fn");
				else if (type.includes("string")) icon.classList.add("is-string");
				else if (type.includes("number")) icon.classList.add("is-number");
				else if (type.includes("bool")) icon.classList.add("is-bool");
				else icon.classList.add("is-obj");

				header.appendChild(icon);

				// --- NAME ---
				const name = document.createElement("span");
				name.className = "cm-tern-name";
				name.textContent = data.name || "";
				header.appendChild(name);

				div.appendChild(header);

				// --- TYPE ---
				if (data.type) {
					const typeEl = document.createElement("div");
					typeEl.className = "cm-tern-type";
					typeEl.textContent = data.type;
					div.appendChild(typeEl);
				}

				// --- DOC ---
				if (data.doc) {
					const desc = document.createElement("div");
					desc.className = "cm-tern-doc";

					const firstLine = data.doc.split("\n").find(l => l.trim());
					desc.textContent = firstLine || data.doc;

					if (data.doc.includes("LGML")) {
						desc.classList.add("is-lgml");
					}

					div.appendChild(desc);
				}

				return div;
			}
		});

		window.ternServer = ternServer;

		function extractConstStrings(code) {
			variableMap.clear();

			// Matches:
			// const a = "Module:Items"
			// let b = 'Module:Test'
			const regex = /\b(const|let|var)\s+([\w$]+)\s*=\s*["']([^"']+)["']/g;

			let match;
			while ((match = regex.exec(code)) !== null) {
				const varName = match[2];
				const value = match[3];

				variableMap.set(varName, value);
			}
		}

		function syncDependencies(cm) {
			const code = cm.getValue();

			const requireRx = /require\s*\(\s*["'](.+?)["']\s*\)/g;
			const requireDataRx = /requireData\s*\(\s*["'](.+?)["']\s*\)/g;
			const requireDataVarRx = /requireData\s*\(\s*([\w$]+)\s*\)/g;

			let match;

			// -------------------------
			// 1. require("module")
			// -------------------------
			while ((match = requireRx.exec(code)) !== null) {
				const modName = match[1];

				if (!moduleCache.has(modName)) {
					moduleCache.set(modName, "// loading...");

					const apiPath = modName.replace("Module:", "");

					$.get(`/api/v2/wikis/${wikiName}/pages/${"Module:" + encodeURIComponent(apiPath)}`)
						.then(res => {
							if (!res || !res.exists || !res.page) {
								console.warn("Module not found:", modName);
								moduleCache.set(modName, "");
								updateVirtualDoc(cm);
								return;
							}

							const content = res.page.content || "";
							const varName = "__mod_" + modName.replace(/[:.-\/]/g, "_");

							const wrapped = `/** @type {Object} */ var ${varName} = (function(){\n var exports = {};\n ${content}\n return exports;\n})();\n`;

							moduleCache.set(modName, wrapped);
							updateVirtualDoc(cm);
						})
						.fail(err => {
							console.error("Failed to load module:", modName, err);
						});
				}
			}

			// -------------------------
			// 2. requireData("module")
			// -------------------------
			while ((match = requireDataRx.exec(code)) !== null) {
				const modName = match[1];

				if (!dataCache.has(modName)) {
					dataCache.set(modName, "// loading...");

					const apiPath = modName.replace("Module:", "");

					$.get(`/api/v2/wikis/${wikiName}/pages/${"Module:" + encodeURIComponent(apiPath)}`)
						.then(res => {
							if (!res || !res.exists || !res.page) {
								console.warn("Data module not found:", modName);
								const safe = "__data_" + modName.replace(/[:.-\/]/g, "_");
								dataCache.set(modName, `var ${safe} = {};\n`);
								updateVirtualDoc(cm);
								return;
							}

							const content = res.page.content || "";

							let parsed;
							try {
								parsed = content ? JSON.parse(content) : {};
							} catch {
								parsed = {};
							}

							const varName = "__data_" + modName.replace(/[:.-\/]/g, "_");
							const wrapped = `var ${varName} = ${JSON.stringify(parsed, null, 2)};\n`;

							dataCache.set(modName, wrapped);
							updateVirtualDoc(cm);
						})
						.fail(err => {
							console.error("Failed to load data module:", modName, err);
						});
				}
			}

			// -------------------------
			// 3. requireData(variable)
			// -------------------------

			// Collect ONLY variables used in requireData(...)
			const usedDataVars = new Set();

			while ((match = requireDataVarRx.exec(code)) !== null) {
				usedDataVars.add(match[1]);
			}

			// Load ONLY those variables from variableMap
			variableMap.forEach((modName, varName) => {
				if (!usedDataVars.has(varName)) return;

				if (!dataCache.has(modName)) {
					dataCache.set(modName, "// loading...");

					const apiPath = modName.replace("Module:", "");

					$.get(`/api/v2/wikis/${wikiName}/pages/${"Module:" + encodeURIComponent(apiPath)}`)
						.then(res => {
							if (!res || !res.exists || !res.page) {
								console.warn("Data module not found:", modName);

								const safe = "__data_" + modName.replace(/[:.-\/]/g, "_");
								dataCache.set(modName, `var ${safe} = {};\n`);

								updateVirtualDoc(cm);
								return;
							}

							const content = res.page.content || "";

							let parsed;
							try {
								parsed = content ? JSON.parse(content) : {};
							} catch {
								parsed = {};
							}

							const varNameSafe = "__data_" + modName.replace(/[:.-\/]/g, "_");
							const wrapped = `var ${varNameSafe} = ${JSON.stringify(parsed, null, 2)};\n`;

							dataCache.set(modName, wrapped);
							updateVirtualDoc(cm);
						})
						.fail(err => {
							console.error("Failed to load data module (var):", modName, err);
						});
				}
			});
		}

		function updateVirtualDoc(cm) {
			// Start with a clean prefix. Ensure exactly 1 newline at the end.
			let prefix = "var exports = {}; var frame = { cache: {} };\n";

			moduleCache.forEach((content) => {
				if (content && content !== "// loading..." && content.trim() !== "") {
					prefix += content.trim() + "\n";
				}
			});

			// Inject data modules
			dataCache.forEach((content, modName) => {
				if (content && content !== "// loading..." && content.trim() !== "") {
					prefix += content.trim() + "\n";
				}
			});

			const wrapperHead = "(async function() {\n";
			const userCode = cm.getValue();

			extractConstStrings(userCode);

			// Replace require with padded __mod_ version to preserve horizontal 'ch'
			const transformedCode = userCode
				.replace(/require\s*\(\s*["'](.+?)["']\s*\)/g, (match, modName) => {
					const replacement = "__mod_" + modName.replace(/[:.-\/]/g, "_");
					return replacement.padEnd(match.length, " ");
				})
				.replace(/requireData\s*\(\s*([^)]+)\s*\)/g, (match, argRaw) => {
					const arg = argRaw.trim();

					// Case 1: literal string
					const literalMatch = arg.match(/^["'](.+?)["']$/);
					if (literalMatch) {
						const modName = literalMatch[1];
						const replacement = "__data_" + modName.replace(/[:.-\/]/g, "_");
						return replacement.padEnd(match.length, " ");
					}

					// Case 2: variable → resolve via variableMap
					if (variableMap.has(arg)) {
						const modName = variableMap.get(arg);
						const replacement = "__data_" + modName.replace(/[:.-\/]/g, "_");
						return replacement.padEnd(match.length, " ");
					}

					// fallback → leave untouched (important)
					return match;
				});

			const wrapperFoot = "\n})();";

			// Update Tern - Use the exact same filename used in the query
			ternServer.server.addFile("editor.js", prefix + wrapperHead + transformedCode + wrapperFoot);
		}

		function getTernLineOffset() {
			let lines = 1; // exports/frame line

			// JS modules
			moduleCache.forEach((content) => {
				if (content && content !== "// loading..." && content.trim() !== "") {
					const m = content.trim().match(/\n/g);
					lines += (m ? m.length : 0) + 1;
				}
			});

			// ✅ JSON data modules
			dataCache.forEach((content) => {
				if (content && content !== "// loading..." && content.trim() !== "") {
					const m = content.trim().match(/\n/g);
					lines += (m ? m.length : 0) + 1;
				}
			});

			// async wrapper
			return lines + 1;
		}

		const ternHintProvider = function (cm, callback) {
			updateVirtualDoc(cm);

			const cur = cm.getCursor();
			const line = cm.getLine(cur.line);
			const offset = getTernLineOffset();

			// 1. Find the start of the word manually to avoid token drift
			// This regex looks backward from the cursor for the first non-word character
			const wordPart = line.slice(0, cur.ch).match(/[\w$]+$/);
			const startCh = wordPart ? cur.ch - wordPart[0].length : cur.ch;

			const query = {
				type: "completions",
				file: "editor.js",
				end: { line: cur.line + offset, ch: cur.ch },
				types: true,
				docs: true,
				caseInsensitive: true
			};

			ternServer.server.request({ query }, (err, data) => {
				if (err || !data || !data.completions) return callback(null);

				const result = {
					list: data.completions
						.filter(c => !c.name.startsWith("__mod_") && !c.name.startsWith("__data_"))
						.map(c => {
							let displayName = c.name;

							if (displayName.startsWith("__data_")) {
								displayName = displayName.slice("__data_".length);
							}

							if (displayName.startsWith("__mod_")) {
								displayName = displayName.slice("__mod_".length);
							}

							return {
								text: c.name, // IMPORTANT: keep actual insert
								render: (el) => {
									// Clone completion object so we don't mutate Tern internals
									const patched = { ...c };

									// Transform type string if present
									if (patched.type) {
										patched.type = patched.type.replace(/__(mod|data)_([\w$]+)(?:_Schema)?/g, "exports");

										// Optional: Clean up the "fn" arrows so the tooltip looks like modern JS
										patched.type = patched.type.replace(/fn\((.*?)\) -> (.*)/g, "($1) => $2");
									}

									const tip = ternServer.options.completionTip(patched);

									if (tip) {
										// Override visible name inside tip
										const nameEl = tip.querySelector(".cm-tern-name");
										if (nameEl) nameEl.textContent = displayName;

										el.appendChild(tip);
									} else {
										el.textContent = displayName;
									}
								}
							};
						}),
					// 2. THE ANCHOR: This defines exactly what gets replaced
					// 'from' is the start of the word (e.g., the 'L' in 'LO')
					// 'to' is the current cursor (the end of the word)
					from: CodeMirror.Pos(cur.line, startCh),
					to: cur
				};

				callback(result);
			});
		};
		// Critical for CodeMirror 5 async hints
		ternHintProvider.async = true;

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

					// 2. Otherwise, sync and show as normal
					updateVirtualDoc(cm);

					cm.showHint({
						hint: ternHintProvider,
						async: true,
						completeSingle: false,
						closeOnUnfocus: true,
						closeOnNoMatch: true,
						updateOnCursorActivity: true
					});
				},
				"F12": (cm) => {
					ternServer.jumpToDef(cm, (data) => {
						if (!data || data.file !== "editor.js") return;

						let lineOffset = 0;
						moduleCache.forEach(c => {
							if (c !== "// loading..." && c.trim() !== "") {
								const lines = c.match(/\n/g);
								lineOffset += (lines ? lines.length : 0) + (c.endsWith("\n") ? 0 : 1);
							}
						});

						// Move cursor to the corrected line
						cm.setCursor({ line: data.start.line - lineOffset, ch: data.start.ch });
						cm.focus();
					});
				},
				"Shift-F12": (cm) => { ternServer.showRefs(cm); },
				"F2": (cm) => { ternServer.rename(cm); },
				"Enter": (cm) => {
					if (cm.state.completionActive) cm.state.completionActive.pick();
					else return CodeMirror.Pass;
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

					// 🔥 Close Tern tooltips
					document.querySelectorAll(".CodeMirror-Tern-tooltip")
						.forEach(el => el.remove());

					return CodeMirror.Pass;
				},
				"Shift-Ctrl-Space": (cm) => {
					// 1. Sync the virtual doc so Tern knows the latest code state
					updateVirtualDoc(cm);

					// 2. This specifically triggers the parameter/argument tooltip
					// It is more robust for functions than .showType()
					ternServer.updateArgHints(cm);

					// 3. Fallback: If updateArgHints doesn't show (e.g., not inside parens),
					// request the full type info manually
					const data = ternServer.request(cm, "type", (err, data) => {
						if (data && !document.querySelector(".CodeMirror-Tern-tooltip")) {
							ternServer.showType(cm);
						}
					});
				}
			}
		});

		if (editorMode.includes("javascript")) {
			editor.ternServer = ternServer;

			editor.on("change", (cm) => {
				clearTimeout(editor.syncTimeout);
				editor.syncTimeout = setTimeout(() => {
					const code = cm.getValue();
					extractConstStrings(code);
					syncDependencies(cm);
					updateVirtualDoc(cm); // Refresh Tern's view of the code
				}, 500);
			});

			editor.on("change", (cm, change) => {
				ternServer.updateArgHints(cm);
			});

			let typingTimeout;

			editor.on("inputRead", function (cm, change) {
				// 1. Abort if the change comes from the completion itself
				if (change.origin === "complete") return;

				const typedChar = change.text[0];
				if (!typedChar || typedChar === " " || typedChar === ";") return;

				if (typingTimeout) clearTimeout(typingTimeout);

				typingTimeout = setTimeout(() => {
					const cur = cm.getCursor();
					const token = cm.getTokenAt(cur);

					// 2. THE FIX: Check for strings
					// CodeMirror modes typically use "string" or "string-2"
					const isInsideString = token.type && token.type.includes("string");

					if (isInsideString) {
						if (cm.state.completionActive) cm.state.completionActive.close();
						return;
					}

					// 3. Normal trigger logic
					const isTriggerChar = typedChar === "." || typedChar === ":";
					const isIdentifier = /variable|property|type/.test(token.type);
					const isWord = /[a-zA-Z0-9_$]/.test(typedChar);

					if (isTriggerChar || isIdentifier || isWord) {
						updateVirtualDoc(cm);

						cm.showHint({
							hint: ternHintProvider,
							completeSingle: false,
							updateOnCursorActivity: true,
							closeOnNoMatch: true,
							async: true
						});
					}
				}, 120);
			});

			editor.on("cursorActivity", (cm) => {
				// If the menu is NOT active, but the user is in the middle of a word
				// we might want to trigger it automatically (like VS Code)
				const cur = cm.getCursor();
				const token = cm.getTokenAt(cur);

				if (!cm.state.completionActive && token.string.length >= 2 && token.type === "variable") {
					// Optional: auto-trigger on backspace if 2+ chars remain
					// cm.execCommand("autocomplete"); 
				}

				// Existing "Close if empty" logic
				if (cm.state.completionActive && token.string.trim() === "" && token.type !== "property") {
					cm.state.completionActive.close();
				}
			});

			// --- Initial sync ---
			(function initEditorState() {
				const value = editor.getValue();

				// Sync textarea
				$editorTextarea.val(value);

				// Build variable map
				extractConstStrings(value);

				// Load dependencies (require + requireData)
				syncDependencies(editor);

				// Build Tern virtual doc
				updateVirtualDoc(editor);
			})();
		}

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
			$("<button class='restore-draft'>Restore</button>").appendTo($btns).on("click", () => { editor.setValue(saved); $banner.remove(); });
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