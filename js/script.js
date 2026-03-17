// 1. المتغيرات العامة
let isArabic = false;

// ==========================================
// وظيفة 1: تغيير اللغة
// ==========================================
function toggleLanguage() {
    isArabic = !isArabic;
    const body = document.body;
    body.dir = isArabic ? "rtl" : "ltr";

    const btn = document.getElementById('lang-toggle');
    btn.textContent = isArabic ? "En" : "ع";

    const elements = document.querySelectorAll('[data-en]');
    elements.forEach(el => {
        if (isArabic) {
            if (el.getAttribute('data-ar')) el.textContent = el.getAttribute('data-ar');
        } else {
            el.textContent = el.getAttribute('data-en');
        }
    });
}

// ==========================================
// وظيفة 2: تحميل المنيو من قاعدة البيانات
// ==========================================
async function loadMenu() {
    const container = document.querySelector('.container');
    if (!container) return;

    try {
        const res = await fetch('/api/corners');
        const corners = await res.json();

        // Clear any hardcoded cards
        container.innerHTML = '';

        corners.forEach(corner => {
            const imagePath = corner.imageName ? `assets/images/${corner.imageName}` : '';
            const imageDiv = imagePath
                ? `<div class="card-image" style="background-image: url('${imagePath}')"></div>`
                : '';

            const itemsHtml = corner.items.map(item => `
                <div class="menu-item">
                    <span class="item-name" data-en="${item.nameEn}" data-ar="${item.nameAr}">${item.nameEn}</span>
                    <span class="item-price">${item.price}</span>
                </div>
            `).join('');

            const card = document.createElement('div');
            card.className = 'menu-card reveal';
            card.innerHTML = `
                ${imageDiv}
                <div class="card-content">
                    <h2 class="section-title" data-en="${corner.nameEn}" data-ar="${corner.nameAr}">${corner.nameEn}</h2>
                    <div class="item-list">
                        ${itemsHtml}
                    </div>
                    <p style="text-align: center; font-size: 1.1rem; color: #888; margin-top: 15px;">Add 12% Service In House</p>
                </div>
            `;
            container.appendChild(card);
        });

        // Start scroll observer after cards are loaded
        startObserver();
        startAutoScroll();

    } catch (err) {
        console.error('Failed to load menu from API:', err);
        // Fallback message
        container.innerHTML = '<p style="text-align:center; color:#888; padding: 40px;">Failed to load menu. Please start the server.</p>';
    }
}

// ==========================================
// وظيفة 3: تأثير ظهور العناصر أثناء السكرول
// ==========================================
function startObserver() {
    const observerOptions = {
        threshold: 0.10
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('show');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.menu-card').forEach(card => {
        observer.observe(card);
    });
}

// ==========================================
// وظيفة 4: السكرول التلقائي الذكي
// ==========================================
let autoScrollActive = true;
let scrollDirection = 1;
let scrollSpeed = 1;
let idleTimer;

function dynamicScroll() {
    if (!autoScrollActive) {
        requestAnimationFrame(dynamicScroll);
        return;
    }

    window.scrollBy(0, scrollDirection * scrollSpeed);

    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 2) {
        scrollDirection = -1;
        autoScrollActive = false;
        setTimeout(() => { autoScrollActive = true; }, 2000);
    }

    if (window.scrollY <= 0) {
        scrollDirection = 1;
        autoScrollActive = false;
        setTimeout(() => { autoScrollActive = true; }, 2000);
    }

    requestAnimationFrame(dynamicScroll);
}

function stopAutoScroll() {
    autoScrollActive = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        autoScrollActive = true;
    }, 4000);
}

function startAutoScroll() {
    window.addEventListener('touchstart', stopAutoScroll);
    window.addEventListener('wheel', stopAutoScroll);
    window.addEventListener('mousemove', stopAutoScroll);
    window.addEventListener('click', stopAutoScroll);

    setTimeout(() => {
        dynamicScroll();
    }, 1000);
}

// بدء تحميل المنيو عند تحميل الصفحة
loadMenu();