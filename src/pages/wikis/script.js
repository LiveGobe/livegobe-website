import i18n from "../../js/repack-locales";

await i18n.init();

$(function () {
  const $modal = $("#create-wiki-block");
  const $overlay = $("#create-wiki-overlay");

  // Open modal
  $(document).on("click", "#create-wiki", function () {
    $modal.removeClass("hidden");
  });

  // Close modal
  $modal.on("click", ".btn-cancel", () => $modal.addClass("hidden"));
  $overlay.on("click", () => $modal.addClass("hidden"));

  // Create wiki
  $modal.on("click", ".btn-create", function () {
    const name = $("#wiki-name").val().trim();
    const description = $("#wiki-desc").val().trim();
    const language = $("#wiki-lang").val();

    if (!name) {
      alert(i18n.t("page.wikis.create.name_required"));
      return;
    }

    $.ajax({
      method: "POST",
      url: "/api/v2/wikis",
      data: { name, description, language },
    })
      .done(() => {
        location.reload();
      })
      .fail((xhr) => {
        alert(xhr.responseText || i18n.t("page.wikis.create.failed"));
      });
  });
});