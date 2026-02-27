/**
 * Particles — Floating ember particles for the background.
 *
 * Creates a full-screen canvas behind all content with subtle
 * glowing red/orange particles drifting upward like embers.
 */
(function () {
    var canvas, ctx;
    var particles = [];
    var MAX_PARTICLES = 40;
    var animFrame = null;

    function init() {
        canvas = document.createElement('canvas');
        canvas.id = 'particle-canvas';
        canvas.style.cssText =
            'position:fixed;top:0;left:0;width:100%;height:100%;' +
            'pointer-events:none;z-index:0;opacity:0.7;';
        document.body.prepend(canvas);
        ctx = canvas.getContext('2d');

        resize();
        window.addEventListener('resize', resize);

        // Seed initial particles spread across the screen
        for (var i = 0; i < MAX_PARTICLES; i++) {
            particles.push(createParticle(true));
        }

        tick();
    }

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function createParticle(scatter) {
        var size = 1 + Math.random() * 2.5;
        return {
            x: Math.random() * canvas.width,
            y: scatter ? Math.random() * canvas.height : canvas.height + 10,
            size: size,
            speedY: -(0.4 + Math.random() * 1.0),
            speedX: (Math.random() - 0.5) * 0.3,
            drift: (Math.random() - 0.5) * 0.008,
            opacity: 0.15 + Math.random() * 0.45,
            fadeSpeed: 0.0002 + Math.random() * 0.0006,
            // Color: mix of red, orange, and warm white
            hue: 0 + Math.random() * 30,
            lightness: 45 + Math.random() * 20
        };
    }

    function tick() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (var i = particles.length - 1; i >= 0; i--) {
            var p = particles[i];

            // Update position
            p.x += p.speedX;
            p.y += p.speedY;
            p.speedX += p.drift;
            p.opacity -= p.fadeSpeed;

            // Slight wobble
            p.x += Math.sin(p.y * 0.02) * 0.15;

            // Remove dead or off-screen particles
            if (p.opacity <= 0 || p.y < -20 || p.x < -20 || p.x > canvas.width + 20) {
                particles.splice(i, 1);
                continue;
            }

            // Draw particle with glow
            ctx.save();
            ctx.globalAlpha = p.opacity;

            // Outer glow
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            ctx.fillStyle = 'hsla(' + p.hue + ', 80%, ' + p.lightness + '%, 0.15)';
            ctx.fill();

            // Core
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = 'hsla(' + p.hue + ', 90%, ' + (p.lightness + 15) + '%, 0.8)';
            ctx.fill();

            ctx.restore();
        }

        // Spawn new particles to maintain count
        while (particles.length < MAX_PARTICLES) {
            particles.push(createParticle(false));
        }

        animFrame = requestAnimationFrame(tick);
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
