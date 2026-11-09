function hideEmptyFeatures() {
    const c = window.CONFIG;
    const hasFavorites = c.favorites && (
        (c.favorites.shows && c.favorites.shows.length > 0) ||
        (c.favorites.movies && c.favorites.movies.length > 0) ||
        (c.favorites.music && c.favorites.music.length > 0)
    );
    const hasProjects = c.projects && c.projects.length > 0;
    if (!hasFavorites) {
        const favIcon = document.querySelector('.desktop-icon[data-app="favorites"]');
        const favStartItem = document.querySelector('.start-app-item[data-name="favorites"]');
        if (favIcon) favIcon.style.display = 'none';
        if (favStartItem) favStartItem.style.display = 'none';
    }
    if (!hasProjects) {
        const projIcon = document.querySelector('.desktop-icon[data-app="projects"]');
        const projStartItem = document.querySelector('.start-app-item[data-name="projects"]');
        if (projIcon) projIcon.style.display = 'none';
        if (projStartItem) projStartItem.style.display = 'none';
    }
    if (c.favorites) {
        if (!c.favorites.shows || c.favorites.shows.length === 0) {
            const showsTab = document.querySelector('.fav-tab[onclick*="shows"]');
            if (showsTab) showsTab.style.display = 'none';
        }

        if (!c.favorites.movies || c.favorites.movies.length === 0) {
            const moviesTab = document.querySelector('.fav-tab[onclick*="movies"]');
            if (moviesTab) moviesTab.style.display = 'none';
        }

        if (!c.favorites.music || c.favorites.music.length === 0) {
            const musicTab = document.querySelector('.fav-tab[onclick*="music"]');
            if (musicTab) musicTab.style.display = 'none';
        }
        if (hasFavorites) {
            const firstAvailableTab =
                (c.favorites.shows && c.favorites.shows.length > 0) ? 'shows' :
                (c.favorites.movies && c.favorites.movies.length > 0) ? 'movies' : 'music';
            document.querySelectorAll('.fav-tab').forEach(tab => tab.classList.remove('active'));
            const activeTab = document.querySelector(`.fav-tab[onclick*="${firstAvailableTab}"]`);
            if (activeTab) activeTab.classList.add('active');
            document.querySelectorAll('[id^="fav-content-"]').forEach(c => c.style.display = 'none');
            const activeContent = document.getElementById(`fav-content-${firstAvailableTab}`);
            if (activeContent) activeContent.style.display = 'block';
        }
    }
}

const GRID = {
    colWidth: 120,
    rowHeight: 150,
    paddingX: 24,
    paddingY: 44
};

let desktopLaidOut = false;

function layoutDesktopIcons() {
    desktopLaidOut = true;

    const icons = document.querySelectorAll(".desktop-icon");
    const isMobile = window.innerWidth <= 600;
    const paddingX = isMobile ? 12 : GRID.paddingX;
    const paddingY = isMobile ? 16 : GRID.paddingY;
    const colWidth = isMobile ? Math.min(105, Math.floor((window.innerWidth - paddingX * 2) / Math.max(2, Math.floor((window.innerWidth - paddingX * 2) / 95)))) : GRID.colWidth;
    const rowHeight = isMobile ? 116 : GRID.rowHeight;

    let col = 0,
        row = 0;

    icons.forEach(icon => {
        const x = paddingX + col * colWidth;
        const y = paddingY + row * rowHeight;

        icon.style.left = x + "px";
        icon.style.top = y + "px";

        row++;
        if (y + rowHeight * 2 > window.innerHeight) {
            row = 0;
            col++;
        }
    });
}

window.addEventListener("resize", () => {
    if (desktopLaidOut) layoutDesktopIcons();
});

