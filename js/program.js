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

    const activateTab = (target) => {
      if (!target) return;
      tabs.forEach((t) => {
        const on = t.getAttribute("aria-controls") === target;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
      });
      panels.forEach((panel) => {
        panel.hidden = panel.id !== target;
      });
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.getAttribute("aria-controls");
        activateTab(target);
        if (target && list.classList.contains("speakers-tabs")) {
          history.replaceState(null, "", `#${target}`);
        }
      });
    });

    const hash = window.location.hash.slice(1);
    if (hash && panelIds.includes(hash)) {
      activateTab(hash);
    }

    window.addEventListener("hashchange", () => {
      const next = window.location.hash.slice(1);
      if (next && panelIds.includes(next)) {
        activateTab(next);
      }
    });
  });
});
