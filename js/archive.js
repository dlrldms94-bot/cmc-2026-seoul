const ArchivePage = {
  allPhotos: [],
  activeDay: "day1",
  lightboxIndex: null,
  photoBlobUrls: new Map(),

  get visiblePhotos() {
    return this.allPhotos.filter((item) => item.day === this.activeDay);
  },

  async init() {
    if (window.location.protocol === "file:") {
      this.showFileProtocolHint();
      return;
    }

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
      const box = document.getElementById("archiveLightbox");
      if (box?.hidden) return;
      if (e.key === "Escape") this.closeLightbox();
      if (e.key === "ArrowLeft") this.showLightboxPhoto(this.lightboxIndex - 1);
      if (e.key === "ArrowRight") this.showLightboxPhoto(this.lightboxIndex + 1);
    });
    document.getElementById("archiveLightboxPrev")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showLightboxPhoto(this.lightboxIndex - 1);
    });
    document.getElementById("archiveLightboxNext")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showLightboxPhoto(this.lightboxIndex + 1);
    });

    document.querySelectorAll(".archive-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        this.setActiveDay(tab.getAttribute("data-day"));
      });
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

  showFileProtocolHint() {
    this.showGate();
    const hint = document.querySelector(".archive-gate-hint");
    const form = document.getElementById("archiveLoginForm");
    if (form) form.hidden = true;
    if (hint) {
      hint.textContent =
        "아카이브는 로컬 서버에서만 동작합니다. 터미널에서 npm run dev:local 실행 후 반드시 http://localhost:3000/archive/ 주소로 접속하세요. (파일 더블클릭·Live Server·127.0.0.1 은 안 됩니다)";
    }
  },

  setActiveDay(day) {
    this.activeDay = day === "day2" ? "day2" : "day1";
    document.querySelectorAll(".archive-tab").forEach((tab) => {
      const on = tab.getAttribute("data-day") === this.activeDay;
      tab.classList.toggle("is-active", on);
      tab.setAttribute("aria-selected", String(on));
    });
    const grid = document.getElementById("archiveGrid");
    const activeTab = document.getElementById(
      this.activeDay === "day2" ? "tab-archive-day2" : "tab-archive-day1"
    );
    if (grid && activeTab) {
      grid.setAttribute("aria-labelledby", activeTab.id);
    }
    void this.renderGrid();
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
    this.revokeBlobUrls();
    this.showGate();
    this.allPhotos = [];
    document.getElementById("archiveGrid").innerHTML = "";
  },

  revokeBlobUrls() {
    for (const url of this.photoBlobUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.photoBlobUrls.clear();
  },

  async ensureBlobUrl(item) {
    if (!item?.id) return "";
    const cached = this.photoBlobUrls.get(item.id);
    if (cached) return cached;

    const res = await fetch(item.url, { credentials: "same-origin" });
    if (!res.ok) {
      throw new Error(`photo ${res.status}`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    this.photoBlobUrls.set(item.id, objectUrl);
    return objectUrl;
  },

  caption(item) {
    if (typeof Locale !== "undefined" && Locale.current === "en") {
      return item.captionEn || item.captionKo || "";
    }
    return item.captionKo || item.captionEn || "";
  },

  async loadGallery() {
    const empty = document.getElementById("archiveEmpty");
    try {
      this.revokeBlobUrls();
      this.allPhotos = await this.api("/api/archive/photos");
      if (!Array.isArray(this.allPhotos)) {
        throw new Error("invalid response");
      }
      this.allPhotos = this.allPhotos.map((item) => ({
        ...item,
        day: item.day === "day2" ? "day2" : "day1",
      }));
      await this.renderGrid();
    } catch (err) {
      empty.hidden = false;
      if (err?.status === 401) {
        empty.textContent =
          "로그인이 만료되었습니다. 나갔다가 비밀번호로 다시 입장해 주세요.";
        this.showGate();
        return;
      }
      empty.textContent =
        typeof Locale !== "undefined"
          ? Locale.t("archive.loadError")
          : "갤러리를 불러오지 못했습니다.";
    }
  },

  emptyMessage() {
    const dayLabel = this.activeDay === "day2" ? "DAY2" : "DAY1";
    const base =
      typeof Locale !== "undefined"
        ? Locale.t("archive.empty")
        : "등록된 사진이 없습니다.";
    if (this.allPhotos.length) {
      return `${dayLabel}에 등록된 사진이 없습니다. 다른 탭을 확인해 주세요.`;
    }
    return base;
  },

  async renderGrid() {
    const grid = document.getElementById("archiveGrid");
    const empty = document.getElementById("archiveEmpty");
    if (!grid) return;

    const photos = this.visiblePhotos;
    grid.innerHTML = "";
    empty.hidden = true;

    if (!photos.length) {
      empty.hidden = false;
      empty.textContent = this.emptyMessage();
      return;
    }

    grid.innerHTML = photos
      .map(
        (item, index) => `
        <article class="archive-card">
          <button type="button" class="archive-item" data-index="${index}">
            <img class="archive-item-img is-loading" data-photo-id="${this.escapeAttr(item.id)}" alt="${this.escapeAttr(this.caption(item))}" width="400" height="300" />
            ${
              this.caption(item)
                ? `<span class="archive-item-caption">${this.escapeHtml(this.caption(item))}</span>`
                : ""
            }
          </button>
        </article>`
      )
      .join("");

    grid.querySelectorAll(".archive-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.openLightbox(Number(btn.dataset.index));
      });
    });

    await Promise.all(
      [...grid.querySelectorAll("img[data-photo-id]")].map(async (img) => {
        const id = img.getAttribute("data-photo-id");
        const item = photos.find((p) => p.id === id);
        if (!item) return;
        try {
          img.src = await this.ensureBlobUrl(item);
          img.classList.remove("is-loading");
        } catch {
          img.classList.add("is-error");
          img.alt = "사진을 불러오지 못했습니다";
        }
      })
    );
  },

  openLightbox(index) {
    if (!this.visiblePhotos[index]) return;
    document.getElementById("archiveLightbox").hidden = false;
    document.body.classList.add("archive-lightbox-open");
    void this.showLightboxPhoto(index);
  },

  async showLightboxPhoto(index) {
    const photos = this.visiblePhotos;
    if (index < 0 || index >= photos.length) return;
    const item = photos[index];
    if (!item) return;

    this.lightboxIndex = index;
    const img = document.getElementById("archiveLightboxImg");
    const cap = document.getElementById("archiveLightboxCaption");
    const prevBtn = document.getElementById("archiveLightboxPrev");
    const nextBtn = document.getElementById("archiveLightboxNext");

    img.classList.add("is-loading");
    img.removeAttribute("src");
    img.alt = this.caption(item);
    cap.textContent = this.caption(item);

    if (prevBtn) {
      prevBtn.disabled = index <= 0;
    }
    if (nextBtn) {
      nextBtn.disabled = index >= photos.length - 1;
    }

    try {
      img.src = await this.ensureBlobUrl(item);
      img.classList.remove("is-loading");
    } catch {
      img.classList.add("is-error");
      cap.textContent = "사진을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.";
    }
  },

  closeLightbox() {
    const lightbox = document.getElementById("archiveLightbox");
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    this.lightboxIndex = null;
    document.getElementById("archiveLightboxImg").removeAttribute("src");
    document.body.classList.remove("archive-lightbox-open");
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
    if (!document.getElementById("archiveApp")?.hidden) {
      void ArchivePage.renderGrid();
    }
  };
}