async function login() {
    if (!firstWallpaperReady) {
        await preloadFirstWallpaper();
    }

    document.body.classList.add("logged-in");
    document.getElementById("login-screen").classList.add("hidden");
    if (window.__mascot) {
        window.__mascot.brain?.onLogin?.();
    }

    const desktop = document.getElementById("desktop");
    desktop.style.backgroundImage =
        `url('${state.wallpapers[state.currentWallpaper]}')`;

    requestAnimationFrame(() => {
        layoutDesktopIcons();
    });

    initDesktop();
}

function isCellOccupied(x, y, self) {
    return [...document.querySelectorAll(".desktop-icon")].some(icon => {
        if (icon === self) return false;
        return (
            parseInt(icon.style.left) === x &&
            parseInt(icon.style.top) === y
        );
    });
}

function findFreeSlot(startX, startY, self) {
    let radius = 0;

    while (radius < 10) {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const x = startX + dx * GRID.colWidth;
                const y = startY + dy * GRID.rowHeight;

                if (
                    x < GRID.paddingX ||
                    y < GRID.paddingY ||
                    x > window.innerWidth ||
                    y > window.innerHeight
                ) continue;

                if (!isCellOccupied(x, y, self)) {
                    return {
                        x,
                        y
                    };
                }
            }
        }
        radius++;
    }

    return {
        x: startX,
        y: startY
    };
}

function renderFavorites() {
    if (!CONFIG.favorites) return;

    const favs = CONFIG.favorites;

    Object.entries(favs).forEach(([category, items]) => {
        if (!items || items.length === 0) return;

        const grid = document.getElementById(`fav-grid-${category}`);
        if (!grid) return;

        grid.innerHTML = items.map(item => `
      <div class="fav-item">
        <img src="${item.image}" class="fav-img">
        <div class="fav-info">
          <div class="fav-name">${item.title}</div>
          <div class="fav-desc">${item.short}</div>
          <div class="fav-artist">${item.meta}</div>
        </div>
      </div>
    `).join("");

        grid.querySelectorAll(".fav-item").forEach((el, i) => {
            el.onclick = () => openFavDetailWindow(
                items[i].title,
                items[i].desc,
                items[i].meta,
                items[i].image,
            );
        });
    });
}

function renderProjects() {
    if (!CONFIG.projects || CONFIG.projects.length === 0) return;

    const projects = CONFIG.projects;
    const grid = document.getElementById('projects-grid');

    grid.innerHTML = projects.map(proj => `
    <div class="projects-item">
      <img src="${proj.image}" class="projects-img">
      <div class="projects-info">
        <div class="projects-name">${proj.title}</div>
        <div class="projects-desc">${proj.short}</div>
        <div class="projects-links">
          <a href="${proj.link}" target="_blank" class="projects-link">View Project</a>
        </div>
      </div>
    </div>
  `).join("");

    grid.querySelectorAll(".projects-item").forEach((el, i) => {
        el.onclick = () => openprojectsWindow(
            projects[i].title,
            projects[i].desc,
            projects[i].meta,
            projects[i].image,
            projects[i].link
        );
    });
}

function initializeWithConfig() {
    if (!window.CONFIG) {
        console.error('Config not loaded! Make sure config.js is included before home.js');
        return;
    }

    const c = window.CONFIG;
    document.getElementById('login-avatar').src = c.personal.avatarImage;
    document.getElementById('about-photo').src = c.personal.profileImage;
    document.getElementById('start-user-avatar').src = c.personal.avatarImage;
    document.getElementById('login-name').textContent = `${c.personal.name}'S PORTFOLIO`;
    document.getElementById('start-user-name').textContent = 'Guest User';
    document.getElementById('about-title').textContent = c.about.title;

    const paragraphsDiv = document.getElementById('about-paragraphs');
    paragraphsDiv.innerHTML = c.about.paragraphs.map(p => `<p>${p}</p>`).join('');

    document.getElementById('about-skills').textContent = c.about.skills;
    document.getElementById('about-age').textContent = c.personal.age;
    document.getElementById('about-location').textContent = c.personal.location;
    document.getElementById('recipient-email').value = c.personal.email;
    document.getElementById('resume-frame').src = c.resume.pdfUrl;
    document.getElementById('resume-download').href = c.resume.pdfUrl;
    document.getElementById('resume-download').download = c.resume.fileName;
    renderFavorites();
    renderProjects();
    hideEmptyFeatures();
}

