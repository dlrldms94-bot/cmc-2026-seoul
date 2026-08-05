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

  isEn() {
    return typeof Locale !== "undefined" && Locale.current === "en";
  },

  async sendViaFormSubmit(name, email, message) {
    const res = await fetch(
      `https://formsubmit.co/ajax/${encodeURIComponent(this.inquiryTo)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          message,
          _subject: `[CMC 문의] ${name}`,
          _replyto: email,
          _template: "table",
          _captcha: false,
        }),
      }
    );
    const data = await res.json().catch(() => ({}));
    const ok =
      res.ok &&
      String(data.success).toLowerCase() !== "false" &&
      !String(data.message || "")
        .toLowerCase()
        .includes("will not work");
    return { ok, data };
  },

  async saveOnServer(name, email, message) {
    const res = await fetch("/api/inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok !== false, data };
  },

  async submitInquiry() {
    const name = document.getElementById("inquiryName").value.trim();
    const email = document.getElementById("inquiryEmail").value.trim();
    const message = document.getElementById("inquiryMessage").value.trim();
    const submitBtn = document.getElementById("inquirySubmitBtn");

    if (!name || !email || !message) {
      this.setMsg(
        this.isEn() ? "Please fill in all fields." : "모든 항목을 입력해 주세요.",
        "error"
      );
      return;
    }

    submitBtn.disabled = true;
    this.setMsg("");

    try {
      // 1) Browser → FormSubmit (server-side FormSubmit is rejected)
      // 2) Also save on our API so admin can read inquiries
      const [mailResult, saveResult] = await Promise.all([
        this.sendViaFormSubmit(name, email, message).catch((err) => ({
          ok: false,
          data: { message: String(err?.message || err) },
        })),
        this.saveOnServer(name, email, message).catch(() => ({
          ok: false,
          data: {},
        })),
      ]);

      if (mailResult.ok || saveResult.ok) {
        const note = String(mailResult.data?.message || "");
        const needsActivate =
          /activat|confirm|check your email/i.test(note) ||
          (!mailResult.ok && saveResult.ok);

        if (needsActivate && !mailResult.ok) {
          this.setMsg(
            this.isEn()
              ? "Inquiry saved. Check 2026CMCSEOUL@gmail.com (including spam) and click the FormSubmit activation link once."
              : "문의가 저장되었습니다. 2026CMCSEOUL@gmail.com 메일함(스팸 포함)에서 FormSubmit 활성화 링크를 한 번 눌러 주세요.",
            "ok"
          );
        } else {
          this.setMsg(
            this.isEn()
              ? "Your inquiry has been sent."
              : "문의가 접수되었습니다.",
            "ok"
          );
        }
        document.getElementById("inquiryForm").reset();
        setTimeout(() => this.closeModal?.(), 1800);
        return;
      }

      this.setMsg(
        this.isEn()
          ? "Failed to send inquiry. Please try again."
          : "문의 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        "error"
      );
    } catch {
      this.setMsg(
        this.isEn()
          ? "Failed to send inquiry. Please try again."
          : "문의 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        "error"
      );
    } finally {
      submitBtn.disabled = false;
    }
  },
};

document.addEventListener("DOMContentLoaded", () => FaqPage.init());
