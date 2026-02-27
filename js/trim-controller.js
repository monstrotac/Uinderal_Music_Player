/**
 * TrimController — Draggable trim markers on the timeline for cropping playback.
 *
 * Allows setting a start and end point. Playback is constrained within these bounds.
 */
window.TrimController = (function () {
    var startMarker = null;
    var endMarker = null;
    var overlayLeft = null;
    var overlayRight = null;
    var startInput = null;
    var endInput = null;
    var resetBtn = null;
    var timelineTrack = null;

    var duration = 0;
    var trimStart = 0;
    var trimEnd = 0;
    var isDragging = null; // 'start', 'end', or null
    var MIN_TRIM_GAP = 1; // minimum 1 second between markers

    function init(dur) {
        duration = dur;
        trimStart = 0;
        trimEnd = dur;

        startMarker = document.getElementById('trim-start-marker');
        endMarker = document.getElementById('trim-end-marker');
        overlayLeft = document.getElementById('trim-overlay-left');
        overlayRight = document.getElementById('trim-overlay-right');
        startInput = document.getElementById('trim-start-input');
        endInput = document.getElementById('trim-end-input');
        resetBtn = document.getElementById('trim-reset');
        timelineTrack = document.getElementById('timeline-track');

        // Show markers
        if (startMarker) startMarker.classList.add('visible');
        if (endMarker) endMarker.classList.add('visible');

        // Set initial positions
        updateVisuals();
        updateInputs();
        pushToEngine();

        setupDragging();
        setupReset();
    }

    function setupDragging() {
        if (startMarker) {
            startMarker.addEventListener('pointerdown', function (e) {
                e.stopPropagation();
                isDragging = 'start';
                startMarker.setPointerCapture(e.pointerId);
            });
        }

        if (endMarker) {
            endMarker.addEventListener('pointerdown', function (e) {
                e.stopPropagation();
                isDragging = 'end';
                endMarker.setPointerCapture(e.pointerId);
            });
        }

        document.addEventListener('pointermove', function (e) {
            if (!isDragging || !timelineTrack) return;

            var rect = timelineTrack.getBoundingClientRect();
            var ratio = (e.clientX - rect.left) / rect.width;
            ratio = Math.max(0, Math.min(1, ratio));
            var time = ratio * duration;

            if (isDragging === 'start') {
                if (time < trimEnd - MIN_TRIM_GAP && time >= 0) {
                    trimStart = time;
                }
            } else if (isDragging === 'end') {
                if (time > trimStart + MIN_TRIM_GAP && time <= duration) {
                    trimEnd = time;
                }
            }

            updateVisuals();
            updateInputs();
            pushToEngine();
        });

        document.addEventListener('pointerup', function () {
            isDragging = null;
        });

        document.addEventListener('pointercancel', function () {
            isDragging = null;
        });
    }

    function setupReset() {
        if (!resetBtn) return;
        resetBtn.addEventListener('click', function () {
            trimStart = 0;
            trimEnd = duration;
            updateVisuals();
            updateInputs();
            pushToEngine();
        });
    }

    function updateVisuals() {
        if (!duration) return;

        var startPct = (trimStart / duration) * 100;
        var endPct = (trimEnd / duration) * 100;

        if (startMarker) startMarker.style.left = startPct + '%';
        if (endMarker) endMarker.style.left = endPct + '%';
        if (overlayLeft) overlayLeft.style.width = startPct + '%';
        if (overlayRight) overlayRight.style.width = (100 - endPct) + '%';
    }

    function updateInputs() {
        if (startInput) startInput.value = formatTrimTime(trimStart);
        if (endInput) endInput.value = formatTrimTime(trimEnd);
    }

    function pushToEngine() {
        AudioEngine.setTrimStart(trimStart);
        AudioEngine.setTrimEnd(trimEnd);
    }

    function formatTrimTime(seconds) {
        if (!seconds || !isFinite(seconds)) return '0:00';
        var m = Math.floor(seconds / 60);
        var s = Math.floor(seconds % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    }

    function setDuration(dur) {
        duration = dur;
        trimEnd = dur;
        updateVisuals();
        updateInputs();
        pushToEngine();
    }

    function applyConfig(start, end) {
        if (typeof start === 'number' && isFinite(start)) trimStart = start;
        if (typeof end === 'number' && isFinite(end)) trimEnd = end;
        updateVisuals();
        updateInputs();
        pushToEngine();
    }

    function getTrimStart() { return trimStart; }
    function getTrimEnd() { return trimEnd; }

    return {
        init: init,
        setDuration: setDuration,
        applyConfig: applyConfig,
        getTrimStart: getTrimStart,
        getTrimEnd: getTrimEnd
    };
})();