function snapToGrid(x, y) {
    const col = Math.round((x - GRID.paddingX) / GRID.colWidth);
    const row = Math.round((y - GRID.paddingY) / GRID.rowHeight);

    return {
        x: GRID.paddingX + col * GRID.colWidth,
        y: GRID.paddingY + row * GRID.rowHeight
    };
}

function openSocial(platform) {
    const urls = window.CONFIG.social;
    if (urls[platform]) {
        window.open(urls[platform], '_blank');
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWithConfig);
} else {
    initializeWithConfig();
}

function geoDistanceKm(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(a.lat * Math.PI / 180) *
        Math.cos(b.lat * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

function transitionPlan(from, to) {
    const d = geoDistanceKm(from, to);

    if (d < 30) {
        return {
            type: "slide",
            midZoom: 12,
            finalZoom: 15,
            duration: 3.5
        };
    }
    if (d < 300) {
        return {
            type: "soft",
            midZoom: 8,
            finalZoom: 15,
            duration: 4.5
        };
    }
    return {
        type: "far",
        midZoom: 3,
        finalZoom: 15,
        duration: 5.5
    };
}

function smartFly(from, to) {
    const plan = transitionPlan(from, to);

    if (plan.type === "slide") {
        eduMap.flyTo([to.lat, to.lng], plan.finalZoom, {
            duration: plan.duration,
            easeLinearity: 0.25
        });
        return;
    }

    eduMap.flyTo([to.lat, to.lng], plan.finalZoom, {
        duration: plan.duration,
        easeLinearity: 0.15,
        animate: true
    });

    setTimeout(() => {
        eduMap.flyTo([to.lat, to.lng], plan.finalZoom, {
            duration: plan.duration * 0.6,
            easeLinearity: 0.08

        });
    }, plan.duration * 400);
}

let firstWallpaperReady = false;

async function preloadFirstWallpaper() {
    const boot = document.getElementById("boot-screen");
    const login = document.getElementById("login-screen");

    const first = state.wallpapers[0];

    try {
        await preloadImage(first);
    } catch (e) {
        console.warn("Wallpaper failed, continuing anyway");
    }
    firstWallpaperReady = true;

    boot.classList.add("hidden");

    setTimeout(() => {
        login.classList.add("visible");
    }, 200);
}

const EDUCATION_POINTS = window.CONFIG.education;

let eduMap = null;
let eduMarker = null;
let eduIndex = 0;
let eduTimers = [];
let isEducationRunning = false;

function openEducation() {
    const win = document.getElementById("education-window");

    win.classList.remove("minimizing");
    void win.offsetWidth;
    win.classList.add("active");

    if (!state.openWindows.includes("education")) {
        state.openWindows.push("education");
        addTaskbarApp("education");
    }

    bringToFront("education");
    if (state.startMenuOpen) toggleStartMenu();
    eduIndex = 0;
    eduTimers.forEach(clearTimeout);
    eduTimers = [];
    isEducationRunning = false;
    if (!eduMap) {
        setTimeout(() => {
            eduMap = L.map("edu-map", {
                zoomControl: false,
                dragging: false,
                scrollWheelZoom: false,
                doubleClickZoom: false,
                boxZoom: false,
                preferCanvas: true,
                keyboard: false,
            });
            const first = EDUCATION_POINTS[0];
            eduMap.setView([first.lat, first.lng], 5, {
                animate: false
            });
            L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                keepBuffer: 10,
                updateWhenIdle: true,
            }).addTo(eduMap);

            eduMap.invalidateSize();
            setTimeout(() => {
                isEducationRunning = true;
                runEducationStep();
            }, 200);
        }, 400);
    } else {
        setTimeout(() => {
            eduMap.invalidateSize();
            isEducationRunning = true;
            runEducationStep();
        }, 400);
    }
}

