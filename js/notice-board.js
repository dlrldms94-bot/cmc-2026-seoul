const NoticeBoard = {
  async init() {
    const tbody = document.getElementById("noticeTbody");
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="3" class="notice-empty">불러오는 중...</td></tr>`;

    try {
      const list = await fetch("/api/notices").then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json();
      });

      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="notice-empty" data-i18n="notice.empty">등록된 공지사항이 없습니다.</td></tr>`;
        if (typeof Locale !== "undefined") Locale.apply();
        return;
      }

      tbody.innerHTML = list
        .map((item) => {
          const titleClass = item.pinned
            ? "notice-title is-pinned"
            : "notice-title";
          const badge = item.pinned
            ? `<span class="notice-badge" data-i18n="notice.badge">공지</span>`
            : "";
          return `
            <tr>
              <td class="col-no">${item.no}</td>
              <td class="col-title">
                <a class="${titleClass}" href="view.html?id=${encodeURIComponent(item.id)}">
                  ${badge}
                  <span data-ko="${this.escapeAttr(item.titleKo)}" data-en="${this.escapeAttr(item.titleEn || item.titleKo)}">${this.escape(item.titleKo)}</span>
                </a>
              </td>
              <td class="col-date">${this.escape(item.date)}</td>
            </tr>`;
        })
        .join("");

      if (typeof Locale !== "undefined") Locale.apply();
    } catch {
      tbody.innerHTML = `<tr><td colspan="3" class="notice-empty" data-i18n="notice.loadError">공지사항을 불러오지 못했습니다.</td></tr>`;
      if (typeof Locale !== "undefined") Locale.apply();
    }
  },

  escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },

  escapeAttr(value) {
    return this.escape(value).replaceAll("\n", " ");
  },
};

document.addEventListener("DOMContentLoaded", () => {
  NoticeBoard.init();
});
