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
		CodeMirror.defineMode("lgwlBase", function(config) {
			return {
				startState: function() {
				return {
					inNowiki: false,
					inTemplate: 0,
					inLink: 0,
					inCodeBlock: false
				};
				},
				token: function(stream, state) {

				// --- Nowiki ---
				if (!state.inNowiki && stream.match("<nowiki>", true)) {
					state.inNowiki = true;
					return "nowiki";
				}
				if (state.inNowiki) {
					if (stream.match("</nowiki>", true)) { state.inNowiki = false; }
					else { stream.next(); }
					return "nowiki";
				}

				// --- Redirects ---
				if (stream.match(/^#REDIRECT\b/i, true)) return "redirect";

				// --- Code block ``` ---
				if (!state.inCodeBlock && stream.match(/^```/, true)) {
					state.inCodeBlock = true;
					return "code-block";
				}
				if (state.inCodeBlock) {
					if (stream.match(/^```/, true)) { state.inCodeBlock = false; }
					else { stream.skipToEnd(); }
					return "code-block";
				}

				// --- Template {{...}} ---
				if (stream.match("{{", true)) {
					state.inTemplate++;
					return "template";
				}
				if (state.inTemplate > 0) {
					// Built-in templates
					const builtinMatch = stream.match(/(!|=|\(|\)|\[|\]|\{|\}|<|>|:)(?=}})/);
					if (builtinMatch && BUILTIN_TEMPLATES[builtinMatch[1]]) return "template-builtin";

					if (stream.match("}}", true)) {
					state.inTemplate--;
					return "template";
					} else {
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
					// Category / Tag links
					if (stream.match(/Category:/, true)) return "category-link";
					if (stream.match(/(Tag|Tags?):/, true)) return "tag-link";

					if (stream.match("]]", true)) {
					state.inLink--;
					return "link";
					} else {
					stream.next();
					return "link";
					}
				}

				// --- External link [http://...] ---
				if (!state.inLink && stream.peek() === "[") {
					const rest = stream.string.slice(stream.pos);
					const match = rest.match(/^\[(https?:\/\/[^\s\]]+(\s[^\]]+)?)\]/);
					if (match) {
					stream.match(match[0]);
					return "link";
					}
				}

				// --- Tables ---
				if (stream.match(/^\|\-/, true)) return "table-divider";
				if (stream.match(/^\|\|/, true)) return "table-pipe";
				if (stream.match(/^\|/, true)) return "table-pipe";
				if (stream.match(/^!/, true)) return "table-header";

				// --- Headings == ... == ---
				if (stream.match(/^(={2,6})\s*(.*?)\s*\1$/, true)) return "heading";

				// --- Lists *, #, - ---
				if (stream.match(/^(\*+|\#+|\-+)\s+/, true)) return "list";

				// --- Blockquote > ---
				if (stream.match(/^>\s+/, true)) return "blockquote";

				// --- Horizontal rule (---- or ***) ---
				if (stream.match(/^(-{4,}|\*{3,})$/, true)) return "hr";

				// --- HTML fallback ---
				if (!stream.eol()) { stream.next(); return null; }
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
		}

		// === Editor Initialization ===
		const editor = CodeMirror.fromTextArea($editorTextarea[0], {
			lineNumbers: true,
			mode: editorMode,
			theme: editorMode == "javascript" ? "eclipse" : "lgwl",
			lineWrapping: true,
			viewportMargin: Infinity,
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

			// Match {{ ... }} blocks that may span multiple lines, up to 1000 characters
			const regex = /\{\{([\s\S]{0,1000}?)\}\}/g;
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
            if (json.html) $body.html(`<div class='wiki-preview'>${json.html}</div>`);
            else $body.html(`<div class='error'>${json.message || "Preview unavailable"}</div>`);
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
});