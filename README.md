# Portfolio-X

A modern desktop-like interactive portfolio website built using **HTML, CSS, JavaScript, and Three.js**.
It looks and behaves like an operating system with draggable windows, customizable dock/desktop apps, a start menu, and an **interactive 3D mascot desktop assistant**.

This project is **fully static** and automatically deploys to **GitHub Pages**.

---

## ✨ Features

- **Windows-Style Desktop UI**: Draggable, minimizable windows, start menu, and taskbar.
- **Interactive 3D Mascot Assistant**:
  - Fully rigged 3D character rendered in real time with Three.js.
  - **23 dynamic animations**: Idle, walking, running, crouching/sneaking, flight, landing, sitting, stretching, thinking, observing, waving, pointing, clapping, victory, dance, and more.
  - **Dynamic Physics & World Navigation**: Mascot walks along the floor, sneaks to investigate, and flies smoothly to perched ledges on desktop icons and windows.
  - **Speech Bubble Dialogue System**: Responsive narrator voice with customizable quips for hovering icons, opening windows, clicking the mascot, idle chatter, and wandering.
  - **Headroom & Boundary Safe**: Built-in viewport collision clamping so the character stays cleanly within screen boundaries without clipping offscreen.
- **Interactive Apps**:
  - **My PC**: About me, biography, skills, and background.
  - **Projects**: Project showcase with tech tags, descriptions, and live preview modal.
  - **Resume Viewer**: PDF viewer with direct download capability.
  - **Education**: Interactive animated map powered by Leaflet.
  - **Email**: Contact message form with API integration.
  - **Favorites**: Media catalog with category tabs (Shows, Movies, Music).
  - **Social Links**: Direct links to GitHub, LinkedIn, Telegram, and Instagram.
- **Customizable via `config.js`**: Edit your personal information, projects, links, and mascot personality in one configuration file.
- **CI/CD Auto-Deployment**: Built-in GitHub Actions workflow to automatically deploy updates to GitHub Pages on every push.

---

## 🚀 Quick Start

1. Clone the repository:
   ```bash
   git clone https://github.com/StarkGang/PortfolioX.git
   cd PortfolioX
   ```

2. Run locally using any static file server:
   ```bash
   # Using Node.js
   node server.js

   # Or using Python
   python -m http.server 8000
   ```

3. Open `http://localhost:8000` in your browser.

---

## ⚙️ Configuration (`config.js`)

All portfolio content and mascot settings are configured in `config.js`:

```javascript
window.CONFIG = {
  personal: {
    name: "Jane Doe",
    age: "XX",
    location: "Your City, Country",
    email: "janedoe@email.com",
    profileImage: "img/icon.webp",
    avatarImage: "img/icon.webp"
  },
  // ... projects, favorites, social links
};

window.CONFIG.mascot = {
  model: 'assets/mascot/mascot.glb',
  voice: {
    speaker: '$ROOT',
    greeting: ["Hello! I'm watching the desktop."],
    idle: ["Quiet day on the desktop."],
    dance: ["Okay, one dance. Then back to work!"]
    // ... custom dialogue per icon and window
  }
};
```

---

## 🌐 Deployment to GitHub Pages

This repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically deploys pushes to GitHub Pages.

To enable GitHub Pages in your repository:
1. Navigate to **Settings** > **Pages** in your GitHub repository.
2. Under **Build and deployment** > **Source**, choose **GitHub Actions**.
3. Push to `main` or `mascot` to trigger the automated build and deployment.
