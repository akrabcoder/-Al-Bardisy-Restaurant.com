
/* ========================================
   AL BARDISI RESTAURANT
   Main Website Controller
   ======================================== */

(() => {
  "use strict";

  const CONFIG = {
    contentUrl: "./content.json",
    languageKey: "bardisi_lang",
    defaultLanguage: "ar",
    defaultPhone: "01002862600",
    defaultWhatsApp: "201002862600"
  };

  const state = {
    lang: CONFIG.defaultLanguage,
    data: null,
    activeCategory: "all"
  };

  const $ = (selector, parent = document) =>
    parent.querySelector(selector);

  const $$ = (selector, parent = document) =>
    [...parent.querySelectorAll(selector)];

  const t = (key) => {
    const dictionary = window.translations?.[state.lang] || {};
    return dictionary[key] || key;
  };

  /* ========================================
     SAFE HELPERS
     ======================================== */

  function textElement(tag, className, value) {
    const element = document.createElement(tag);

    if (className) element.className = className;
    element.textContent = value ?? "";

    return element;
  }

  function safeHttpUrl(value) {
    if (!value || typeof value !== "string") return "";

    try {
      const url = new URL(value.trim());

      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  function cleanPhone(value) {
    return String(value || "").replace(/[^\d+]/g, "");
  }

  function cleanWhatsApp(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function currentText(arValue, enValue) {
    if (state.lang === "en") {
      return enValue || arValue || "";
    }

    return arValue || enValue || "";
  }

  function createEmptyMessage(message) {
    const element = document.createElement("div");
    element.className = "empty-message";
    element.textContent = message;
    return element;
  }

  /* ========================================
     LANGUAGE
     ======================================== */

  function applyTranslations() {
    const dictionary = window.translations?.[state.lang];

    if (!dictionary) {
      console.error("Translation dictionary not found:", state.lang);
      return;
    }

    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";

    $$("[data-i18n]").forEach((element) => {
      const key = element.dataset.i18n;

      if (dictionary[key] !== undefined) {
        element.textContent = dictionary[key];
      }
    });

    const languageLabel = $("#languageLabel");

    if (languageLabel) {
      languageLabel.textContent = state.lang === "ar" ? "EN" : "عربي";
    }

    const languageButton = $("#languageSwitch");

    if (languageButton) {
      languageButton.setAttribute(
        "aria-label",
        state.lang === "ar" ? "Switch to English" : "التبديل إلى العربية"
      );
    }

    renderMenu();
    renderBranches();
    updateContact();

    if (state.data) {
      updateDynamicContent();
    }
  }

  function setLanguage(language) {
    if (!["ar", "en"].includes(language)) return;

    state.lang = language;

    try {
      localStorage.setItem(CONFIG.languageKey, language);
    } catch (error) {
      console.warn("Language preference could not be saved.", error);
    }

    applyTranslations();
  }

  function initLanguage() {
    let savedLanguage = CONFIG.defaultLanguage;

    try {
      const stored = localStorage.getItem(CONFIG.languageKey);

      if (stored === "ar" || stored === "en") {
        savedLanguage = stored;
      }
    } catch (error) {
      console.warn("Language preference unavailable.", error);
    }

    state.lang = savedLanguage;

    $("#languageSwitch")?.addEventListener("click", () => {
      setLanguage(state.lang === "ar" ? "en" : "ar");
    });

    applyTranslations();
  }

  /* ========================================
     CONTENT DATA
     ======================================== */

  async function loadContent() {
    try {
      const response = await fetch(CONFIG.contentUrl, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`Content request failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data || typeof data !== "object") {
        throw new Error("Invalid content data.");
      }

      state.data = data;

      if (!Array.isArray(state.data.menu)) {
        state.data.menu = [];
      }

      if (!Array.isArray(state.data.branches)) {
        state.data.branches = [];
      }

      if (!state.data.contact || typeof state.data.contact !== "object") {
        state.data.contact = {};
      }

      if (!state.data.content || typeof state.data.content !== "object") {
        state.data.content = {};
      }

      updateDynamicContent();
      updateContact();
      renderMenu();
      renderBranches();

    } catch (error) {
      console.error("Website content error:", error);

      state.data = {
        menu: [],
        branches: [],
        contact: {},
        content: {}
      };

      renderMenu(t("menuLoadError"));
      renderBranches(t("branchesLoadError"));
      updateContact();
    }
  }

  function updateDynamicContent() {
    if (!state.data?.content) return;

    const content = state.data.content;

    const heroTitle = state.lang === "ar"
      ? content.heroTitleAr
      : content.heroTitleEn;

    const heroDescription = state.lang === "ar"
      ? content.heroDescriptionAr
      : content.heroDescriptionEn;

    const aboutText = state.lang === "ar"
      ? content.aboutTextAr
      : content.aboutTextEn;

    if (heroTitle) {
      const first = $("[data-i18n='heroTitleFirst']");
      const second = $("[data-i18n='heroTitleSecond']");

      if (first && second) {
        const words = heroTitle.trim().split(/\s+/);

        if (words.length > 1) {
          first.textContent = words.slice(0, -1).join(" ");
          second.textContent = words[words.length - 1];
        } else {
          first.textContent = heroTitle;
          second.textContent = "";
        }
      }
    }

    if (heroDescription) {
      const element = $("[data-i18n='heroDescription']");
      if (element) element.textContent = heroDescription;
    }

    if (aboutText) {
      const element = $("[data-i18n='aboutText']");
      if (element) element.textContent = aboutText;
    }
  }

  /* ========================================
     MENU FILTERS
     ======================================== */

  function getCategories() {
    const categories = new Set();

    state.data.menu.forEach((item) => {
      if (item.active === false || !item.category) return;
      categories.add(String(item.category).trim());
    });

    return [...categories].filter(Boolean);
  }

  function renderMenuFilters() {
    const container = $("#menuFilters");
    if (!container) return;

    container.replaceChildren();

    const allButton = textElement("button", "menu-filter", t("allItems"));
    allButton.type = "button";
    allButton.dataset.category = "all";

    if (state.activeCategory === "all") {
      allButton.classList.add("active");
    }

    allButton.addEventListener("click", () => {
      state.activeCategory = "all";
      renderMenu();
    });

    container.appendChild(allButton);

    getCategories().forEach((category) => {
      const button = textElement("button", "menu-filter", category);
      button.type = "button";
      button.dataset.category = category;

      if (state.activeCategory === category) {
        button.classList.add("active");
      }

      button.addEventListener("click", () => {
        state.activeCategory = category;
        renderMenu();
      });

      container.appendChild(button);
    });
  }

  /* ========================================
     MENU CARDS
     ======================================== */

  function createMenuCard(item) {
    const card = document.createElement("article");
    card.className = "menu-card reveal";

    const imageUrl = safeHttpUrl(item.image);

    if (imageUrl) {
      const imageWrap = document.createElement("div");
      imageWrap.className = "menu-card-image";

      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = currentText(item.nameAr, item.nameEn);
      image.loading = "lazy";
      image.onerror = () => {
        imageWrap.classList.add("image-unavailable");
        image.remove();
      };

      imageWrap.appendChild(image);
      card.appendChild(imageWrap);
    }

    const content = document.createElement("div");
    content.className = "menu-card-content";

    const title = textElement(
      "h3",
      "menu-card-title",
      currentText(item.nameAr, item.nameEn) || "—"
    );

    const descriptionText = currentText(
      item.descriptionAr,
      item.descriptionEn
    );

    const description = textElement(
      "p",
      "menu-card-description",
      descriptionText
    );

    content.append(title);

    if (descriptionText) {
      content.appendChild(description);
    }

    const bottom = document.createElement("div");
    bottom.className = "menu-card-bottom";

    const price = textElement(
      "strong",
      "menu-card-price",
      item.price !== undefined && item.price !== ""
        ? `${item.price} ${t("currency")}`
        : ""
    );

    const order = textElement(
      "a",
      "menu-card-order",
      t("orderItem")
    );

    const whatsapp = cleanWhatsApp(
      state.data?.contact?.whatsapp || CONFIG.defaultWhatsApp
    );

    if (whatsapp) {
      const message = `${t("whatsappMessage")} ${currentText(
        item.nameAr,
        item.nameEn
      )}`;

      order.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
      order.target = "_blank";
      order.rel = "noopener noreferrer";
    } else {
      order.href = "#contact";
    }

    bottom.append(price, order);
    content.appendChild(bottom);
    card.appendChild(content);

    return card;
  }

  function renderMenu(errorMessage = "") {
    const container = $("#menuGrid");
    if (!container) return;

    container.replaceChildren();

    if (!state.data) {
      container.appendChild(
        createEmptyMessage(t("loadingMenu"))
      );
      return;
    }

    renderMenuFilters();

    const availableItems = state.data.menu.filter(
      (item) => item && item.active !== false
    );

    const filteredItems = state.activeCategory === "all"
      ? availableItems
      : availableItems.filter(
          (item) => String(item.category || "").trim() === state.activeCategory
        );

    if (errorMessage) {
      container.appendChild(createEmptyMessage(errorMessage));
      return;
    }

    if (!filteredItems.length) {
      container.appendChild(createEmptyMessage(
        availableItems.length ? t("noMenu") : t("noMenu")
      ));
      return;
    }

    filteredItems.forEach((item) => {
      container.appendChild(createMenuCard(item));
    });

    observeReveals();
  }

  /* ========================================
     BRANCHES
     ======================================== */

  function createBranchCard(branch, index) {
    const card = document.createElement("article");
    card.className = "branch-card reveal";

    const number = textElement(
      "span",
      "branch-number",
      String(index + 1).padStart(2, "0")
    );

    const name = textElement(
      "h3",
      "branch-name",
      currentText(branch.nameAr, branch.nameEn) || "—"
    );

    const addressText = currentText(
      branch.addressAr,
      branch.addressEn
    );

    const address = textElement(
      "p",
      "branch-address",
      addressText || "—"
    );

    const content = document.createElement("div");
    content.className = "branch-content";

    content.append(number, name, address);

    const actions = document.createElement("div");
    actions.className = "branch-actions";

    const phone = cleanPhone(branch.phone);

    if (phone) {
      const call = textElement("a", "branch-action", t("callBranch"));
      call.href = `tel:${phone}`;
      actions.appendChild(call);
    }

    const mapUrl = safeHttpUrl(branch.map);

    if (mapUrl) {
      const map = textElement("a", "branch-action", t("viewMap"));
      map.href = mapUrl;
      map.target = "_blank";
      map.rel = "noopener noreferrer";
      actions.appendChild(map);
    }

    card.append(content);

    if (actions.childElementCount) {
      card.appendChild(actions);
    }

    return card;
  }

  function renderBranches(errorMessage = "") {
    const container = $("#branchesGrid");
    if (!container) return;

    container.replaceChildren();

    if (!state.data) {
      container.appendChild(
        createEmptyMessage(t("loadingBranches"))
      );
      return;
    }

    if (errorMessage) {
      container.appendChild(createEmptyMessage(errorMessage));
      return;
    }

    const branches = state.data.branches.filter(
      (branch) => branch && branch.active !== false
    );

    if (!branches.length) {
      container.appendChild(createEmptyMessage(t("noBranches")));
      return;
    }

    branches.forEach((branch, index) => {
      container.appendChild(createBranchCard(branch, index));
    });

    observeReveals();
  }

  /* ========================================
     CONTACT DETAILS
     ======================================== */

  function updateContact() {
    const contact = state.data?.contact || {};

    const phone = cleanPhone(contact.phone || CONFIG.defaultPhone);
    const whatsapp = cleanWhatsApp(
      contact.whatsapp || CONFIG.defaultWhatsApp
    );

    const phoneLink = $("#contactPhone");

    if (phoneLink) {
      phoneLink.textContent = contact.phone || CONFIG.defaultPhone;
      phoneLink.href = phone ? `tel:${phone}` : "#";
    }

    const whatsappLink = $("#contactWhatsApp");
    const mainWhatsApp = $("#contactMainWhatsApp");

    if (whatsappLink) {
      whatsappLink.textContent = t("sendMessage");
      whatsappLink.href = whatsapp
        ? `https://wa.me/${whatsapp}`
        : "#";
    }

    if (mainWhatsApp) {
      mainWhatsApp.href = whatsapp
        ? `https://wa.me/${whatsapp}`
        : "#";
    }

    const socialContainer = $("#socialLinks");

    if (socialContainer) {
      $$("a[data-social]", socialContainer).forEach((link) => {
        const key = link.dataset.social;
        const url = safeHttpUrl(contact[key]);

        if (url) {
          link.href = url;
          link.hidden = false;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        } else {
          link.hidden = true;
          link.removeAttribute("href");
        }
      });
    }
  }

  /* ========================================
     HEADER & MOBILE NAVIGATION
     ======================================== */

  function closeMobileMenu() {
    const nav = $("#mainNav");
    const toggle = $("#menuToggle");

    nav?.classList.remove("open");
    toggle?.classList.remove("active");
    toggle?.setAttribute("aria-expanded", "false");
  }

  function initNavigation() {
    const toggle = $("#menuToggle");
    const nav = $("#mainNav");

    toggle?.addEventListener("click", () => {
      const isOpen = nav?.classList.toggle("open");

      toggle.classList.toggle("active", Boolean(isOpen));
      toggle.setAttribute("aria-expanded", String(Boolean(isOpen)));
    });

    $$(".nav-link").forEach((link) => {
      link.addEventListener("click", closeMobileMenu);
    });

    document.addEventListener("click", (event) => {
      if (
        nav?.classList.contains("open") &&
        !nav.contains(event.target) &&
        !toggle?.contains(event.target)
      ) {
        closeMobileMenu();
      }
    });
  }

  function initHeaderScroll() {
    const header = $("#header");
    const backToTop = $("#backToTop");

    const update = () => {
      const scrolled = window.scrollY > 35;

      header?.classList.toggle("scrolled", scrolled);
      backToTop?.classList.toggle("visible", window.scrollY > 450);
    };

    window.addEventListener("scroll", update, { passive: true });
    update();

    backToTop?.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function initActiveNavigation() {
    const sections = $$("main section[id]");

    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        $$(".nav-link").forEach((link) => {
          link.classList.toggle(
            "active",
            link.getAttribute("href") === `#${entry.target.id}`
          );
        });
      });
    }, {
      rootMargin: "-35% 0px -55% 0px"
    });

    sections.forEach((section) => observer.observe(section));
  }

  /* ========================================
     REVEAL ANIMATIONS
     ======================================== */

  let revealObserver = null;

  function observeReveals() {
    const elements = $$(".reveal:not(.visible)");

    if (!elements.length) return;

    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("visible"));
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.08,
        rootMargin: "0px 0px -35px 0px"
      });
    }

    elements.forEach((element) => revealObserver.observe(element));
  }

  /* ========================================
     PRELOADER
     ======================================== */

  function hidePreloader() {
    const preloader = $("#preloader");
    if (!preloader) return;

    preloader.classList.add("loaded");

    setTimeout(() => {
      preloader.hidden = true;
    }, 650);
  }

  function initPreloader() {
    if (document.readyState === "complete") {
      hidePreloader();
    } else {
      window.addEventListener("load", hidePreloader, { once: true });

      setTimeout(hidePreloader, 3500);
    }
  }

  /* ========================================
     FOOTER
     ======================================== */

  function initFooter() {
    const year = $("#currentYear");

    if (year) {
      year.textContent = new Date().getFullYear();
    }
  }

  /* ========================================
     START
     ======================================== */

  async function init() {
    initLanguage();
    initNavigation();
    initHeaderScroll();
    initActiveNavigation();
    initFooter();
    initPreloader();

    observeReveals();

    await loadContent();
    observeReveals();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

})();