function runEducationStep() {
    if (!isEducationRunning) return;

    const p = EDUCATION_POINTS[eduIndex];

    const prev =
        eduIndex === 0 ?
        p :
        EDUCATION_POINTS[eduIndex - 1];

    document.getElementById("edu-title").textContent = p.title;
    document.getElementById("edu-subtitle").textContent = p.subtitle;
    document.getElementById("edu-progress").textContent =
        `Location ${eduIndex + 1} of ${EDUCATION_POINTS.length}`;

    if (eduMarker) eduMap.removeLayer(eduMarker);

    smartFly(prev, p);

    eduMarker = L.marker([p.lat, p.lng]).addTo(eduMap);

    eduTimers.push(
        setTimeout(() => {
            eduIndex++;
            if (eduIndex < EDUCATION_POINTS.length) {
                runEducationStep();
            } else {
                isEducationRunning = false;
            }
        }, 6000)
    );
}

function closeEducation() {
    isEducationRunning = false;
    eduTimers.forEach(clearTimeout);
    eduTimers = [];
    const win = document.getElementById("education-window");
    win.classList.add("minimizing");

    setTimeout(() => {
        win.classList.remove("active", "minimizing");
    }, 300);

    state.openWindows = state.openWindows.filter((id) => id !== "education");
    removeTaskbarApp("education");
}
const RESUME_PDF_URL = "resume.pdf";

function openResume() {
    document.getElementById("resume-frame").src = RESUME_PDF_URL;
    document.getElementById("resume-download").href = RESUME_PDF_URL;

    openWindow("resume");
}

const state = {
    windows: {},
    openWindows: [],
    startMenuOpen: false,
    wifiPanelOpen: false,
    selectedIcon: null,
    wallpapers: window.CONFIG.wallpaper,
    currentWallpaper: 0,
};
preloadFirstWallpaper();

function initDesktop() {
    setInterval(() => {
        state.currentWallpaper =
            (state.currentWallpaper + 1) % state.wallpapers.length;
        changeWallpaper();
    }, 10000);
    updateClock();
    setInterval(updateClock, 1000);
    initWindows();
    initDraggableIcons();
}

function preloadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(src);
        img.onerror = reject;
        img.src = src;
    });
}

let isWallpaperChanging = false;

async function changeWallpaper() {
    if (isWallpaperChanging) return;
    isWallpaperChanging = true;

    const desktop = document.getElementById("desktop");
    const nextSrc = state.wallpapers[state.currentWallpaper];

    try {
        await preloadImage(nextSrc);

        desktop.style.backgroundImage = `url('${nextSrc}')`;
    } catch (e) {
        console.warn("Wallpaper failed to load:", nextSrc);
    } finally {
        isWallpaperChanging = false;
    }
}

function updateClock() {
    const now = new Date();

    const time = now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });

    const d = String(now.getDate()).padStart(2, "0");
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const y = String(now.getFullYear()).slice(-2);

    document.getElementById("time").textContent = time;
    document.getElementById("date").textContent = `${d}/${m}/${y}`;
}

function openFavDetailWindow(name, desc, meta, img) {
    document.getElementById("favdetail-title").textContent = name;
    document.getElementById("favdetail-name").textContent = name;
    document.getElementById("favdetail-desc").textContent = desc;
    document.getElementById("favdetail-meta").textContent = meta;
    document.getElementById("favdetail-img").src = img;
    openWindow("favdetail");
}

document.querySelector(".start-search").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();

    document.querySelectorAll(".start-app-item").forEach((app) => {
        app.style.display = app.dataset.name.includes(q) ? "flex" : "none";
    });
});

function closeFavModal() {
    document.getElementById("fav-modal").style.display = "none";
}

