const AdminApp = {
  editingId: null,

  async init() {
    document.getElementById("loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.login();
    });
    document.getElementById("logoutBtn").addEventListener("click", () => {
      this.logout();
    });
    document.getElementById("noticeForm").addEventListener("submit", (e) => {
      e.preventDefault();
      this.save();
    });
    document.getElementById("resetBtn").addEventListener("click", () => {
      this.resetForm();
    });

    const me = await this.api("/api/admin/me");
    if (me?.authenticated) {
      this.showDashboard();
      await this.loadList();
    } else {
      this.showLogin();
    }
  },

  showLogin() {
    document.getElementById("loginView").hidden = false;
    document.getElementById("dashboardView").hidden = true;
  },

  showDashboard() {
    document.getElementById("loginView").hidden = true;
    document.getElementById("dashboardView").hidden = false;
    if (!document.getElementById("date").value) {
      document.getElementById("date").value = new Date()
        .toISOString()
        .slice(0, 10);
    }
    this.loadInquiries();
  },

  setError(id, message) {
    const el = document.getElementById(id);
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  },

  async api(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
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

  async login() {
    this.setError("loginError", "");
    const password = document.getElementById("password").value;
    try {
      await this.api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      document.getElementById("password").value = "";
      this.showDashboard();
      await this.loadList();
    } catch {
      this.setError("loginError", "비밀번호가 올바르지 않습니다.");
    }
  },

  async logout() {
    try {
      await this.api("/api/admin/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    this.resetForm();
    this.showLogin();
  },

  async loadList() {
    const listEl = document.getElementById("noticeList");
    listEl.innerHTML = `<div class="admin-empty">불러오는 중...</div>`;
    try {
      const list = await this.api("/api/notices");
      if (!list.length) {
        listEl.innerHTML = `<div class="admin-empty">등록된 글이 없습니다.</div>`;
        return;
      }
      listEl.innerHTML = list
        .map(
          (item) => `
        <article class="admin-item" data-id="${item.id}">
          <div class="admin-item-main">
            <strong>
              ${this.escape(item.titleKo)}
              ${item.pinned ? `<span class="admin-badge">공지</span>` : ""}
            </strong>
            <div class="admin-item-meta">
              No.${item.no} · ${this.escape(item.date)}
            </div>
          </div>
          <div class="admin-item-actions">
            <button type="button" class="admin-btn admin-btn-ghost" data-edit="${item.id}">수정</button>
            <button type="button" class="admin-btn admin-btn-danger" data-delete="${item.id}">삭제</button>
          </div>
        </article>`
        )
        .join("");

      listEl.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", () => this.edit(btn.dataset.edit, list));
      });
      listEl.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", () => this.remove(btn.dataset.delete));
      });
    } catch (err) {
      if (err.status === 401) {
        this.showLogin();
        return;
      }
      listEl.innerHTML = `<div class="admin-empty">목록을 불러오지 못했습니다.</div>`;
    }
  },

  async loadInquiries() {
    const listEl = document.getElementById("inquiryList");
    if (!listEl) return;
    listEl.innerHTML = `<div class="admin-empty">불러오는 중...</div>`;
    try {
      const list = await this.api("/api/inquiries");
      if (!list.length) {
        listEl.innerHTML = `<div class="admin-empty">접수된 문의가 없습니다.</div>`;
        return;
      }
      listEl.innerHTML = list
        .map((item) => {
          const when = String(item.createdAt || "").replace("T", " ").slice(0, 19);
          return `
        <article class="admin-item admin-inquiry-item">
          <div class="admin-item-main">
            <strong>${this.escape(item.name)}</strong>
            <div class="admin-item-meta">
              <a href="mailto:${this.escape(item.email)}">${this.escape(item.email)}</a>
              · ${this.escape(when)}
            </div>
            <p class="admin-inquiry-body">${this.escape(item.message)}</p>
          </div>
        </article>`;
        })
        .join("");
    } catch (err) {
      if (err.status === 401) {
        this.showLogin();
        return;
      }
      listEl.innerHTML = `<div class="admin-empty">문의 목록을 불러오지 못했습니다.</div>`;
    }
  },

  edit(id, list) {
    const item = list.find((n) => n.id === id);
    if (!item) return;
    this.editingId = id;
    document.getElementById("noticeId").value = id;
    document.getElementById("titleKo").value = item.titleKo || "";
    document.getElementById("titleEn").value = item.titleEn || "";
    document.getElementById("bodyKo").value = item.bodyKo || "";
    document.getElementById("bodyEn").value = item.bodyEn || "";
    document.getElementById("date").value = item.date || "";
    document.getElementById("pinned").checked = Boolean(item.pinned);
    document.getElementById("formTitle").textContent = "글 수정";
    document.getElementById("saveBtn").textContent = "수정 저장";
    this.setError("formError", "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  },

  resetForm() {
    this.editingId = null;
    document.getElementById("noticeForm").reset();
    document.getElementById("noticeId").value = "";
    document.getElementById("date").value = new Date()
      .toISOString()
      .slice(0, 10);
    document.getElementById("formTitle").textContent = "새 글 작성";
    document.getElementById("saveBtn").textContent = "등록";
    this.setError("formError", "");
  },

  async save() {
    this.setError("formError", "");
    const payload = {
      titleKo: document.getElementById("titleKo").value.trim(),
      titleEn: document.getElementById("titleEn").value.trim(),
      bodyKo: document.getElementById("bodyKo").value.trim(),
      bodyEn: document.getElementById("bodyEn").value.trim(),
      date: document.getElementById("date").value,
      pinned: document.getElementById("pinned").checked,
    };

    try {
      if (this.editingId) {
        await this.api(`/api/notices/${this.editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await this.api("/api/notices", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      this.resetForm();
      await this.loadList();
    } catch (err) {
      if (err.status === 401) {
        this.showLogin();
        return;
      }
      this.setError("formError", err.message || "저장에 실패했습니다.");
    }
  },

  async remove(id) {
    if (!confirm("이 글을 삭제할까요?")) return;
    try {
      await this.api(`/api/notices/${id}`, { method: "DELETE" });
      if (this.editingId === id) this.resetForm();
      await this.loadList();
    } catch (err) {
      if (err.status === 401) {
        this.showLogin();
        return;
      }
      alert("삭제에 실패했습니다.");
    }
  },

  escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },
};

document.addEventListener("DOMContentLoaded", () => AdminApp.init());
