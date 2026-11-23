
/* ========================================
   AL BARDISI RESTAURANT
   Main JavaScript
   ======================================== */

(function () {
  "use strict";

  /* ========================================
     1. CONFIGURATION & STATE
     ======================================== */

  const CONFIG = {
    contentUrl: "./content.json",
    languageKey: "bardisi_lang",
    defaultLanguage: "ar",
    whatsappMessage: "مرحبًا، أريد الاستفسار عن طلب من مطعم البرديسي."
  };

  let siteData = null;
  let currentLanguage =
    localStorage.getItem(CONFIG.languageKey) || CONFIG.defaultLanguage;

  if (!["ar", "en"].includes(currentLanguage)) {
    currentLanguage = CONFIG.defaultLanguage;
  }

  const $ = (selector, parent = document) =>
    parent.querySelector(selector);

  const $$ = (selector, parent = document) =>
    [...parent.querySelectorAll(selector)];

  const translations = window.translations || {};

  /* ========================================
     2. HELPERS
     ======================================== */

  function t(key) {
    return (
      translations[currentLanguage]?.[key] ||
      translations.ar?.[key] ||
      key
    );
  }

  function getLocalizedValue(arValue, enValue) {
    if (currentLanguage === "en") {
      return enValue || arValue || "";
    }

    return arValue || enValue || "";
  }

  function cleanPhone(value) {
    return String(value || "").replace(/[^\d+]/g, "");
  }

  function normalizeWhatsApp(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function safeExternalUrl(value) {
    if (!value) return "";

    try {
      const url = new URL(value, window.location.href);

      if (!["http:", "https:"].includes(url.protocol)) {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
      element.className = className;
    }

    if (text !== undefined && text !== null) {
      element.textContent = String(text);
    }

    return element;
  }

  function createLink(text, href, className, targetBlank = false) {
    const link = createElement("a", className, text);

    link.href = href;

    if (targetBlank) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }

    return link;
  }

  function createImage(src, alt, className) {
    const image = createElement("img", className);

    image.alt = alt || "";
    image.loading = "lazy";
    image.decoding = "async";

    const safeUrl = safeExternalUrl(src);

    if (safeUrl) {
      image.src = safeUrl;
    }

    return image;
  }

  function showToast(message) {
    let toast = $("#bardisiToast");

    if (!toast) {
      toast = createElement("div", "bardisi-toast");
      toast.id = "bardisiToast";
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("show");

    window.clearTimeout(showToast.timeout);

    showToast.timeout = window.setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  /* ========================================
     3. LANGUAGE SYSTEM
     ======================================== */

  function applyLanguage() {
    document.documentElement.lang = currentLanguage;
    document.documentElement.dir =
      currentLanguage === "ar" ? "rtl" : "ltr";

    $$("[data-i18n]").forEach((element) => {
      const key = element.dataset.i18n;
      const translation = t(key);

      if (translation) {
        element.textContent = translation;
      }
    });

    const languageLabel = $("#languageLabel");

    if (languageLabel) {
      languageLabel.textContent =
        currentLanguage === "ar" ? "EN" : "عربي";
    }

    const languageButton = $("#languageSwitch");

    if (languageButton) {
      languageButton.setAttribute(
        "aria-label",
        currentLanguage === "ar"
          ? "Switch to English"
          : "التغيير إلى العربية"
      );
    }

    localStorage.setItem(CONFIG.languageKey, currentLanguage);

    renderMenu();
    renderBranches();
    updateContactInformation();
  }

  function toggleLanguage() {
    currentLanguage = currentLanguage === "ar" ? "en" : "ar";
    applyLanguage();
  }

  /* ========================================
     4. CONTENT LOADING
     ======================================== */

  async function loadContent() {
    try {
      const response = await fetch(CONFIG.contentUrl, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();

      if (!data || typeof data !== "object") {
        throw new Error("Invalid content format");
      }

      siteData = data;

      renderMenu();
      renderBranches();
      updateContactInformation();
      updateDynamicContent();

    } catch (error) {
      console.error("Bardisi content loading error:", error);

      siteData = {
        menu: [],
        branches: [],
        contact: {},
        content: {}
      };

      renderMenu();
      renderBranches();
      updateContactInformation();

      showToast(t("error"));
    }
  }

  /* ========================================
     5. DYNAMIC CONTENT
     ======================================== */

  function updateDynamicContent() {
    if (!siteData?.content) return;

    const content = siteData.content;

    const heroDescription = getLocalizedValue(
      content.heroDescriptionAr,
      content.heroDescriptionEn
    );

    const aboutText = getLocalizedValue(
      content.aboutTextAr,
      content.aboutTextEn
    );

    const heroElement = $('[data-i18n="heroDescription"]');

    if (heroElement && heroDescription) {
      heroElement.textContent = heroDescription;
    }

    const aboutElement = $('[data-i18n="aboutText"]');

    if (aboutElement && aboutText) {
      aboutElement.textContent = aboutText;
    }

    const heroTitle = getLocalizedValue(
      content.heroTitleAr,
      content.heroTitleEn
    );

    const firstTitle = $('[data-i18n="heroTitleFirst"]');
    const secondTitle = $('[data-i18n="heroTitleSecond"]');

    if (heroTitle && firstTitle && secondTitle) {
      firstTitle.textContent = heroTitle;
      secondTitle.textContent = "";
    }
  }

  /* ========================================
     6. MENU RENDERING
     ======================================== */

  function getMenuItems() {
    if (!Array.isArray(siteData?.menu)) return [];

    return siteData.menu.filter((item) => {
      return item && item.active !== false;
    });
  }

  function getMenuCategories(items) {
    return [
      ...new Set(
        items
          .map((item) => item.category)
          .filter((category) => {
            return typeof category === "string" && category.trim();
          })
      )
    ];
  }

  function renderMenuFilters(items) {
    const container = $("#menuFilters");

    if (!container) return;

    container.replaceChildren();

    const allButton = createElement(
      "button",
      "menu-filter active",
      t("allItems")
    );

    allButton.type = "button";
    allButton.dataset.category = "all";

    allButton.addEventListener("click", () => {
      filterMenu("all");
    });

    container.appendChild(allButton);

    getMenuCategories(items).forEach((category) => {
      const button = createElement(
        "button",
        "menu-filter",
        category
      );

      button.type = "button";
      button.dataset.category = category;

      button.addEventListener("click", () => {
        filterMenu(category);
      });

      container.appendChild(button);
    });
  }

  function filterMenu(category) {
    const buttons = $$(".menu-filter");

    buttons.forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.category === category
      );
    });

    $$(".menu-card").forEach((card) => {
      const matches =
        category === "all" ||
        card.dataset.category === category;

      card.hidden = !matches;
    });
  }

  function createMenuCard(item) {
    const card = createElement("article", "menu-card");

    card.dataset.category = item.category || "";

    const imageWrapper = createElement(
      "div",
      "menu-card-image"
    );

    if (item.image) {
      const image = createImage(
        item.image,
        getLocalizedValue(item.nameAr, item.nameEn),
        ""
      );

      imageWrapper.appendChild(image);
    }

    const content = createElement(
      "div",
      "menu-card-content"
    );

    const title = createElement(
      "h3",
      "menu-card-title",
      getLocalizedValue(item.nameAr, item.nameEn) ||
        "Al Bardisi"
    );

    const descriptionText = getLocalizedValue(
      item.descriptionAr,
      item.descriptionEn
    );

    const description = createElement(
      "p",
      "menu-card-description",
      descriptionText
    );

    const bottom = createElement(
      "div",
      "menu-card-bottom"
    );

    const price = createElement(
      "span",
      "menu-card-price"
    );

    if (item.price !== undefined && item.price !== null && item.price !== "") {
      price.textContent =
        `${item.price} ${siteData?.settings?.[
          currentLanguage === "ar" ? "currencyAr" : "currencyEn"
        ] || t("currency")}`;
    } else {
      price.textContent = t("unavailable");
    }

    const orderButton = createElement(
      "a",
      "menu-card-order",
      t("orderItem")
    );

    const whatsapp = normalizeWhatsApp(
      siteData?.contact?.whatsapp
    );

    if (whatsapp) {
      const message = `مرحبًا، أريد طلب: ${
        getLocalizedValue(item.nameAr, item.nameEn)
      }`;

      orderButton.href =
        `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;

      orderButton.target = "_blank";
      orderButton.rel = "noopener noreferrer";
    } else {
      orderButton.href = "#contact";
    }

    bottom.append(price, orderButton);
    content.append(title);

    if (descriptionText) {
      content.appendChild(description);
    }

    content.appendChild(bottom);

    card.append(imageWrapper, content);

    return card;
  }

  function renderMenu() {
    const container = $("#menuGrid");

    if (!container) return;

    const items = getMenuItems();

    renderMenuFilters(items);

    container.replaceChildren();

    if (!items.length) {
      const emptyState = createElement(
        "div",
        "menu-empty-state"
      );

      emptyState.appendChild(
        createElement("h3", "", t("noMenu"))
      );

      emptyState.appendChild(
        createElement("p", "", t("noMenuDescription"))
      );

      container.appendChild(emptyState);

      return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach((item) => {
      fragment.appendChild(createMenuCard(item));
    });

    container.appendChild(fragment);
    revealNewElements(container);
  }

  /* ========================================
     7. BRANCHES RENDERING
     ======================================== */

  function getBranches() {
    if (!Array.isArray(siteData?.branches)) return [];

    return siteData.branches.filter((branch) => {
      return branch && branch.active !== false;
    });
  }

  function createBranchCard(branch, index) {
    const card = createElement("article", "branch-card");

    const number = createElement(
      "span",
      "branch-number",
      String(index + 1).padStart(2, "0")
    );

    const name = createElement(
      "h3",
      "branch-name",
      getLocalizedValue(branch.nameAr, branch.nameEn) ||
        branch.name ||
        `${t("branchesTitle")} ${index + 1}`
    );

    const addressText = getLocalizedValue(
      branch.addressAr,
      branch.addressEn
    ) || branch.address || "";

    const address = createElement(
      "p",
      "branch-address",
      addressText
    );

    const actions = createElement(
      "div",
      "branch-actions"
    );

    const phone = cleanPhone(branch.phone);

    if (phone) {
      actions.appendChild(
        createLink(
          t("callBranch"),
          `tel:${phone}`,
          "branch-action"
        )
      );
    }

    const mapUrl = safeExternalUrl(branch.map);

    if (mapUrl) {
      actions.appendChild(
        createLink(
          t("viewMap"),
          mapUrl,
          "branch-action",
          true
        )
      );
    }

    card.append(number, name);

    if (addressText) {
      card.appendChild(address);
    }

    if (actions.children.length) {
      card.appendChild(actions);
    }

    return card;
  }

  function renderBranches() {
    const container = $("#branchesGrid");

    if (!container) return;

    const branches = getBranches();

    container.replaceChildren();

    if (!branches.length) {
      const emptyState = createElement(
        "div",
        "branches-empty-state"
      );

      emptyState.appendChild(
        createElement("h3", "", t("noBranches"))
      );

      emptyState.appendChild(
        createElement("p", "", t("noBranchesDescription"))
      );

      container.appendChild(emptyState);

      return;
    }

    const fragment = document.createDocumentFragment();

    branches.forEach((branch, index) => {
      fragment.appendChild(
        createBranchCard(branch, index)
      );
    });

    container.appendChild(fragment);
    revealNewElements(container);
  }

  /* ========================================
     8. CONTACT INFORMATION
     ======================================== */

  function updateContactInformation() {
    const contact = siteData?.contact || {};

    const phone = cleanPhone(contact.phone);
    const whatsapp = normalizeWhatsApp(contact.whatsapp);

    const phoneElement = $("#contactPhone");

    if (phoneElement && phone) {
      phoneElement.href = `tel:${phone}`;
    }

    const whatsappElement = $("#contactWhatsApp");

    if (whatsappElement && whatsapp) {
      const message = encodeURIComponent(
        CONFIG.whatsappMessage
      );

      whatsappElement.href =
        `https://wa.me/${whatsapp}?text=${message}`;

      whatsappElement.target = "_blank";
      whatsappElement.rel = "noopener noreferrer";
    }

    const socialContainer = $("#socialLinks");

    if (socialContainer) {
      $$("a[data-social]", socialContainer).forEach((link) => {
        const platform = link.dataset.social;
        const url = safeExternalUrl(contact[platform]);

        if (url) {
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.hidden = false;
        } else {
          link.hidden = true;
        }
      });
    }
  }

  /* ========================================
     9. MOBILE NAVIGATION
     ======================================== */

  function initMobileNavigation() {
    const toggle = $("#menuToggle");
    const nav = $("#mainNav");

    if (!toggle || !nav) return;

    function closeMenu() {
      nav.classList.remove("open");
      toggle.classList.remove("active");

      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");

      toggle.classList.toggle("active", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    $$(".main-nav a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("click", (event) => {
      if (
        !nav.contains(event.target) &&
        !toggle.contains(event.target)
      ) {
        closeMenu();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });
  }

  /* ========================================
     10. HEADER SCROLL EFFECT
     ======================================== */

  function initHeaderScroll() {
    const header = $("#header");

    if (!header) return;

    function updateHeader() {
      header.classList.toggle(
        "scrolled",
        window.scrollY > 40
      );
    }

    window.addEventListener("scroll", updateHeader, {
      passive: true
    });

    updateHeader();
  }

  /* ========================================
     11. ACTIVE NAVIGATION
     ======================================== */

  function initActiveNavigation() {
    const sections = $$("main section[id]");
    const navLinks = $$(".main-nav a[href^='#']");

    if (!sections.length || !navLinks.length) return;

    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          navLinks.forEach((link) => {
            link.classList.toggle(
              "active",
              link.getAttribute("href") === `#${entry.target.id}`
            );
          });
        });
      },
      {
        rootMargin: "-35% 0px -55% 0px"
      }
    );

    sections.forEach((section) => {
      observer.observe(section);
    });
  }

  /* ========================================
     12. REVEAL ANIMATIONS
     ======================================== */

  let revealObserver = null;

  function initRevealAnimations() {
    const elements = $$(".reveal");

    if (!elements.length) return;

    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => {
        element.classList.add("visible");
      });

      return;
    }

    revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12
      }
    );

    elements.forEach((element) => {
      revealObserver.observe(element);
    });
  }

  function revealNewElements(container) {
    if (!container) return;

    const elements = $$(".reveal", container);

    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => {
        element.classList.add("visible");
      });

      return;
    }

    elements.forEach((element) => {
      if (revealObserver) {
        revealObserver.observe(element);
      } else {
        element.classList.add("visible");
      }
    });
  }

  /* ========================================
     13. BACK TO TOP
     ======================================== */

  function initBackToTop() {
    const button = $("#backToTop");

    if (!button) return;

    window.addEventListener(
      "scroll",
      () => {
        button.classList.toggle(
          "visible",
          window.scrollY > 400
        );
      },
      { passive: true }
    );

    button.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });
  }

  /* ========================================
     14. PRELOADER
     ======================================== */

  function hidePreloader() {
    const preloader = $("#preloader");

    if (!preloader) return;

    preloader.classList.add("loaded");

    window.setTimeout(() => {
      preloader.remove();
    }, 800);
  }

  function initPreloader() {
    if (document.readyState === "complete") {
      hidePreloader();
    } else {
      window.addEventListener("load", hidePreloader, {
        once: true
      });
    }

    window.setTimeout(hidePreloader, 4000);
  }

  /* ========================================
     15. FOOTER YEAR
     ======================================== */

  function updateFooterYear() {
    const year = $("#currentYear");

    if (year) {
      year.textContent = new Date().getFullYear();
    }
  }

  /* ========================================
     16. LANGUAGE BUTTON
     ======================================== */

  function initLanguageSwitch() {
    const button = $("#languageSwitch");

    if (!button) return;

    button.addEventListener("click", toggleLanguage);
  }

  /* ========================================
     17. GLOBAL LINK SAFETY
     ======================================== */

  function initExternalLinks() {
    $$('a[target="_blank"]').forEach((link) => {
      link.rel = "noopener noreferrer";
    });
  }

  /* ========================================
     18. INITIALIZATION
     ======================================== */

  async function init() {
    applyLanguage();

    initPreloader();
    initMobileNavigation();
    initHeaderScroll();
    initActiveNavigation();
    initRevealAnimations();
    initBackToTop();
    initLanguageSwitch();
    updateFooterYear();
    initExternalLinks();

    await loadContent();

    updateDynamicContent();
    applyLanguage();
    initExternalLinks();

    console.log(
      "%c AL BARDISI RESTAURANT ",
      "background:#c9a227;color:#17130f;padding:8px 14px;font-weight:bold;"
    );

    console.log("Website initialized successfully.");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true
    });
  } else {
    init();
  }

})();
