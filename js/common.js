document.addEventListener("DOMContentLoaded", () => {
  if (!Locale._initialized) {
    Locale.init();
  }

  const langBtn = document.getElementById("langToggle");
  if (langBtn) {
    langBtn.addEventListener("click", () => Locale.toggle());
  }

  const menuBtn = document.getElementById("menuToggle");
  const gnb = document.getElementById("gnb");
  if (menuBtn && gnb) {
    menuBtn.addEventListener("click", () => {
      const open = document.body.classList.toggle("nav-open");
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute(
        "aria-label",
        Locale.t(open ? "menu.close" : "menu.open")
      );
    });

    gnb.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        document.body.classList.remove("nav-open");
        menuBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  if (typeof Countdown !== "undefined" && document.getElementById("cd-day-0")) {
    Countdown.init();
  }
});
