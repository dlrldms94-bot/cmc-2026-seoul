const FaqPage = {
  inquiryTo: "2026CMCSEOUL@gmail.com",

  init() {
    this.bindAccordion();
    this.bindModal();
    this.bindForm();
  },

  bindAccordion() {
    document.querySelectorAll(".faq-question").forEach((btn) => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".faq-item");
        const open = item.classList.contains("is-open");
        document.querySelectorAll(".faq-item.is-open").forEach((el) => {
          el.classList.remove("is-open");
          el.querySelector(".faq-question")?.setAttribute("aria-expanded", "false");
        });
        if (!open) {
          item.classList.add("is-open");
          btn.setAttribute("aria-expanded", "true");
        }
      });
    });
  },

  bindModal() {
    const modal = document.getElementById("inquiryModal");
    const openBtn = document.getElementById("inquiryOpenBtn");
    const closeBtn = document.getElementById("inquiryCloseBtn");
    const backdrop = document.getElementById("inquiryBackdrop");
    if (!modal || !openBtn) return;

    const open = () => {
      modal.hidden = false;
      document.body.classList.add("faq-modal-open");
      document.getElementById("inquiryName")?.focus();
    };
    const close = () => {
      modal.hidden = true;
      document.body.classList.remove("faq-modal-open");
      this.setMsg("");
    };

    openBtn.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    backdrop?.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modal.hidden) close();
    });
    this.closeModal = close;
  },

  bindForm() {
    const form = document.getElementById("inquiryForm");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.submitInquiry();
    });
  },

  setMsg(text, type) {
    const el = document.getElementById("inquiryMsg");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.className = "faq-form-msg";
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.className = `faq-form-msg ${type === "error" ? "is-error" : "is-ok"}`;
  },

  async submitInquiry() {
    const name = document.getElementById("inquiryName").value.trim();
    const email = document.getElementById("inquiryEmail").value.trim();
    const message = document.getElementById("inquiryMessage").value.trim();
    const submitBtn = document.getElementById("inquirySubmitBtn");

    if (!name || !email || !message) {
      this.setMsg(
        typeof Locale !== "undefined" && Locale.current === "en"
          ? "Please fill in all fields."
          : "모든 항목을 입력해 주세요.",
        "error"
      );
      return;
    }

    submitBtn.disabled = true;
    this.setMsg("");

    try {
      const res = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "failed");

      if (data.sent) {
        this.setMsg(
          typeof Locale !== "undefined" && Locale.current === "en"
            ? "Your inquiry has been sent."
            : "문의가 접수되었습니다.",
          "ok"
        );
        document.getElementById("inquiryForm").reset();
        setTimeout(() => this.closeModal?.(), 1200);
      } else if (data.mailto) {
        window.location.href = data.mailto;
        this.setMsg(
          typeof Locale !== "undefined" && Locale.current === "en"
            ? "Opening your mail app..."
            : "메일 앱을 엽니다...",
          "ok"
        );
        setTimeout(() => this.closeModal?.(), 800);
      } else {
        this.openMailto(name, email, message);
      }
    } catch {
      this.openMailto(name, email, message);
    } finally {
      submitBtn.disabled = false;
    }
  },

  openMailto(name, email, message) {
    const subject = encodeURIComponent(`[CMC 문의] ${name}`);
    const body = encodeURIComponent(
      `이름: ${name}\n회신 받을 메일: ${email}\n\n${message}`
    );
    window.location.href = `mailto:${this.inquiryTo}?subject=${subject}&body=${body}`;
    this.setMsg(
      typeof Locale !== "undefined" && Locale.current === "en"
        ? "Opening your mail app..."
        : "메일 앱을 엽니다...",
      "ok"
    );
    setTimeout(() => this.closeModal?.(), 800);
  },
};

document.addEventListener("DOMContentLoaded", () => FaqPage.init());
