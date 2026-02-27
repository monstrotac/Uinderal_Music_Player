/**
 * Timeline — Progress bar with seeking and time display.
 */
window.Timeline = (function () {
    var container = null;
    var track = null;
    var progress = null;
    var playhead = null;
    var currentTimeEl = null;
    var durationEl = null;
    var duration = 0;
    var isDragging = false;

    function init(dur) {
        duration = dur;
        container = document.getElementById('timeline');
        track = document.getElementById('timeline-track');
        progress = document.getElementById('timeline-progress');
        playhead = document.getElementById('timeline-playhead');
        currentTimeEl = document.getElementById('current-time');
        durationEl = document.getElementById('duration');

        if (durationEl) {
            durationEl.textContent = formatTime(duration);
        }

        setupInteraction();
    }

    function setupInteraction() {
        if (!container) return;

        container.addEventListener('pointerdown', function (e) {
            // Ignore if clicking on trim markers
            if (e.target.classList.contains('trim-marker') || e.target.classList.contains('trim-end-marker')) return;

            isDragging = true;
            container.setPointerCapture(e.pointerId);
            seekToPointer(e);
        });

        container.addEventListener('pointermove', function (e) {
            if (!isDragging) return;
            seekToPointer(e);
        });

        container.addEventListener('pointerup', function () {
            isDragging = false;
        });

        container.addEventListener('pointercancel', function () {
            isDragging = false;
        });
    }

    function seekToPointer(e) {
        if (!track || !duration) return;
        var rect = track.getBoundingClientRect();
        var ratio = (e.clientX - rect.left) / rect.width;
        ratio = Math.max(0, Math.min(1, ratio));
        var time = ratio * duration;

        // Clamp to trim bounds
        var tStart = AudioEngine.getTrimStart();
        var tEnd = AudioEngine.getTrimEnd();
        var effectiveEnd = tEnd < duration ? tEnd : duration;
        time = Math.max(tStart, Math.min(effectiveEnd, time));

        AudioEngine.seek(time);
        updateDisplay(time, duration);
    }

    function updateDisplay(currentTime, dur) {
        if (dur && dur !== duration) {
            duration = dur;
            if (durationEl) durationEl.textContent = formatTime(duration);
        }

        if (!duration) return;

        var ratio = currentTime / duration;
        ratio = Math.max(0, Math.min(1, ratio));
        var pct = (ratio * 100) + '%';

        if (progress) progress.style.width = pct;
        if (playhead) playhead.style.left = pct;
        if (currentTimeEl) currentTimeEl.textContent = formatTime(currentTime);
    }

    function setDuration(dur) {
        duration = dur;
        if (durationEl) durationEl.textContent = formatTime(dur);
    }

    function formatTime(seconds) {
        if (!seconds || !isFinite(seconds)) return '0:00';
        var m = Math.floor(seconds / 60);
        var s = Math.floor(seconds % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    return {
        init: init,
        updateDisplay: updateDisplay,
        setDuration: setDuration,
        formatTime: formatTime
    };
})();
