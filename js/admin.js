
/* ========================================
   AL BARDISI RESTAURANT
   Admin Control Center
   Cloudflare Worker + GitHub API
   ======================================== */

(() => {
  "use strict";

  const CONFIG = {
    workerUrlKey: "bardisi_admin_worker_url",
    tokenKey: "bardisi_admin_token",
    defaultWorkerUrl: "",
    tokenExpiryKey: "bardisi_admin_token_expiry"
  };

  const state = {
    data: null,
    editingProductId: null,
    editingBranchId: null,
    busy: false
  };

  const $ = (selector, parent = document) =>
    parent.querySelector(selector);

  const $$ = (selector, parent = document) =>
    [...parent.querySelectorAll(selector)];

  const getWorkerUrl = () =>
    (localStorage.getItem(CONFIG.workerUrlKey) ||
      CONFIG.defaultWorkerUrl).trim().replace(/\/+$/, "");

  const getToken = () =>
    localStorage.getItem(CONFIG.tokenKey);

  function setConnection(status, label) {
    const element = $("#connectionStatus");
    const overview = $("#overviewConnection");

    if (element) {
      element.classList.remove("connected", "error");
      if (status === "connected") element.classList.add("connected");
      if (status === "error") element.classList.add("error");

      element.innerHTML = "";
      const dot = document.createElement("i");
      element.append(dot, document.createTextNode(label));
    }

    if (overview) {
      overview.textContent = label;
      overview.style.color =
        status === "connected" ? "var(--success)" :
        status === "error" ? "var(--danger)" : "var(--muted)";
    }
  }

  function toast(message, duration = 3000) {
    const element = $("#toast");
    if (!element) return;

    element.textContent = message;
    element.classList.add("show");

    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      element.classList.remove("show");
    }, duration);
  }

  function makeId(prefix = "item") {
    if (window.crypto?.randomUUID) {
      return `${prefix}_${crypto.randomUUID()}`;
    }

    return `${prefix}_${Date.now()}_${Math.random()
      .toString(36).slice(2, 8)}`;
  }

  function showLogin(message = "") {
    $("#loginScreen").hidden = false;
    $("#dashboard").hidden = true;

    const messageElement = $("#loginMessage");
    if (messageElement) messageElement.textContent = message;
  }

  function showDashboard() {
    $("#loginScreen").hidden = true;
    $("#dashboard").hidden = false;
  }

  function clearSession() {
    localStorage.removeItem(CONFIG.tokenKey);
    localStorage.removeItem(CONFIG.tokenExpiryKey);
  }

  function saveSession(token, expiresIn) {
    localStorage.setItem(CONFIG.tokenKey, token);

    const expiry = Date.now() + (Number(expiresIn) || 3600) * 1000;
    localStorage.setItem(CONFIG.tokenExpiryKey, String(expiry));
  }

  function sessionIsExpired() {
    const expiry = Number(
      localStorage.getItem(CONFIG.tokenExpiryKey) || 0
    );

    return expiry > 0 && Date.now() >= expiry;
  }

  /* ========================================
     API CLIENT
     ======================================== */

  async function api(path, options = {}) {
    const baseUrl = getWorkerUrl();

    if (!baseUrl) {
      throw new Error("أدخل رابط Cloudflare Worker من الإعدادات أولًا.");
    }

    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    if (options.auth !== false) {
      const token = getToken();

      if (!token) {
        throw new Error("انتهت جلسة الإدارة. سجّل الدخول مرة أخرى.");
      }

      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store"
    });

    let result = {};

    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (response.status === 401 || response.status === 403) {
      clearSession();
      showLogin("انتهت صلاحية الجلسة أو بيانات الدخول غير صالحة.");
      throw new Error("انتهت جلسة الإدارة. سجّل الدخول مرة أخرى.");
    }

    if (!response.ok || result.success === false) {
      throw new Error(
        result.error || result.message || `خطأ في الاتصال (${response.status})`
      );
    }

    return result;
  }

  async function login(password) {
    const result = await api("/api/login", {
      method: "POST",
      auth: false,
      body: { password }
    });

    if (!result.token) {
      throw new Error("الخادم لم يُرجع رمز الدخول.");
    }

    saveSession(result.token, result.expiresIn);
    return result;
  }

  async function logout() {
    try {
      if (getToken()) {
        await api("/api/logout", { method: "POST" });
      }
    } catch (error) {
      console.warn("Logout request:", error.message);
    }

    clearSession();
    state.data = null;
    showLogin();
    setConnection("offline", "غير متصل");
    toast("تم تسجيل الخروج");
  }

  async function fetchContent() {
    const result = await api("/api/content");

    if (!result.data || typeof result.data !== "object") {
      throw new Error("صيغة بيانات الموقع غير صحيحة.");
    }

    state.data = result.data;
    normalizeData();
    renderAll();
    setConnection("connected", "متصل");
  }

  async function saveContent(successMessage = "تم حفظ التغييرات بنجاح") {
    if (state.busy) return;

    state.busy = true;

    try {
      const result = await api("/api/content", {
        method: "PUT",
        body: { data: state.data }
      });

      if (result.data && typeof result.data === "object") {
        state.data = result.data;
      }

      normalizeData();
      renderAll();
      setConnection("connected", "متصل");
      toast(successMessage);

    } catch (error) {
      console.error(error);
      toast(error.message || "تعذر حفظ البيانات", 4500);

      if (!getToken()) {
        showLogin("سجّل الدخول مرة أخرى.");
      }
    } finally {
      state.busy = false;
    }
  }

  /* ========================================
     DATA NORMALIZATION
     ======================================== */

  function normalizeData() {
    if (!state.data) state.data = {};

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

    if (!state.data.settings || typeof state.data.settings !== "object") {
      state.data.settings = {};
    }
  }

  /* ========================================
     NAVIGATION
     ======================================== */

  const sectionTitles = {
    overview: "نظرة عامة",
    menu: "قائمة الطعام",
    branches: "الفروع",
    contact: "بيانات التواصل",
    content: "محتوى الموقع",
    settings: "الإعدادات"
  };

  function openSection(name) {
    const section = $(`#section-${name}`);
    if (!section) return;

    $$(".dashboard-section").forEach((item) => {
      item.classList.toggle("active", item === section);
    });

    $$(".nav-item[data-section]").forEach((item) => {
      item.classList.toggle(
        "active",
        item.dataset.section === name
      );
    });

    $("#pageTitle").textContent = sectionTitles[name] || "الإدارة";
    $("#sidebar").classList.remove("open");
  }

  function initNavigation() {
    $$(".nav-item[data-section]").forEach((button) => {
      button.addEventListener("click", () => {
        openSection(button.dataset.section);
      });
    });

    $$("[data-open-section]").forEach((button) => {
      button.addEventListener("click", () => {
        openSection(button.dataset.openSection);
      });
    });

    $("#mobileMenuButton")?.addEventListener("click", () => {
      $("#sidebar").classList.toggle("open");
    });

    document.addEventListener("click", (event) => {
      const sidebar = $("#sidebar");
      const menuButton = $("#mobileMenuButton");

      if (
        sidebar?.classList.contains("open") &&
        !sidebar.contains(event.target) &&
        !menuButton?.contains(event.target)
      ) {
        sidebar.classList.remove("open");
      }
    });
  }

  /* ========================================
     DASHBOARD
     ======================================== */

  function renderOverview() {
    $("#totalProducts").textContent = state.data.menu.length;
    $("#totalBranches").textContent = state.data.branches.length;
  }

  function renderAll() {
    renderOverview();
    renderProducts();
    renderBranches();
    fillContactForm();
    fillContentForm();
  }

  /* ========================================
     PRODUCTS
     ======================================== */

  function renderProducts() {
    const container = $("#productsTable");
    if (!container) return;

    container.replaceChildren();

    if (!state.data.menu.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 5;
      cell.className = "empty-cell";
      cell.textContent = "لا توجد أصناف حتى الآن. ابدأ بإضافة أول صنف.";

      row.appendChild(cell);
      container.appendChild(row);
      return;
    }

    state.data.menu.forEach((product) => {
      const row = document.createElement("tr");

      const productCell = document.createElement("td");
      const productInfo = document.createElement("div");
      productInfo.className = "product-cell";

      if (product.image) {
        try {
          const imageUrl = new URL(product.image);

          if (["http:", "https:"].includes(imageUrl.protocol)) {
            const image = document.createElement("img");
            image.className = "product-thumbnail";
            image.src = imageUrl.href;
            image.alt = "";
            image.loading = "lazy";
            productInfo.appendChild(image);
          }
        } catch {}
      }

      const name = document.createElement("strong");
      name.textContent = product.nameAr || product.nameEn || "صنف بدون اسم";
      productInfo.appendChild(name);
      productCell.appendChild(productInfo);

      const category = document.createElement("td");
      category.textContent = product.category || "—";

      const price = document.createElement("td");
      price.textContent =
        product.price !== undefined && product.price !== ""
          ? `${product.price} جنيه`
          : "—";

      const statusCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = `status-pill ${product.active === false ? "off" : "on"}`;
      status.textContent = product.active === false ? "مخفي" : "ظاهر";
      statusCell.appendChild(status);

      const actions = document.createElement("td");
      const actionWrap = document.createElement("div");
      actionWrap.className = "table-actions";

      const edit = document.createElement("button");
      edit.className = "table-action edit-action";
      edit.textContent = "تعديل";
      edit.type = "button";
      edit.addEventListener("click", () => openProductModal(product.id));

      const remove = document.createElement("button");
      remove.className = "table-action delete-action";
      remove.textContent = "حذف";
      remove.type = "button";
      remove.addEventListener("click", () => deleteProduct(product.id));

      actionWrap.append(edit, remove);
      actions.appendChild(actionWrap);

      row.append(productCell, category, price, statusCell, actions);
      container.appendChild(row);
    });
  }

  function openProductModal(id = null) {
    const product = id
      ? state.data.menu.find((item) => String(item.id) === String(id))
      : null;

    state.editingProductId = product?.id || null;

    $("#productModalTitle").textContent =
      product ? "تعديل بيانات الصنف" : "إضافة صنف جديد";

    $("#productId").value = product?.id || "";
    $("#productNameAr").value = product?.nameAr || "";
    $("#productNameEn").value = product?.nameEn || "";
    $("#productCategory").value = product?.category || "";
    $("#productPrice").value = product?.price ?? "";
    $("#productDescriptionAr").value = product?.descriptionAr || "";
    $("#productDescriptionEn").value = product?.descriptionEn || "";
    $("#productImage").value = product?.image || "";
    $("#productActive").checked = product?.active !== false;

    $("#productModal").hidden = false;
    $("#productNameAr").focus();
  }

  async function saveProduct(event) {
    event.preventDefault();

    const id = state.editingProductId || makeId("product");

    const product = {
      id,
      nameAr: $("#productNameAr").value.trim(),
      nameEn: $("#productNameEn").value.trim(),
      category: $("#productCategory").value.trim(),
      price: $("#productPrice").value === ""
        ? ""
        : Number($("#productPrice").value),
      descriptionAr: $("#productDescriptionAr").value.trim(),
      descriptionEn: $("#productDescriptionEn").value.trim(),
      image: $("#productImage").value.trim(),
      active: $("#productActive").checked
    };

    if (!product.nameAr) {
      toast("اكتب اسم الصنف بالعربية.");
      return;
    }

    const index = state.data.menu.findIndex(
      (item) => String(item.id) === String(id)
    );

    if (index >= 0) {
      state.data.menu[index] = product;
    } else {
      state.data.menu.push(product);
    }

    $("#productModal").hidden = true;
    await saveContent(index >= 0 ? "تم تعديل الصنف" : "تمت إضافة الصنف");
  }

  async function deleteProduct(id) {
    const product = state.data.menu.find(
      (item) => String(item.id) === String(id)
    );

    if (!product) return;

    if (!confirm(`هل تريد حذف "${product.nameAr || product.nameEn}"؟`)) {
      return;
    }

    state.data.menu = state.data.menu.filter(
      (item) => String(item.id) !== String(id)
    );

    await saveContent("تم حذف الصنف");
  }

  /* ========================================
     BRANCHES
     ======================================== */

  function renderBranches() {
    const container = $("#branchesList");
    if (!container) return;

    container.replaceChildren();

    if (!state.data.branches.length) {
      const empty = document.createElement("div");
      empty.className = "panel-card";
      empty.textContent = "لا توجد فروع مضافة حتى الآن.";
      container.appendChild(empty);
      return;
    }

    state.data.branches.forEach((branch) => {
      const card = document.createElement("article");
      card.className = "branch-admin-card";

      const details = document.createElement("div");

      const name = document.createElement("h3");
      name.textContent = branch.nameAr || branch.nameEn || "فرع بدون اسم";

      const address = document.createElement("p");
      address.textContent = branch.addressAr || branch.addressEn || "لا يوجد عنوان";

      details.append(name, address);

      const actions = document.createElement("div");
      actions.className = "table-actions";

      const edit = document.createElement("button");
      edit.className = "table-action edit-action";
      edit.textContent = "تعديل";
      edit.type = "button";
      edit.addEventListener("click", () => openBranchModal(branch.id));

      const remove = document.createElement("button");
      remove.className = "table-action delete-action";
      remove.textContent = "حذف";
      remove.type = "button";
      remove.addEventListener("click", () => deleteBranch(branch.id));

      actions.append(edit, remove);
      card.append(details, actions);
      container.appendChild(card);
    });
  }

  function openBranchModal(id = null) {
    const branch = id
      ? state.data.branches.find((item) => String(item.id) === String(id))
      : null;

    state.editingBranchId = branch?.id || null;

    $("#branchModalTitle").textContent =
      branch ? "تعديل بيانات الفرع" : "إضافة فرع جديد";

    $("#branchId").value = branch?.id || "";
    $("#branchNameAr").value = branch?.nameAr || "";
    $("#branchNameEn").value = branch?.nameEn || "";
    $("#branchAddressAr").value = branch?.addressAr || "";
    $("#branchAddressEn").value = branch?.addressEn || "";
    $("#branchPhone").value = branch?.phone || "";
    $("#branchMap").value = branch?.map || "";
    $("#branchActive").checked = branch?.active !== false;

    $("#branchModal").hidden = false;
    $("#branchNameAr").focus();
  }

  async function saveBranch(event) {
    event.preventDefault();

    const id = state.editingBranchId || makeId("branch");

    const branch = {
      id,
      nameAr: $("#branchNameAr").value.trim(),
      nameEn: $("#branchNameEn").value.trim(),
      addressAr: $("#branchAddressAr").value.trim(),
      addressEn: $("#branchAddressEn").value.trim(),
      phone: $("#branchPhone").value.trim(),
      map: $("#branchMap").value.trim(),
      active: $("#branchActive").checked
    };

    if (!branch.nameAr) {
      toast("اكتب اسم الفرع بالعربية.");
      return;
    }

    const index = state.data.branches.findIndex(
      (item) => String(item.id) === String(id)
    );

    if (index >= 0) {
      state.data.branches[index] = branch;
    } else {
      state.data.branches.push(branch);
    }

    $("#branchModal").hidden = true;
    await saveContent(index >= 0 ? "تم تعديل الفرع" : "تمت إضافة الفرع");
  }

  async function deleteBranch(id) {
    const branch = state.data.branches.find(
      (item) => String(item.id) === String(id)
    );

    if (!branch) return;

    if (!confirm(`هل تريد حذف "${branch.nameAr || branch.nameEn}"؟`)) {
      return;
    }

    state.data.branches = state.data.branches.filter(
      (item) => String(item.id) !== String(id)
    );

    await saveContent("تم حذف الفرع");
  }

  /* ========================================
     CONTACT FORM
     ======================================== */

  function fillContactForm() {
    const contact = state.data.contact;

    $("#phone").value = contact.phone || "";
    $("#whatsapp").value = contact.whatsapp || "";
    $("#facebook").value = contact.facebook || "";
    $("#instagram").value = contact.instagram || "";
    $("#tiktok").value = contact.tiktok || "";
  }

  async function saveContact(event) {
    event.preventDefault();

    state.data.contact = {
      ...state.data.contact,
      phone: $("#phone").value.trim(),
      whatsapp: $("#whatsapp").value.trim(),
      facebook: $("#facebook").value.trim(),
      instagram: $("#instagram").value.trim(),
      tiktok: $("#tiktok").value.trim()
    };

    await saveContent("تم تحديث بيانات التواصل");
  }

  /* ========================================
     WEBSITE CONTENT FORM
     ======================================== */

  function fillContentForm() {
    const content = state.data.content;

    [
      "heroTitleAr",
      "heroTitleEn",
      "heroDescriptionAr",
      "heroDescriptionEn",
      "aboutTextAr",
      "aboutTextEn"
    ].forEach((key) => {
      const field = $(`#${key}`);
      if (field) field.value = content[key] || "";
    });
  }

  async function saveWebsiteContent(event) {
    event.preventDefault();

    const keys = [
      "heroTitleAr",
      "heroTitleEn",
      "heroDescriptionAr",
      "heroDescriptionEn",
      "aboutTextAr",
      "aboutTextEn"
    ];

    keys.forEach((key) => {
      state.data.content[key] = $(`#${key}`).value.trim();
    });

    await saveContent("تم حفظ محتوى الموقع");
  }

  /* ========================================
     MODALS
     ======================================== */

  function closeModal(id) {
    const modal = $(`#${id}`);
    if (modal) modal.hidden = true;
  }

  function initModals() {
    $$("[data-close-modal]").forEach((button) => {
      button.addEventListener("click", () => {
        closeModal(button.dataset.closeModal);
      });
    });

    $$(".modal-backdrop").forEach((modal) => {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          modal.hidden = true;
        }
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        $$(".modal-backdrop").forEach((modal) => {
          modal.hidden = true;
        });
      }
    });
  }

  /* ========================================
     SETTINGS
     ======================================== */

  function initSettings() {
    const workerInput = $("#workerUrl");

    workerInput.value = getWorkerUrl();

    $("#saveWorkerUrl").addEventListener("click", async () => {
      const value = workerInput.value.trim().replace(/\/+$/, "");

      if (!value) {
        toast("أدخل رابط Worker صحيح.");
        return;
      }

      try {
        const url = new URL(value);

        if (!["https:", "http:"].includes(url.protocol)) {
          throw new Error("Invalid URL");
        }

        localStorage.setItem(CONFIG.workerUrlKey, value);
        toast("تم حفظ رابط Worker");

        if (getToken()) {
          await fetchContent();
        }
      } catch (error) {
        toast("رابط Worker غير صحيح.");
      }
    });
  }

  /* ========================================
     AUTHENTICATION
     ======================================== */

  function initAuthentication() {
    $("#loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();

      if (state.busy) return;

      const password = $("#adminPassword").value;
      const button = $("#loginButton");
      const message = $("#loginMessage");

      if (!getWorkerUrl()) {
        message.textContent = "أدخل رابط Worker أولًا من إعدادات الاتصال.";
        return;
      }

      state.busy = true;
      button.disabled = true;
      button.textContent = "جارٍ تسجيل الدخول...";

      try {
        await login(password);
        await fetchContent();

        showDashboard();
        $("#adminPassword").value = "";
        message.textContent = "";
        toast("أهلًا بك في لوحة إدارة البرديسي");

      } catch (error) {
        clearSession();
        message.textContent = error.message || "تعذر تسجيل الدخول.";
      } finally {
        state.busy = false;
        button.disabled = false;
        button.innerHTML = 'تسجيل الدخول <span>←</span>';
      }
    });

    $("#logoutButton").addEventListener("click", logout);
    $("#settingsLogout").addEventListener("click", logout);
  }

  /* ========================================
     REFRESH
     ======================================== */

  function initRefresh() {
    $("#refreshButton").addEventListener("click", async () => {
      try {
        await fetchContent();
        toast("تم تحديث البيانات");
      } catch (error) {
        toast(error.message || "فشل تحديث البيانات");
      }
    });
  }

  /* ========================================
     INITIALIZATION
     ======================================== */

  function init() {
    initNavigation();
    initModals();
    initSettings();
    initAuthentication();
    initRefresh();

    $("#addProductButton").addEventListener("click", () => {
      openProductModal();
    });

    $("#addBranchButton").addEventListener("click", () => {
      openBranchModal();
    });

    $("#productForm").addEventListener("submit", saveProduct);
    $("#branchForm").addEventListener("submit", saveBranch);
    $("#contactForm").addEventListener("submit", saveContact);
    $("#contentForm").addEventListener("submit", saveWebsiteContent);

    const existingToken = getToken();

    if (existingToken && !sessionIsExpired()) {
      showDashboard();

      fetchContent().catch((error) => {
        console.error(error);
        clearSession();
        showLogin("تعذر استعادة الجلسة. سجّل الدخول مرة أخرى.");
        setConnection("error", "فشل الاتصال");
      });
    } else {
      clearSession();
      showLogin();
    }
  }

  document.addEventListener("DOMContentLoaded", init, { once: true });

})();