function initDraggableIcons() {
    const icons = document.querySelectorAll(".desktop-icon");

    icons.forEach((icon) => {
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;
        let touchStartX,
            touchStartY,
            touchMoved = false;
        icon.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return;

            icon.classList.add("dragging");

            icon.dataset.startX = e.clientX;
            icon.dataset.startY = e.clientY;
            icon.dataset.initialLeft = parseInt(icon.style.left) || 0;
            icon.dataset.initialTop = parseInt(icon.style.top) || 0;

            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            const icon = document.querySelector(".desktop-icon.dragging");
            if (!icon) return;

            const startX = parseInt(icon.dataset.startX);
            const startY = parseInt(icon.dataset.startY);
            const initialLeft = parseInt(icon.dataset.initialLeft);
            const initialTop = parseInt(icon.dataset.initialTop);

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newX = initialLeft + dx;
            let newY = initialTop + dy;

            newX = Math.max(0, Math.min(newX, window.innerWidth - 100));
            newY = Math.max(0, Math.min(newY, window.innerHeight - 150));

            icon.style.left = newX + "px";
            icon.style.top = newY + "px";
        });

        icon.addEventListener("touchstart", (e) => {
            const touch = e.touches[0];
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
            touchMoved = false;

            isDragging = true;
            icon.classList.add("dragging");
            startX = touch.clientX;
            startY = touch.clientY;
            initialLeft = parseInt(icon.style.left) || 0;
            initialTop = parseInt(icon.style.top) || 0;
        });

        icon.addEventListener("touchmove", (e) => {
            if (!isDragging) return;
            e.preventDefault();

            const touch = e.touches[0];
            const dx = touch.clientX - touchStartX;
            const dy = touch.clientY - touchStartY;

            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                touchMoved = true;
            }

            let newX = initialLeft + (touch.clientX - startX);
            let newY = initialTop + (touch.clientY - startY);

            newX = Math.max(0, Math.min(newX, window.innerWidth - 100));
            newY = Math.max(0, Math.min(newY, window.innerHeight - 150));

            icon.style.left = newX + "px";
            icon.style.top = newY + "px";
        });

        icon.addEventListener("touchend", (e) => {
            if (isDragging && !touchMoved) {
                e.preventDefault();
                e.stopPropagation();
                const app = icon.getAttribute("data-app");
                if (window.__mascot) {
                    window.__mascot.brain?.onIconClick(app);
                }
                if (app === "resume") {
                    openResume();
                } else if (app === "education") {
                    openEducation();
                } else if (
                    app === "telegram" ||
                    app === "github" ||
                    app === "linkedin" ||
                    app === "instagram"
                ) {
                    openSocial(app);
                } else {
                    openWindow(app);
                }
            }

            isDragging = false;
            icon.classList.remove("dragging");
        });

        icon.addEventListener("click", (e) => {
            if (!isDragging) {
                document
                    .querySelectorAll(".desktop-icon")
                    .forEach((i) => i.classList.remove("selected"));
                icon.classList.add("selected");
                state.selectedIcon = icon;
            }
        });

        icon.addEventListener("dblclick", (e) => {
            const app = icon.getAttribute("data-app");
            if (app === "favorites" && (!CONFIG.favorites ||
                    (!CONFIG.favorites.shows?.length && !CONFIG.favorites.movies?.length && !CONFIG.favorites.music?.length))) {
                return
            }
            if (app === "projects" && (!CONFIG.projects || CONFIG.projects.length === 0)) {
                return;
            }
            if (app === "resume") {
                openResume();
            } else if (app === "education") {
                openEducation();
            } else if (
                app === "telegram" ||
                app === "github" ||
                app === "linkedin" ||
                app === "instagram"
            ) {
                openSocial(app);
            } else {
                openWindow(app);
            }
            e.stopPropagation();
        });
    });

    document.addEventListener("mouseup", () => {
        const icon = document.querySelector(".desktop-icon.dragging");
        if (!icon) return;

        const x = parseInt(icon.style.left);
        const y = parseInt(icon.style.top);
        const snapped = snapToGrid(x, y);
        let finalPos = snapped;

        if (isCellOccupied(snapped.x, snapped.y, icon)) {
            finalPos = findFreeSlot(snapped.x, snapped.y, icon);
        }

        icon.style.left = finalPos.x + "px";
        icon.style.top = finalPos.y + "px";

        icon.classList.remove("dragging");
    });

    document.getElementById("desktop").addEventListener("click", (e) => {
        if (
            e.target.id === "desktop" ||
            e.target.classList.contains("desktop-icons")
        ) {
            document
                .querySelectorAll(".desktop-icon")
                .forEach((i) => i.classList.remove("selected"));
            state.selectedIcon = null;
        }
    });
}

