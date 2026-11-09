function drawAerialBackground() {
    const canvas = document.getElementById('aerialCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#c0c0c0');
    gradient.addColorStop(0.5, '#a8a8a8');
    gradient.addColorStop(1, '#b5b5b5');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 15000; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const size = Math.random() * 2;
        const brightness = Math.random() * 100 + 100;
        ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, ${Math.random() * 0.4})`;
        ctx.fillRect(x, y, size, size);
    }
    ctx.strokeStyle = 'rgba(230, 230, 230, 0.8)';
    ctx.lineWidth = 40;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(canvas.width * 0.2, 0);
    ctx.quadraticCurveTo(canvas.width * 0.35, canvas.height * 0.3, canvas.width * 0.45, canvas.height * 0.5);
    ctx.quadraticCurveTo(canvas.width * 0.5, canvas.height * 0.7, canvas.width * 0.6, canvas.height);
    ctx.stroke();
    for (let i = 0; i < 25; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const radius = Math.random() * 80 + 40;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, 'rgba(80, 80, 80, 0.5)');
        grad.addColorStop(1, 'rgba(80, 80, 80, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    ctx.strokeStyle = 'rgba(60, 60, 60, 0.6)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        const startX = Math.random() * canvas.width;
        const startY = Math.random() * canvas.height;
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX + Math.random() * 300 - 150, startY + Math.random() * 300 - 150);
        ctx.stroke();
    }
    for (let i = 0; i < 12; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const w = Math.random() * 15 + 8;
        const h = Math.random() * 20 + 10;
        ctx.fillStyle = `rgba(70, 70, 70, 0.7)`;
        ctx.fillRect(x, y, w, h);
    }
    for (let i = 0; i < 8000; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const brightness = Math.random() * 255;
        ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, 0.15)`;
        ctx.fillRect(x, y, 1, 1);
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', drawAerialBackground);
} else {
    drawAerialBackground();
}

window.addEventListener('resize', drawAerialBackground);