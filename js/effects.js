
/* ========================================
   AL BARDISI - VISUAL EFFECTS
   ======================================== */

(() => {
  "use strict";

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (reducedMotion) return;

  /* ---------- Cursor Glow ---------- */

  const cursorGlow = document.querySelector(".cursor-glow");

  const supportsFinePointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)"
  ).matches;

  if (cursorGlow && supportsFinePointer) {
    let mouseX = -500;
    let mouseY = -500;
    let glowX = mouseX;
    let glowY = mouseY;
    let animationFrame = null;

    document.addEventListener("pointermove", (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;

      if (!animationFrame) {
        animationFrame = requestAnimationFrame(updateGlow);
      }
    }, { passive: true });

    function updateGlow() {
      glowX += (mouseX - glowX) * 0.14;
      glowY += (mouseY - glowY) * 0.14;

      cursorGlow.style.transform =
        `translate3d(${glowX - 150}px, ${glowY - 150}px, 0)`;

      if (
        Math.abs(mouseX - glowX) > 0.5 ||
        Math.abs(mouseY - glowY) > 0.5
      ) {
        animationFrame = requestAnimationFrame(updateGlow);
      } else {
        animationFrame = null;
      }
    }

    document.addEventListener("pointerleave", () => {
      cursorGlow.style.opacity = "0";
    });

    document.addEventListener("pointerenter", () => {
      cursorGlow.style.opacity = "1";
    });
  } else if (cursorGlow) {
    cursorGlow.hidden = true;
  }

  /* ---------- Smooth Anchor Navigation ---------- */

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');

    if (!link) return;

    const targetId = link.getAttribute("href");

    if (!targetId || targetId === "#") return;

    const target = document.querySelector(targetId);

    if (!target) return;

    event.preventDefault();

    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

    if (history.replaceState) {
      history.replaceState(null, "", targetId);
    }
  });

  /* ---------- Subtle Card Hover ---------- */

  const finePointer = window.matchMedia(
    "(hover: hover) and (pointer: fine)"
  ).matches;

  if (finePointer) {
    document.addEventListener("pointerover", (event) => {
      const card = event.target.closest(".menu-card, .branch-card");

      if (card) {
        card.classList.add("hovered");
      }
    });

    document.addEventListener("pointerout", (event) => {
      const card = event.target.closest(".menu-card, .branch-card");

      if (card && !card.contains(event.relatedTarget)) {
        card.classList.remove("hovered");
      }
    });
  }

  /* ---------- Image Loading ---------- */

  document.addEventListener("error", (event) => {
    if (event.target instanceof HTMLImageElement) {
      event.target.classList.add("image-error");
    }
  }, true);

})();