function toggleStartMenu() {
    state.startMenuOpen = !state.startMenuOpen;
    const menu = document.getElementById("start-menu");
    if (state.startMenuOpen) {
        menu.classList.add("open");
    } else {
        menu.classList.remove("open");
    }
    if (state.startMenuOpen && state.wifiPanelOpen) {
        toggleWifiPanel();
    }
}

document.addEventListener("click", (e) => {
    if (window.innerWidth <= 768 && state.startMenuOpen) {
        const startHeader = document.querySelector(".start-header");
        if (startHeader && e.target === startHeader) {
            const rect = startHeader.getBoundingClientRect();
            const closeButtonArea = {
                left: rect.right - 60,
                right: rect.right - 20,
                top: rect.top + 20,
                bottom: rect.top + 60,
            };

            if (
                e.clientX >= closeButtonArea.left &&
                e.clientX <= closeButtonArea.right &&
                e.clientY >= closeButtonArea.top &&
                e.clientY <= closeButtonArea.bottom
            ) {
                toggleStartMenu();
            }
        }
    }
});

function toggleWifiPanel() {
    state.wifiPanelOpen = !state.wifiPanelOpen;
    const panel = document.getElementById("wifi-panel");
    if (state.wifiPanelOpen) {
        panel.classList.add("open");
        if (!window.speedTestStarted) {
            startSpeedTest();
            window.speedTestStarted = true;
        }
    } else {
        panel.classList.remove("open");
    }
    if (state.wifiPanelOpen && state.startMenuOpen) {
        toggleStartMenu();
    }
}

async function startSpeedTest() {
    const d = document.getElementById("download-speed");
    const u = document.getElementById("upload-speed");
    const p = document.getElementById("ping");

    const pt = performance.now();
    await fetch("https://www.cloudflare.com/cdn-cgi/trace", {
        cache: "no-store"
    });
    p.textContent = Math.round(performance.now() - pt) + " ms";

    const ds = performance.now();
    const r1 = await fetch(
        "https://speed.cloudflare.com/__down?bytes=8000000", {
            cache: "no-store"
        }
    );
    const b1 = await r1.blob();
    const dt = (performance.now() - ds) / 1000;
    const down = (b1.size * 8) / dt / 1e6;
    d.textContent = down.toFixed(1) + " Mbps";

    const us = performance.now();
    const r2 = await fetch(
        "https://speed.cloudflare.com/__down?bytes=3000000", {
            cache: "no-store"
        }
    );
    await r2.blob();
    const ut = (performance.now() - us) / 1000;
    const up = (3000000 * 8) / ut / 1e6;
    u.textContent = up.toFixed(1) + " Mbps";
}

function openWindow(windowId) {
    const win = document.getElementById(windowId + "-window");
    win.classList.remove("minimizing");
    void win.offsetWidth;

    win.classList.add("active");

    if (!state.openWindows.includes(windowId)) {
        state.openWindows.push(windowId);
        addTaskbarApp(windowId);
    }

    bringToFront(windowId);
    if (state.startMenuOpen) toggleStartMenu();

    if (window.innerWidth <= 768) {
        win.style.pointerEvents = 'none';
        setTimeout(() => {
            win.style.pointerEvents = 'auto';
        }, 350);
    }
}

