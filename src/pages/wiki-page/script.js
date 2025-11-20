import i18n from "../../js/repack-locales";

// Initialize locale helper
await i18n.init();

$(function () {
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
		CodeMirror.defineMode("lgwlInline", function() {
			return {
				startState: function() { return { strike: false, strong: false, em: false }; },
				token: function(stream, state) {
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
		CodeMirror.defineMode("LGWL", function(config) {
		const base = CodeMirror.getMode(config, "lgwlBase");
		const inline = CodeMirror.getMode(config, "lgwlInline");
		const htmlMode = CodeMirror.getMode(config, "htmlmixed");

		return CodeMirror.overlayMode(htmlMode, CodeMirror.overlayMode(base, inline));
		});

		// === Determine proper editor mode ===
		let editorMode = "LGWL";
		
		// Detect Module namespace but skip documentation subpages
		if (pageName.startsWith("Module:") && !pageName.includes("/doc")) {
			editorMode = "javascript";
		} else if (pageName.endsWith(".css")) {
			editorMode = "css";
		}

		// === Editor Initialization ===
		const darkTheme = $("body").data("theme") == "dark";
		const editor = CodeMirror.fromTextArea($editorTextarea[0], {
			lineNumbers: true,
			mode: editorMode,
			theme: editorMode == "javascript" || editorMode == "css" ? (darkTheme ? "monokai" : "eclipse") : "lgwl",
			lineWrapping: true,
			viewportMargin: Infinity,
			smartIndent: false,
			indentWithTabs: false,
			indentUnit: 0,
			extraKeys: {
				"Ctrl-S": function(cm) {
				const content = cm.getValue();
				try {
					localStorage.setItem(storageKey, content);
					console.log(`[Draft saved @ ${new Date().toLocaleTimeString()}]`);
					showSaveToast(i18n.t ? i18n.t("wiki.edit.draft_saved") : "Draft saved");
				} catch (e) {
					console.warn("Autosave failed:", e);
				}
				}
			}
		});

		// === Magic words that should NOT become links ===
		const LGWL_MAGIC_WORDS = new Set([
			"PAGENAME",
			"NAMESPACE",
			"FULLPAGENAME",
			"SITENAME",
			"DATE",
			"TIME"
		]);

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

		// === Make template and module marks clickable ===
		editor.on('mousedown', function(cm, event) {
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
		});

		// Keep textarea synced for autosave + preview
		editor.on("change", () => $editorTextarea.val(editor.getValue()));
		
		// === Call linkifyTemplates on editor changes ===
		editor.on('change', () => linkifyTemplates(editor));
		linkifyTemplates(editor); // initial pass

        // Refresh editor on window resize
        $(window).on("resize", () => editor.refresh());

        // Autosave every 5 seconds if content changed
        let lastContent = editor.getValue();
        setInterval(() => {
            const cur = editor.getValue();
            if (cur !== lastContent) {
                try { localStorage.setItem(storageKey, cur); } catch (e) {}
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
                try { localStorage.removeItem(storageKey); } catch (e) {}

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
				const renderTime = json.renderTimeMs
					? `<div class='preview-render-time'>Rendered in ${json.renderTimeMs} ms</div>`
					: "";

				$body.html(`
					${renderTime}
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

        // Display selected file name
        const $fileNameDisplay = $("<span class='file-name-display'></span>").insertAfter($fileInput);
        $fileInput.on("change", function () {
            const files = this.files;
            $fileNameDisplay.text(files && files.length ? files[0].name : "");
        });

        // Progress bar
        const $progressBar = $("<div class='upload-progress'><div class='progress-inner'></div></div>").insertAfter($submitBtn);
        $progressBar.hide();

        $uploadForm.on("submit", function (e) {
            e.preventDefault();
            const file = $fileInput[0].files[0];
            if (!file) return alert("Please select a file to upload.");

			// Use the query parameter ?file if available, else fallback to actual filename
			let fileName = new URLSearchParams(window.location.search).get("file") || uploadFile.name;

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

			// Final target: If it's a redirect, show redirectTo, else show normal path
			const finalTarget = r.isRedirect && r.redirectTo
				? r.redirectTo
				: (isMain ? r.path : `${r.namespace}:${r.path}`);

			const href = `/wikis/${wikiName}/${encodeURIComponent(finalTarget.replace(/ /g, "_"))}`;

			container.append(`
				<a class="wiki-search-item" href="${href}">
					<div class="wiki-search-title">
						${title}
						${r.isRedirect ? `<span class="wiki-search-redirect">→ ${r.redirectTo}</span>` : ""}
					</div>
				</a>
			`);
		});

		container.show();
	}
});