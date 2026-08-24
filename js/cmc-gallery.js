/**
 * CMC 소개 — image gallery (3 visible, slide when more)
 */
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-cmc-gallery]").forEach(initCmcGallery);
});

function initCmcGallery(root) {
  const track = root.querySelector(".cmc-gallery-track");
  const items = [...root.querySelectorAll(".cmc-gallery-item")];
  const prevBtn = root.querySelector(".cmc-gallery-prev");
  const nextBtn = root.querySelector(".cmc-gallery-next");

  if (!track || items.length === 0) {
    return;
  }

  let index = 0;

  function getVisibleCount() {
    if (window.matchMedia("(max-width: 640px)").matches) {
      return 1;
    }
    if (window.matchMedia("(max-width: 960px)").matches) {
      return 2;
    }
    return 3;
  }

  function update() {
    const visible = getVisibleCount();
    const maxIndex = Math.max(0, items.length - visible);
    index = Math.min(index, maxIndex);

    const itemWidth = items[0].getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(track).gap) || 0;
    track.style.transform = `translateX(-${index * (itemWidth + gap)}px)`;

    const needsNav = items.length > visible;
    root.classList.toggle("is-sliding", needsNav);

    if (prevBtn) {
      prevBtn.disabled = !needsNav || index === 0;
    }
    if (nextBtn) {
      nextBtn.disabled = !needsNav || index >= maxIndex;
    }
  }

  prevBtn?.addEventListener("click", () => {
    index -= 1;
    update();
  });

  nextBtn?.addEventListener("click", () => {
    index += 1;
    update();
  });

  window.addEventListener("resize", update);
  update();
}