function closeWindow(windowId) {
    const win = document.getElementById(windowId + "-window");
    win.classList.add("minimizing");

    setTimeout(() => {
        win.classList.remove("active", "minimizing");
    }, 300);

    state.openWindows = state.openWindows.filter((id) => id !== windowId);
    removeTaskbarApp(windowId);
}

function minimizeWindow(windowId) {
    const win = document.getElementById(windowId + "-window");
    win.classList.add("minimizing");

    setTimeout(() => {
        win.classList.remove("active", "minimizing");
    }, 300);
}

function openprojectsWindow(title, desc, meta, image, projectUrl) {
    document.getElementById('projectdetail-name').textContent = title;
    document.getElementById('projectdetail-desc').textContent = desc;
    document.getElementById('projectdetail-meta').textContent = meta;
    document.getElementById('projectdetail-img').src = image;
    document.getElementById('projectdetail-title').textContent = title;
    document.getElementById('projectdetail-url').href = projectUrl || '#';
    openWindow('projectdetail');
}

function bringToFront(windowId) {
    document.querySelectorAll(".window").forEach((w) => {
        w.style.zIndex = "1000";
    });
    document.getElementById(windowId + "-window").style.zIndex = "1001";

    document.querySelectorAll(".taskbar-app").forEach((app) => {
        app.classList.remove("active");
    });
    const taskbarApp = document.querySelector(`[data-window="${windowId}"]`);
    if (taskbarApp) taskbarApp.classList.add("active");
}

