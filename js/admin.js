
/* =========================================
   AL BARDISI - ADMIN DASHBOARD
   Main JavaScript
   ========================================= */

(() => {
    'use strict';

    /* =========================================
       1. CONFIGURATION
       ========================================= */

    const CONFIG = {
        workerUrlKey: 'bardisi_admin_worker_url',
        apiTimeout: 20000,
        currency: 'جنيه'
    };

    const API = {
        login: '/api/login',
        logout: '/api/logout',
        content: '/api/content'
    };

    let siteData = {};
    let isAuthenticated = false;
    let editingProductId = null;
    let editingBranchId = null;
    let toastTimeout = null;


    /* =========================================
       2. DOM HELPERS
       ========================================= */

    const $ = (selector) => document.querySelector(selector);

    const getValue = (id) => {
        const element = document.getElementById(id);
        return element ? element.value.trim() : '';
    };

    const setValue = (id, value) => {
        const element = document.getElementById(id);

        if (element) {
            element.value = value ?? '';
        }
    };

    const createElement = (tag, className, text) => {
        const element = document.createElement(tag);

        if (className) {
            element.className = className;
        }

        if (text !== undefined && text !== null) {
            element.textContent = String(text);
        }

        return element;
    };

    const createButton = (text, className, onClick) => {
        const button = createElement('button', className, text);
        button.type = 'button';
        button.addEventListener('click', onClick);

        return button;
    };


    /* =========================================
       3. TOAST NOTIFICATIONS
       ========================================= */

    function showToast(message, type = 'success') {
        const toast = $('#toast');

        if (!toast) return;

        toast.textContent = message;
        toast.classList.add('show');

        toast.style.borderColor =
            type === 'error' ? '#D75B52' : '#C9A227';

        clearTimeout(toastTimeout);

        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }


    /* =========================================
       4. API HELPERS
       ========================================= */

    function getWorkerUrl() {
        return (
            localStorage.getItem(CONFIG.workerUrlKey) || ''
        ).replace(/\/+$/, '');
    }

    function getApiUrl(endpoint) {
        const baseUrl = getWorkerUrl();

        if (!baseUrl) {
            throw new Error('أضف رابط Cloudflare Worker من الإعدادات أولاً.');
        }

        return baseUrl + endpoint;
    }

    async function apiRequest(endpoint, options = {}) {
        const controller = new AbortController();

        const timeout = setTimeout(() => {
            controller.abort();
        }, CONFIG.apiTimeout);

        try {
            const response = await fetch(getApiUrl(endpoint), {
                ...options,

                credentials: 'include',

                signal: controller.signal,

                headers: {
                    ...(options.body ? {
                        'Content-Type': 'application/json'
                    } : {}),

                    ...options.headers
                }
            });

            const rawText = await response.text();

            let result = {};

            if (rawText) {
                try {
                    result = JSON.parse(rawText);
                } catch {
                    result = {
                        message: rawText
                    };
                }
            }

            if (!response.ok) {
                const error = new Error(
                    result.message ||
                    result.error ||
                    `حدث خطأ في الاتصال (${response.status})`
                );

                error.status = response.status;

                throw error;
            }

            return result;

        } catch (error) {

            if (error.name === 'AbortError') {
                throw new Error('انتهت مهلة الاتصال بالخادم.');
            }

            if (error instanceof TypeError) {
                throw new Error(
                    'تعذر الاتصال بالخادم. راجع الرابط واتصال الإنترنت.'
                );
            }

            throw error;

        } finally {
            clearTimeout(timeout);
        }
    }


    /* =========================================
       5. DATA NORMALIZATION
       ========================================= */

    function normalizeData(data) {
        const safeData =
            data && typeof data === 'object' ? data : {};

        return {
            ...safeData,

            menu: Array.isArray(safeData.menu)
                ? safeData.menu
                : [],

            branches: Array.isArray(safeData.branches)
                ? safeData.branches
                : [],

            contact: {
                phone: '',
                whatsapp: '',
                facebook: '',
                instagram: '',
                tiktok: '',
                ...(safeData.contact || {})
            },

            content: {
                heroTitleAr: '',
                heroTitleEn: '',
                heroDescriptionAr: '',
                heroDescriptionEn: '',
                aboutTextAr: '',
                aboutTextEn: '',
                ...(safeData.content || {})
            }
        };
    }


    /* =========================================
       6. AUTHENTICATION
       ========================================= */

    async function login(password) {
        const button = $('#loginButton');
        const message = $('#loginMessage');

        if (!password) {
            if (message) {
                message.textContent = 'اكتب كلمة المرور أولاً.';
            }

            return;
        }

        button.disabled = true;
        button.textContent = 'جاري تسجيل الدخول...';

        if (message) {
            message.textContent = '';
        }

        try {
            await apiRequest(API.login, {
                method: 'POST',

                body: JSON.stringify({
                    password
                })
            });

            const result = await loadSiteData();

            if (!result) {
                throw new Error('تم تسجيل الدخول لكن تعذر تحميل بيانات الموقع.');
            }

            isAuthenticated = true;

            showDashboard();

            showToast('تم تسجيل الدخول بنجاح.');

        } catch (error) {

            if (message) {
                message.textContent = error.message;
            }

            isAuthenticated = false;

        } finally {

            button.disabled = false;
            button.textContent = 'تسجيل الدخول';

        }
    }


    async function logout() {
        try {
            await apiRequest(API.logout, {
                method: 'POST'
            });

        } catch (error) {
            console.warn('Logout request:', error.message);

        } finally {
            isAuthenticated = false;
            siteData = {};

            $('#dashboard')?.classList.add('hidden');
            $('#loginScreen')?.classList.remove('hidden');

            setValue('adminPassword', '');

            showToast('تم تسجيل الخروج.');
        }
    }


    function showDashboard() {
        $('#loginScreen')?.classList.add('hidden');
        $('#dashboard')?.classList.remove('hidden');

        updateDashboardStats();
        renderProducts();
        renderBranches();
        fillContactForm();
        fillContentForm();
    }


    async function checkExistingSession() {
        if (!getWorkerUrl()) return;

        try {
            const result = await loadSiteData();

            if (result) {
                isAuthenticated = true;
                showDashboard();
            }

        } catch (error) {
            console.info('No active admin session:', error.message);
        }
    }


    /* =========================================
       7. LOAD AND SAVE SITE DATA
       ========================================= */

    async function loadSiteData() {
        const result = await apiRequest(API.content, {
            method: 'GET'
        });

        const data = result.data || result.content || result;

        siteData = normalizeData(data);

        updateDashboardStats();
        renderProducts();
        renderBranches();
        fillContactForm();
        fillContentForm();

        const status = $('#connectionStatus');

        if (status) {
            status.textContent = 'تم الاتصال بالخادم وتحميل البيانات بنجاح.';
        }

        return true;
    }


    async function saveSiteData(successMessage = 'تم حفظ التعديلات بنجاح.') {
        if (!isAuthenticated) {
            showToast('سجّل الدخول أولاً.', 'error');
            return false;
        }

        try {
            await apiRequest(API.content, {
                method: 'PUT',

                body: JSON.stringify({
                    data: siteData
                })
            });

            updateDashboardStats();

            showToast(successMessage);

            return true;

        } catch (error) {
            showToast(error.message, 'error');
            return false;
        }
    }


    /* =========================================
       8. DASHBOARD NAVIGATION
       ========================================= */

    const sectionTitles = {
        overview: 'الرئيسية',
        menu: 'إدارة المنيو',
        branches: 'الفروع',
        contact: 'بيانات التواصل',
        content: 'محتوى الموقع',
        settings: 'الإعدادات'
    };


    function openSection(sectionName) {
        if (!sectionTitles[sectionName]) return;

        document.querySelectorAll('.dashboard-section')
            .forEach(section => {
                section.classList.remove('active');
            });

        document.querySelectorAll('.nav-item')
            .forEach(button => {
                button.classList.toggle(
                    'active',
                    button.dataset.section === sectionName
                );
            });

        const section = $(`#section-${sectionName}`);

        if (section) {
            section.classList.add('active');
        }

        const title = $('#pageTitle');

        if (title) {
            title.textContent = sectionTitles[sectionName];
        }

        $('#sidebar')?.classList.remove('mobile-open');
    }


    function initializeNavigation() {
        document.querySelectorAll('.nav-item').forEach(button => {
            button.addEventListener('click', () => {
                openSection(button.dataset.section);
            });
        });

        document.querySelectorAll('[data-goto]').forEach(button => {
            button.addEventListener('click', () => {
                openSection(button.dataset.goto);
            });
        });

        $('#mobileMenuButton')?.addEventListener('click', () => {
            $('#sidebar')?.classList.toggle('mobile-open');
        });

        $('#refreshButton')?.addEventListener('click', async () => {
            if (!isAuthenticated) return;

            try {
                await loadSiteData();
                showToast('تم تحديث البيانات.');

            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    }


    /* =========================================
       9. DASHBOARD STATISTICS
       ========================================= */

    function updateDashboardStats() {
        const products = siteData.menu || [];
        const branches = siteData.branches || [];

        const productsCount = $('#totalProducts');
        const branchesCount = $('#totalBranches');

        if (productsCount) {
            productsCount.textContent = products.length;
        }

        if (branchesCount) {
            branchesCount.textContent = branches.length;
        }
    }


    /* =========================================
       10. MENU MANAGEMENT
       ========================================= */

    function renderProducts() {
        const table = $('#productsTable');

        if (!table) return;

        table.replaceChildren();

        if (!siteData.menu.length) {
            const row = createElement('tr');
            const cell = createElement(
                'td',
                '',
                'لا توجد منتجات حالياً.'
            );

            cell.colSpan = 5;
            cell.style.textAlign = 'center';

            row.appendChild(cell);
            table.appendChild(row);

            return;
        }

        siteData.menu.forEach(product => {
            const row = createElement('tr');

            const imageCell = createElement('td');
            const image = createElement('img', 'product-thumbnail');

            image.src = isSafeImageUrl(product.image)
                ? product.image
                : '';

            image.alt = product.nameAr || 'صورة المنتج';
            image.loading = 'lazy';

            image.addEventListener('error', () => {
                image.removeAttribute('src');
                image.alt = 'لا توجد صورة';
            });

            imageCell.appendChild(image);

            const nameCell = createElement(
                'td',
                '',
                product.nameAr || product.name || 'بدون اسم'
            );

            const categoryCell = createElement(
                'td',
                '',
                product.category || 'غير محدد'
            );

            const priceCell = createElement(
                'td',
                '',
                `${product.price ?? 0} ${CONFIG.currency}`
            );

            const actionsCell = createElement('td');

            const editButton = createButton(
                'تعديل',
                'table-action edit-action',
                () => editProduct(product.id)
            );

            const deleteButton = createButton(
                'حذف',
                'table-action delete-action',
                () => deleteProduct(product.id)
            );

            actionsCell.append(editButton, deleteButton);

            row.append(
                imageCell,
                nameCell,
                categoryCell,
                priceCell,
                actionsCell
            );

            table.appendChild(row);
        });
    }


    function openProductModal(product = null) {
        editingProductId = product ? product.id : null;

        $('#productModalTitle').textContent = product
            ? 'تعديل المنتج'
            : 'إضافة منتج';

        setValue('productId', product?.id || '');
        setValue('productNameAr', product?.nameAr || '');
        setValue('productNameEn', product?.nameEn || '');
        setValue('productCategory', product?.category || '');
        setValue('productPrice', product?.price ?? '');
        setValue('productImage', product?.image || '');
        setValue('productDescriptionAr', product?.descriptionAr || '');
        setValue('productDescriptionEn', product?.descriptionEn || '');

        $('#productModal')?.classList.add('active');
    }


    function editProduct(id) {
        const product = siteData.menu.find(item => item.id === id);

        if (!product) return;

        openProductModal(product);
    }


    async function deleteProduct(id) {
        const product = siteData.menu.find(item => item.id === id);

        if (!product) return;

        const confirmed = window.confirm(
            `هل أنت متأكد من حذف "${product.nameAr || product.name}"؟`
        );

        if (!confirmed) return;

        const previousMenu = [...siteData.menu];

        siteData.menu = siteData.menu.filter(item => item.id !== id);

        const saved = await saveSiteData('تم حذف المنتج.');

        if (!saved) {
            siteData.menu = previousMenu;
        }

        renderProducts();
    }


    async function saveProduct(event) {
        event.preventDefault();

        const nameAr = getValue('productNameAr');
        const nameEn = getValue('productNameEn');
        const category = getValue('productCategory');
        const price = Number(getValue('productPrice'));
        const image = getValue('productImage');

        if (!nameAr || !nameEn || !category) {
            showToast('أكمل بيانات المنتج.', 'error');
            return;
        }

        if (!Number.isFinite(price) || price < 0) {
            showToast('أدخل سعراً صحيحاً.', 'error');
            return;
        }

        if (image && !isSafeImageUrl(image)) {
            showToast('رابط الصورة غير صالح.', 'error');
            return;
        }

        const product = {
            id: editingProductId || createId(),

            nameAr,
            nameEn,
            category,
            price,

            image,

            descriptionAr: getValue('productDescriptionAr'),
            descriptionEn: getValue('productDescriptionEn')
        };

        const previousMenu = [...siteData.menu];

        if (editingProductId) {
            siteData.menu = siteData.menu.map(item =>
                item.id === editingProductId ? product : item
            );

        } else {
            siteData.menu.push(product);
        }

        const saved = await saveSiteData(
            editingProductId
                ? 'تم تعديل المنتج.'
                : 'تمت إضافة المنتج.'
        );

        if (!saved) {
            siteData.menu = previousMenu;
            renderProducts();
            return;
        }

        renderProducts();
        closeModal('productModal');
        $('#productForm')?.reset();
        editingProductId = null;
    }


    /* =========================================
       11. BRANCH MANAGEMENT
       ========================================= */

    function renderBranches() {
        const container = $('#branchesList');

        if (!container) return;

        container.replaceChildren();

        if (!siteData.branches.length) {
            container.appendChild(
                createElement('p', '', 'لا توجد فروع مسجلة حالياً.')
            );

            return;
        }

        siteData.branches.forEach(branch => {
            const card = createElement('article', 'branch-card');

            const heading = createElement(
                'h3',
                '',
                branch.name || 'فرع جديد'
            );

            const address = createElement(
                'p',
                '',
                `العنوان: ${branch.addressAr || 'غير محدد'}`
            );

            const phone = createElement(
                'p',
                '',
                `الهاتف: ${branch.phone || 'غير محدد'}`
            );

            const map = createElement(
                'p',
                '',
                `الخريطة: ${branch.map || 'غير مضافة'}`
            );

            const actions = createElement('div', 'branch-actions');

            const editButton = createButton(
                'تعديل',
                'table-action edit-action',
                () => editBranch(branch.id)
            );

            const deleteButton = createButton(
                'حذف',
                'table-action delete-action',
                () => deleteBranch(branch.id)
            );

            actions.append(editButton, deleteButton);

            card.append(
                heading,
                address,
                phone,
                map,
                actions
            );

            container.appendChild(card);
        });
    }


    function openBranchModal(branch = null) {
        editingBranchId = branch ? branch.id : null;

        $('#branchModalTitle').textContent = branch
            ? 'تعديل الفرع'
            : 'إضافة فرع';

        setValue('branchId', branch?.id || '');
        setValue('branchName', branch?.name || '');
        setValue('branchAddressAr', branch?.addressAr || '');
        setValue('branchAddressEn', branch?.addressEn || '');
        setValue('branchPhone', branch?.phone || '');
        setValue('branchMap', branch?.map || '');

        $('#branchModal')?.classList.add('active');
    }


    function editBranch(id) {
        const branch = siteData.branches.find(item => item.id === id);

        if (!branch) return;

        openBranchModal(branch);
    }


    async function deleteBranch(id) {
        const branch = siteData.branches.find(item => item.id === id);

        if (!branch) return;

        const confirmed = window.confirm(
            `هل تريد حذف فرع "${branch.name}"؟`
        );

        if (!confirmed) return;

        const previousBranches = [...siteData.branches];

        siteData.branches = siteData.branches.filter(
            item => item.id !== id
        );

        const saved = await saveSiteData('تم حذف الفرع.');

        if (!saved) {
            siteData.branches = previousBranches;
        }

        renderBranches();
    }


    async function saveBranch(event) {
        event.preventDefault();

        const name = getValue('branchName');
        const addressAr = getValue('branchAddressAr');
        const addressEn = getValue('branchAddressEn');
        const phone = getValue('branchPhone');
        const map = getValue('branchMap');

        if (!name || !addressAr) {
            showToast('أدخل اسم الفرع والعنوان.', 'error');
            return;
        }

        if (map && !isSafeHttpUrl(map)) {
            showToast('رابط الخريطة غير صالح.', 'error');
            return;
        }

        const branch = {
            id: editingBranchId || createId(),
            name,
            addressAr,
            addressEn,
            phone,
            map
        };

        const previousBranches = [...siteData.branches];

        if (editingBranchId) {
            siteData.branches = siteData.branches.map(item =>
                item.id === editingBranchId ? branch : item
            );

        } else {
            siteData.branches.push(branch);
        }

        const saved = await saveSiteData(
            editingBranchId
                ? 'تم تعديل الفرع.'
                : 'تمت إضافة الفرع.'
        );

        if (!saved) {
            siteData.branches = previousBranches;
            renderBranches();
            return;
        }

        renderBranches();
        closeModal('branchModal');
        $('#branchForm')?.reset();
        editingBranchId = null;
    }


    /* =========================================
       12. CONTACT INFORMATION
       ========================================= */

    function fillContactForm() {
        const contact = siteData.contact || {};

        setValue('phone', contact.phone);
        setValue('whatsapp', contact.whatsapp);
        setValue('facebook', contact.facebook);
        setValue('instagram', contact.instagram);
        setValue('tiktok', contact.tiktok);
    }


    async function saveContact(event) {
        event.preventDefault();

        const contact = {
            phone: getValue('phone'),
            whatsapp: getValue('whatsapp'),
            facebook: getValue('facebook'),
            instagram: getValue('instagram'),
            tiktok: getValue('tiktok')
        };

        const links = [
            contact.facebook,
            contact.instagram,
            contact.tiktok
        ];

        if (links.some(link => link && !isSafeHttpUrl(link))) {
            showToast('تأكد من صحة روابط التواصل.', 'error');
            return;
        }

        const previousContact = { ...siteData.contact };

        siteData.contact = contact;

        const saved = await saveSiteData(
            'تم تحديث بيانات التواصل.'
        );

        if (!saved) {
            siteData.contact = previousContact;
            fillContactForm();
        }
    }


    /* =========================================
       13. WEBSITE CONTENT
       ========================================= */

    function fillContentForm() {
        const content = siteData.content || {};

        setValue('heroTitleAr', content.heroTitleAr);
        setValue('heroTitleEn', content.heroTitleEn);

        setValue('heroDescriptionAr', content.heroDescriptionAr);
        setValue('heroDescriptionEn', content.heroDescriptionEn);

        setValue('aboutTextAr', content.aboutTextAr);
        setValue('aboutTextEn', content.aboutTextEn);
    }


    async function saveContent(event) {
        event.preventDefault();

        const content = {
            heroTitleAr: getValue('heroTitleAr'),
            heroTitleEn: getValue('heroTitleEn'),

            heroDescriptionAr: getValue('heroDescriptionAr'),
            heroDescriptionEn: getValue('heroDescriptionEn'),

            aboutTextAr: getValue('aboutTextAr'),
            aboutTextEn: getValue('aboutTextEn')
        };

        const previousContent = { ...siteData.content };

        siteData.content = content;

        const saved = await saveSiteData(
            'تم تحديث محتوى الموقع.'
        );

        if (!saved) {
            siteData.content = previousContent;
            fillContentForm();
        }
    }


    /* =========================================
       14. SETTINGS
       ========================================= */

    function initializeSettings() {
        const workerInput = $('#workerUrl');

        if (workerInput) {
            workerInput.value = getWorkerUrl();
        }

        $('#saveWorkerUrl')?.addEventListener('click', () => {
            const url = getValue('workerUrl');

            if (!isSafeHttpUrl(url)) {
                showToast('أدخل رابط Worker صحيحاً يبدأ بـ HTTPS.', 'error');
                return;
            }

            try {
                const parsed = new URL(url);

                if (parsed.protocol !== 'https:') {
                    showToast('يجب استخدام رابط HTTPS.', 'error');
                    return;
                }

                localStorage.setItem(
                    CONFIG.workerUrlKey,
                    parsed.origin + parsed.pathname.replace(/\/+$/, '')
                );

                showToast('تم حفظ رابط الخادم.');

                checkExistingSession();

            } catch {
                showToast('رابط الخادم غير صالح.', 'error');
            }
        });
    }


    /* =========================================
       15. MODAL HELPERS
       ========================================= */

    function closeModal(id) {
        document.getElementById(id)?.classList.remove('active');
    }


    function initializeModals() {
        document.querySelectorAll('[data-close]').forEach(button => {
            button.addEventListener('click', () => {
                closeModal(button.dataset.close);
            });
        });

        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', event => {
                if (event.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                document.querySelectorAll('.modal-overlay.active')
                    .forEach(modal => modal.classList.remove('active'));
            }
        });

        $('#addProductButton')?.addEventListener('click', () => {
            $('#productForm')?.reset();
            openProductModal();
        });

        $('#addBranchButton')?.addEventListener('click', () => {
            $('#branchForm')?.reset();
            openBranchModal();
        });
    }


    /* =========================================
       16. FORM EVENTS
       ========================================= */

    function initializeForms() {
        $('#loginForm')?.addEventListener('submit', event => {
            event.preventDefault();

            login(getValue('adminPassword'));
        });

        $('#productForm')?.addEventListener(
            'submit',
            saveProduct
        );

        $('#branchForm')?.addEventListener(
            'submit',
            saveBranch
        );

        $('#contactForm')?.addEventListener(
            'submit',
            saveContact
        );

        $('#contentForm')?.addEventListener(
            'submit',
            saveContent
        );

        $('#logoutButton')?.addEventListener('click', logout);

        $('#settingsLogout')?.addEventListener('click', logout);
    }


    /* =========================================
       17. VALIDATION HELPERS
       ========================================= */

    function isSafeHttpUrl(value) {
        try {
            const url = new URL(value);

            return (
                url.protocol === 'https:' ||
                url.protocol === 'http:'
            );

        } catch {
            return false;
        }
    }


    function isSafeImageUrl(value) {
        if (!value) return true;

        return isSafeHttpUrl(value);
    }


    function createId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        return (
            'item-' +
            Date.now().toString(36) +
            '-' +
            Math.random().toString(36).slice(2, 10)
        );
    }


    /* =========================================
       18. INITIALIZATION
       ========================================= */

    function initializeDashboard() {
        initializeNavigation();
        initializeForms();
        initializeModals();
        initializeSettings();

        $('#loginScreen')?.classList.remove('hidden');
        $('#dashboard')?.classList.add('hidden');

        checkExistingSession();
    }


    /* =========================================
       19. START APPLICATION
       ========================================= */

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            initializeDashboard
        );

    } else {
        initializeDashboard();
    }

})();
