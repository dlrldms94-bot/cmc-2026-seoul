const NoticeView = {
  async init() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const root = document.getElementById("noticeView");
    if (!root) return;

    if (!id) {
      root.innerHTML = `<p class="notice-view-empty" data-i18n="notice.notFound">글을 찾을 수 없습니다.</p>`;
      if (typeof Locale !== "undefined") Locale.apply();
      return;
    }

    try {
      const item = await fetch(`/api/notices/${encodeURIComponent(id)}`).then(
        (res) => {
          if (!res.ok) throw new Error("failed");
          return res.json();
        }
      );

      root.innerHTML = `
        <div class="notice-view-head">
          ${
            item.pinned
              ? `<span class="notice-badge" data-i18n="notice.badge">공지</span>`
              : ""
          }
          <h2 class="notice-view-title"
            data-ko="${this.escapeAttr(item.titleKo)}"
            data-en="${this.escapeAttr(item.titleEn || item.titleKo)}"
          >${this.escape(item.titleKo)}</h2>
          <p class="notice-view-date">${this.escape(item.date)}</p>
        </div>
        <div class="notice-view-body"
          data-ko="${this.escapeAttr(item.bodyKo || "")}"
          data-en="${this.escapeAttr(item.bodyEn || item.bodyKo || "")}"
        >${this.escape(item.bodyKo || "").replaceAll("\n", "<br>")}</div>
        <div class="notice-view-actions">
          <a class="notice-back-btn" href="announcements.html" data-i18n="notice.back">목록으로</a>
        </div>
      `;

      // body uses data-ko/en but Locale sets textContent which strips <br>
      // store raw and apply manually after Locale
      this.item = item;
      if (typeof Locale !== "undefined") Locale.apply();
      this.applyBody();
      document.documentElement.addEventListener(
        "localechange",
        () => this.applyBody(),
        { once: false }
      );
      // Hook language toggle to refresh body newlines
      const langBtn = document.getElementById("langToggle");
      if (langBtn) {
        langBtn.addEventListener("click", () => {
          setTimeout(() => this.applyBody(), 0);
        });
      }
    } catch {
      root.innerHTML = `<p class="notice-view-empty" data-i18n="notice.notFound">글을 찾을 수 없습니다.</p>`;
      if (typeof Locale !== "undefined") Locale.apply();
    }
  },

  applyBody() {
    if (!this.item) return;
    const bodyEl = document.querySelector(".notice-view-body");
    if (!bodyEl) return;
    const text =
      (typeof Locale !== "undefined" && Locale.current === "en"
        ? this.item.bodyEn || this.item.bodyKo
        : this.item.bodyKo) || "";
    bodyEl.innerHTML = this.escape(text).replaceAll("\n", "<br>");
  },

  escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },

  escapeAttr(value) {
    return this.escape(value).replaceAll("\n", "&#10;");
  },
};

document.addEventListener("DOMContentLoaded", () => {
  NoticeView.init();
});