function addTaskbarApp(windowId) {
    const appNames = {
        mypc: "My PC",
        resume: "Resume",
        email: "Mail",
        education: "Education",
        favorites: "Favorites",
        projects: "Projects",
        favdetail: "Details",
        projectdetail: "Project Details"
    };

    const icons = {
        mypc: `<svg class="taskbar-app-icon" viewBox="0 0 24 24" fill="#0078d4"><path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>`,
        education: `<svg class="taskbar-app-icon" viewBox="0 0 24 24" fill="#0078d4">
<path d="M12 2L1 7l11 5 9-4.09V17h2V7L12 2z"/>
</svg>`,
        email: `<svg class="taskbar-app-icon" viewBox="0 0 24 24" fill="#0078d4"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
        resume: `<svg class="taskbar-app-icon" viewBox="0 0 24 24" fill="#0078d4"><path d="M9 2h6a2 2 0 0 1 2 2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2-2zm0 2v2h6V4H9zm10 4H5v12h14V8z"/></svg>`,
        favorites: `<svg class="taskbar-app-icon" viewBox="0 0 24 24" fill="#e91e63"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
        favdetail: `<svg class="taskbar-app-icon" viewBox="0 0 24 24" fill="#e91e63"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
        projects: `<svg class="taskbar-app-icon" viewBox="0 0 24 24" fill="#8b5cf6"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
        projectdetail: `<svg class="taskbar-app-icon" viewBox="0 0 24 24" fill="#8b5cf6"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
    };

    const taskbarApps = document.getElementById("taskbar-apps");
    const app = document.createElement("div");
    app.className = "taskbar-app active";
    app.setAttribute("data-window", windowId);
    app.innerHTML =
        icons[windowId] +
        `<span class="taskbar-app-label">${appNames[windowId]}</span>`;
    app.onclick = () => {
        const win = document.getElementById(windowId + "-window");
        if (win.classList.contains("active")) {
            minimizeWindow(windowId);
        } else {
            openWindow(windowId);
        }
    };
    taskbarApps.appendChild(app);
}

function removeTaskbarApp(windowId) {
    const app = document.querySelector(`[data-window="${windowId}"]`);
    if (app) app.remove();
}

function initWindows() {
    const windows = document.querySelectorAll(".window");
    windows.forEach((win) => {
        const titlebar = win.querySelector(".window-titlebar");
        let isDragging = false;
        let currentX, currentY, initialX, initialY;
        titlebar.addEventListener("mousedown", (e) => {
            if (e.target.closest(".window-btn")) return;
            isDragging = true;
            initialX = e.clientX - win.offsetLeft;
            initialY = e.clientY - win.offsetTop;
            bringToFront(win.id.replace("-window", ""));
        });

        document.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            currentX = Math.max(
                0,
                Math.min(currentX, window.innerWidth - win.offsetWidth),
            );
            currentY = Math.max(
                0,
                Math.min(currentY, window.innerHeight - win.offsetHeight),
            );

            win.style.left = currentX + "px";
            win.style.top = currentY + "px";
        });

        document.addEventListener("mouseup", () => {
            isDragging = false;
        });
        titlebar.addEventListener("touchstart", (e) => {
            if (e.target.closest(".window-btn")) return;
            const touch = e.touches[0];
            isDragging = true;
            initialX = touch.clientX - win.offsetLeft;
            initialY = touch.clientY - win.offsetTop;
            bringToFront(win.id.replace("-window", ""));
        });

        document.addEventListener(
            "touchmove",
            (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const touch = e.touches[0];
                currentX = touch.clientX - initialX;
                currentY = touch.clientY - initialY;
                currentX = Math.max(
                    0,
                    Math.min(currentX, window.innerWidth - win.offsetWidth),
                );
                currentY = Math.max(
                    0,
                    Math.min(currentY, window.innerHeight - win.offsetHeight),
                );

                win.style.left = currentX + "px";
                win.style.top = currentY + "px";
            }, {
                passive: false
            },
        );

        document.addEventListener("touchend", () => {
            isDragging = false;
        });
    });
}

async function sendEmail() {
    const btn = document.querySelector(".send-btn");
    const status = document.getElementById("email-status");

    const payload = {
        email: document.getElementById("sender-email").value.trim(),
        subject: document.getElementById("email-subject").value.trim(),
        message: document.getElementById("email-body").value.trim(),
        source: "portfolio-x"
    };

    if (!payload.email || !payload.message) {
        status.className = "email-status error";
        status.textContent = "Sender email and message required";
        return;
    }

    btn.disabled = true;
    btn.textContent = "Sending...";
    status.style.display = "none";

    try {
        const res = await fetch(CONFIG.api.mailEndpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("API error");

        status.className = "email-status success";
        status.textContent = "✓ Message sent successfully!";
    } catch (err) {
        status.className = "email-status error";
        status.textContent = "✕ Failed to send message";
    } finally {
        status.style.display = "block";
        btn.disabled = false;
        btn.innerHTML = `
<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"
style="vertical-align: middle; margin-right: 8px;">
<path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
</svg>
Send
`;
    }
}

function switchFavTab(tab) {
    document
        .querySelectorAll(".fav-tab")
        .forEach((t) => t.classList.remove("active"));
    event.target.classList.add("active");
    document
        .querySelectorAll('[id^="fav-content-"]')
        .forEach((c) => (c.style.display = "none"));
    document.getElementById("fav-content-" + tab).style.display = "block";
}
document.addEventListener("click", (e) => {
    if (!e.target.closest("#start-menu") && !e.target.closest(".start-btn")) {
        if (state.startMenuOpen) {
            const menu = document.getElementById("start-menu");
            menu.classList.remove("open");
            state.startMenuOpen = false;
        }
    }
    if (
        !e.target.closest("#wifi-panel") &&
        !e.target.closest('[onclick="toggleWifiPanel()"]')
    ) {
        if (state.wifiPanelOpen) {
            const panel = document.getElementById("wifi-panel");
            panel.classList.remove("open");
            state.wifiPanelOpen = false;
        }
    }
});
