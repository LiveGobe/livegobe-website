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

		// --- Initialize editor ---
		const lgmlDefs = {
			"requireData": { "!doc": "LGML helper function to load JSON-data modules", "!type": "fn(name: string) -> object" },
			"require": { "!doc": "Require another module", "!type": "fn(name: string) -> any" },
			"module.exports": { "!doc": "Alias to \"exports\"", "!type": "object" },
			"exports": { "!doc": "Export object for this module", "!type": "object" }
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

				const firstLine = data.doc?.split("\n").find(l => l.trim());
				div.textContent = firstLine || data.doc || data.name || "";

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
				"Ctrl-Space": function (cm) {
					// This is the bridge that actually opens the menu
					ternServer.getHint(cm, (data) => {
						cm.showHint({
							hint: () => data, // Pass the Tern data to the UI
							completeSingle: false
						});
					});
				},
				"F12": (cm) => { ternServer.jumpToDef(cm); },
				"Alt-.": (cm) => { ternServer.jumpToDef(cm); }, // VS Code Alt+Click equivalent
				"Shift-F12": (cm) => { ternServer.showRefs(cm); },
				"F2": (cm) => { ternServer.rename(cm); },
				"Ctrl-I": (cm) => { ternServer.showType(cm); },
				"Ctrl-Q": (cm) => { ternServer.rename(cm); }
			}
		});

		if (editorMode.includes("javascript")) {
			editor.ternServer = ternServer;

			// Register doc
			ternServer.addDoc("editor.js", editor.getDoc());

			editor.on("change", (cm, change) => {
				ternServer.updateArgHints(cm);
			});

			let typingTimeout;

			editor.on("inputRead", function (cm, change) {
				// 1. Basic safety checks
				if (change.origin === "+delete" || cm.state.completionActive) return;

				const cur = cm.getCursor();
				const token = cm.getTokenAt(cur);

				// 2. Clear the previous timeout correctly using the scoped variable
				if (typingTimeout) clearTimeout(typingTimeout);

				// 3. Trigger logic
				if (change.text[0] === "." || token.type === "variable" || (token.string.length > 0 && token.type !== "comment")) {
					typingTimeout = setTimeout(() => {
						// Use the ternServer instance you defined earlier
						ternServer.getHint(cm, (data) => {
							if (!data) return;

							cm.showHint({
								hint: () => data,
								completeSingle: false,
								// This helps the menu stay aligned with what you're typing
								closeOnUnfocus: true
							});
						});
					}, 150);
				}
			});

			// Arg hints
			editor.on("cursorActivity", (cm) => {
				ternServer.updateArgHints(cm);
			});
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