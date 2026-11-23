
/* ========================================
   AL BARDISI RESTAURANT
   Visual Effects Controller
   ======================================== */

(function () {
  "use strict";

  /* ---------- Device Detection ---------- */

  const supportsFinePointer =
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const reducedMotion =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Cursor Glow ---------- */

  function initCursorGlow() {
    if (!supportsFinePointer || reducedMotion) return;

    const glow = document.createElement("div");

    glow.className = "cursor-glow";
    glow.setAttribute("aria-hidden", "true");

    document.body.appendChild(glow);

    let mouseX = 0;
    let mouseY = 0;
    let currentX = 0;
    let currentY = 0;
    let animationFrame = null;

    function animate() {
      currentX += (mouseX - currentX) * 0.12;
      currentY += (mouseY - currentY) * 0.12;

      glow.style.left = `${currentX}px`;
      glow.style.top = `${currentY}px`;

      animationFrame = requestAnimationFrame(animate);
    }

    document.addEventListener("mousemove", (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;

      if (!animationFrame) {
        currentX = mouseX;
        currentY = mouseY;
        animate();
      }
    }, { passive: true });

    document.addEventListener("mouseleave", () => {
      glow.style.opacity = "0";
    });

    document.addEventListener("mouseenter", () => {
      glow.style.opacity = "";
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      } else if (mouseX || mouseY) {
        animate();
      }
    });
  }

  /* ---------- Scroll Progress ---------- */

  function initScrollProgress() {
    const progress = document.createElement("div");

    progress.className = "scroll-progress";
    progress.setAttribute("aria-hidden", "true");

    Object.assign(progress.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "0%",
      height: "3px",
      background: "linear-gradient(90deg, #a8861b, #e5c158)",
      zIndex: "10001",
      pointerEvents: "none",
      transition: "width 0.08s linear"
    });

    document.body.appendChild(progress);

    let ticking = false;

    function updateProgress() {
      const scrollableHeight =
        document.documentElement.scrollHeight - window.innerHeight;

      const percentage =
        scrollableHeight > 0
          ? (window.scrollY / scrollableHeight) * 100
          : 0;

      progress.style.width = `${Math.min(100, Math.max(0, percentage))}%`;

      ticking = false;
    }

    window.addEventListener("scroll", () => {
      if (!ticking) {
        window.requestAnimationFrame(updateProgress);
        ticking = true;
      }
    }, { passive: true });

    window.addEventListener("resize", updateProgress);

    updateProgress();
  }

  /* ---------- Tilt Cards ---------- */

  function initCardTilt() {
    if (!supportsFinePointer || reducedMotion) return;

    const selector = ".menu-card, .branch-card";

    document.addEventListener("mousemove", (event) => {
      const card = event.target.closest(selector);

      if (!card) return;

      const rect = card.getBoundingClientRect();

      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;

      const rotateY = (x - 0.5) * 3;
      const rotateX = (0.5 - y) * 3;

      card.style.transform =
        `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    }, { passive: true });

    document.addEventListener("mouseout", (event) => {
      const card = event.target.closest(selector);

      if (!card) return;

      if (event.relatedTarget && card.contains(event.relatedTarget)) {
        return;
      }

      card.style.transform = "";
    });
  }

  /* ---------- Smooth Anchor Navigation ---------- */

  function initSmoothAnchors() {
    document.addEventListener("click", (event) => {
      const link = event.target.closest('a[href^="#"]');

      if (!link) return;

      const href = link.getAttribute("href");

      if (!href || href === "#") return;

      const target = document.querySelector(href);

      if (!target) return;

      event.preventDefault();

      target.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start"
      });

      if (history.replaceState) {
        history.replaceState(null, "", href);
      }
    });
  }

  /* ---------- Button Ripple ---------- */

  function initButtonRipple() {
    if (reducedMotion) return;

    document.addEventListener("click", (event) => {
      const button = event.target.closest(
        ".btn, .btn-primary, .btn-secondary, .menu-card-order, .branch-action"
      );

      if (!button) return;

      const rect = button.getBoundingClientRect();

      const ripple = document.createElement("span");

      const size = Math.max(rect.width, rect.height);

      Object.assign(ripple.style, {
        position: "absolute",
        width: `${size}px`,
        height: `${size}px`,
        left: `${event.clientX - rect.left - size / 2}px`,
        top: `${event.clientY - rect.top - size / 2}px`,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.22)",
        pointerEvents: "none",
        transform: "scale(0)",
        opacity: "1",
        transition: "transform 0.6s ease, opacity 0.6s ease"
      });

      if (getComputedStyle(button).position === "static") {
        button.style.position = "relative";
      }

      button.style.overflow = "hidden";
      button.appendChild(ripple);

      requestAnimationFrame(() => {
        ripple.style.transform = "scale(2.5)";
        ripple.style.opacity = "0";
      });

      window.setTimeout(() => ripple.remove(), 650);
    });
  }

  /* ---------- Initialize ---------- */

  function init() {
    if (reducedMotion) return;

    initCursorGlow();
    initScrollProgress();
    initCardTilt();
    initSmoothAnchors();
    initButtonRipple();

    console.log("Bardisi visual effects initialized.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true
    });
  } else {
    init();
  }

})();
