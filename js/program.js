document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[role='tablist']").forEach((list) => {
    const tabs = [...list.querySelectorAll("[role='tab']")];
    if (!tabs.length) return;

    const panelIds = tabs
      .map((tab) => tab.getAttribute("aria-controls"))
      .filter(Boolean);
    const panels = panelIds
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("aria-controls");
        tabs.forEach((t) => {
          const on = t === tab;
          t.classList.toggle("is-active", on);
          t.setAttribute("aria-selected", String(on));
        });
        panels.forEach((panel) => {
          panel.hidden = panel.id !== target;
        });
      });
    });
  });
});
