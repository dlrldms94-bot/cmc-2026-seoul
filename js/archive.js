const ArchivePage = {
  photos: [],
  lightboxIndex: null,

  async init() {
    const gate = document.getElementById("archiveGate");
    const app = document.getElementById("archiveApp");
    const form = document.getElementById("archiveLoginForm");
    const logoutBtn = document.getElementById("archiveLogoutBtn");
    const lightbox = document.getElementById("archiveLightbox");
    const lightboxClose = document.getElementById("archiveLightboxClose");

    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      this.login();
    });
    logoutBtn?.addEventListener("click", () => this.logout());
    lightboxClose?.addEventListener("click", () => this.closeLightbox());
    lightbox?.addEventListener("click", (e) => {
      if (e.target === lightbox) this.closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closeLightbox();
    });
    document.getElementById("archiveLightboxDownload")?.addEventListener("click", () => {
      if (this.lightboxIndex !== null) {
        this.downloadPhoto(this.photos[this.lightboxIndex]);
      }
    });

    try {
      const me = await this.api("/api/archive/me");
      if (me?.authenticated) {
        this.showApp();
        await this.loadGallery();
      } else {
        this.showGate();
      }
    } catch {
      this.showGate();
    }
  },

  showApp() {
    document.getElementById("archiveGate").hidden = true;
    document.getElementById("archiveApp").hidden = false;
    document.body.classList.add("is-archive-open");
  },

  showGate() {
    document.getElementById("archiveGate").hidden = false;
    document.getElementById("archiveApp").hidden = true;
    document.body.classList.remove("is-archive-open");
  },

  async api(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(options.headers || {}),
      },
      ...options,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = new Error(data?.error || "Request failed");
      err.status = res.status;
      throw err;
    }
    return data;
  },

  setLoginError(message) {
    const el = document.getElementById("archiveLoginError");
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  },

  async login() {
    this.setLoginError("");
    const password = document.getElementById("archivePassword")?.value || "";
    try {
      await this.api("/api/archive/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      document.getElementById("archivePassword").value = "";
      this.showApp();
      await this.loadGallery();
    } catch {
      this.setLoginError(
        typeof Locale !== "undefined"
          ? Locale.t("archive.password.error")
          : "비밀번호가 올바르지 않습니다."
      );
    }
  },

  async logout() {
    try {
      await this.api("/api/archive/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    this.showGate();
    document.getElementById("archiveGrid").innerHTML = "";
  },

  t(key, fallback) {
    return typeof Locale !== "undefined" ? Locale.t(key) : fallback;
  },

  caption(item) {
    if (typeof Locale !== "undefined" && Locale.current === "en") {
      return item.captionEn || item.captionKo || "";
    }
    return item.captionKo || item.captionEn || "";
  },

  async loadGallery() {
    const grid = document.getElementById("archiveGrid");
    const empty = document.getElementById("archiveEmpty");
    if (!grid) return;

    grid.innerHTML = "";
    empty.hidden = true;

    try {
      this.photos = await this.api("/api/archive/photos");
      if (!this.photos.length) {
        empty.hidden = false;
        return;
      }
      grid.innerHTML = this.photos
        .map(
          (item, index) => `
        <article class="archive-card">
          <button type="button" class="archive-item" data-index="${index}">
            <img src="${this.escapeAttr(item.url)}" alt="${this.escapeAttr(this.caption(item))}" loading="lazy" width="400" height="300" />
            ${
              this.caption(item)
                ? `<span class="archive-item-caption">${this.escapeHtml(this.caption(item))}</span>`
                : ""
            }
          </button>
          <button
            type="button"
            class="archive-download-btn archive-download-btn--card"
            data-download="${index}"
          >${this.escapeHtml(this.t("archive.download", "다운로드"))}</button>
        </article>`
        )
        .join("");

      grid.querySelectorAll(".archive-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.openLightbox(Number(btn.dataset.index));
        });
      });
      grid.querySelectorAll("[data-download]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.downloadPhoto(this.photos[Number(btn.dataset.download)]);
        });
      });
    } catch {
      empty.hidden = false;
      empty.textContent =
        typeof Locale !== "undefined"
          ? Locale.t("archive.loadError")
          : "갤러리를 불러오지 못했습니다.";
    }
  },

  openLightbox(index) {
    const item = this.photos[index];
    if (!item) return;
    this.lightboxIndex = index;
    const lightbox = document.getElementById("archiveLightbox");
    const img = document.getElementById("archiveLightboxImg");
    const cap = document.getElementById("archiveLightboxCaption");
    img.src = item.url;
    img.alt = this.caption(item);
    cap.textContent = this.caption(item);
    lightbox.hidden = false;
    document.body.classList.add("archive-lightbox-open");
  },

  closeLightbox() {
    const lightbox = document.getElementById("archiveLightbox");
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    this.lightboxIndex = null;
    document.getElementById("archiveLightboxImg").removeAttribute("src");
    document.body.classList.remove("archive-lightbox-open");
  },

  downloadFilename(item) {
    const base = String(item.filename || "photo").trim() || "photo";
    return base.includes(".") ? base : `${base}.jpg`;
  },

  async downloadPhoto(item) {
    if (!item?.url) return;
    try {
      const res = await fetch(item.url, { credentials: "same-origin" });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = this.downloadFilename(item);
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.alert(
        typeof Locale !== "undefined"
          ? Locale.t("archive.downloadError")
          : "다운로드에 실패했습니다."
      );
    }
  },

  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },

  escapeAttr(value) {
    return this.escapeHtml(value);
  },
};

document.addEventListener("DOMContentLoaded", () => {
  ArchivePage.init();
});

if (typeof Locale !== "undefined") {
  const originalApply = Locale.apply.bind(Locale);
  Locale.apply = function applyWithArchive() {
    originalApply();
    if (
      !document.getElementById("archiveApp")?.hidden &&
      ArchivePage.photos?.length
    ) {
      ArchivePage.loadGallery();
    }
  };
}
