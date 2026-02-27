/**
 * AudioEngine — Core synchronized dual-track playback using Web Audio API.
 *
 * Both tracks play simultaneously through the same AudioContext.
 * GainNodes control which track is audible (instant toggle).
 * A requestAnimationFrame loop keeps the two media elements in sync.
 */
window.AudioEngine = (function () {
    var audioCtx = null;
    var masterGain = null;

    // Per-slot state
    var slots = {
        A: { element: null, sourceNode: null, gainNode: null, blobUrl: null },
        B: { element: null, sourceNode: null, gainNode: null, blobUrl: null }
    };

    var activeTrack = 'A'; // which track is currently audible
    var isPlaying = false;
    var isLooping = false;
    var syncRAF = null;
    var SYNC_THRESHOLD = 0.02; // 20ms — tight enough for small offsets

    // Trim boundaries (managed by TrimController, consumed here)
    var trimStart = 0;
    var trimEnd = Infinity;

    // Track offset in seconds (positive = B starts later, negative = B starts earlier)
    var trackOffset = 0;

    // Callbacks
    var onTimeUpdate = null;
    var onEnded = null;
    var onToggle = null;

    function init() {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.connect(audioCtx.destination);
    }

    function resumeContext() {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function loadTrack(slot, mediaElement) {
        var s = slots[slot];

        // Clean up previous track in this slot
        if (s.sourceNode) {
            try { s.sourceNode.disconnect(); } catch (e) {}
        }
        if (s.blobUrl) {
            URL.revokeObjectURL(s.blobUrl);
        }

        // Store element
        s.element = mediaElement;

        // Create Web Audio graph: element -> source -> gain -> masterGain
        s.sourceNode = audioCtx.createMediaElementSource(mediaElement);
        s.gainNode = audioCtx.createGain();
        s.sourceNode.connect(s.gainNode);
        s.gainNode.connect(masterGain);

        // Set initial gain
        var now = audioCtx.currentTime;
        if (slot === 'A') {
            s.gainNode.gain.setValueAtTime(activeTrack === 'A' ? 1 : 0, now);
        } else {
            s.gainNode.gain.setValueAtTime(activeTrack === 'B' ? 1 : 0, now);
        }

        // Stall recovery: if one element stalls, pause the other
        mediaElement.addEventListener('waiting', handleStall);
        mediaElement.addEventListener('playing', handleResume);
        mediaElement.addEventListener('ended', handleEnded);
    }

    function handleStall() {
        // If one track stalls while playing, pause the other to keep sync
        if (!isPlaying) return;
        var elA = slots.A.element;
        var elB = slots.B.element;
        if (elA && !elA.paused && elB && !elB.paused) {
            // Don't pause — just let the sync loop correct when both resume
        }
    }

    function handleResume() {
        // When a stalled track resumes, the sync loop handles re-alignment
    }

    function handleEnded() {
        if (isLooping) {
            seek(trimStart);
            play();
        } else {
            pause();
            if (onEnded) onEnded();
        }
    }

    function isReady() {
        return slots.A.element !== null && slots.B.element !== null;
    }

    var CROSSFADE_TIME = 0.01; // 10ms crossfade to mask toggle gaps

    function toggle() {
        if (!isReady()) return activeTrack;
        resumeContext();

        var elA = slots.A.element;
        var elB = slots.B.element;

        // Force-sync the inactive track before switching so it's at the right position
        if (activeTrack === 'A') {
            // B is about to become audible — snap it to A's position + offset
            var targetB = Math.max(0, elA.currentTime + trackOffset);
            if (Math.abs(elB.currentTime - targetB) > 0.005) {
                elB.currentTime = targetB;
            }
            // If B stalled, make sure it's playing
            if (isPlaying && elB.paused) {
                elB.play();
            }
        } else {
            // A is about to become audible — snap it to B's position - offset
            var targetA = Math.max(0, elB.currentTime - trackOffset);
            if (Math.abs(elA.currentTime - targetA) > 0.005) {
                elA.currentTime = targetA;
            }
            if (isPlaying && elA.paused) {
                elA.play();
            }
        }

        // Crossfade over 10ms to mask any micro-gap while media element catches up
        var now = audioCtx.currentTime;
        if (activeTrack === 'A') {
            slots.A.gainNode.gain.setValueAtTime(1, now);
            slots.A.gainNode.gain.linearRampToValueAtTime(0, now + CROSSFADE_TIME);
            slots.B.gainNode.gain.setValueAtTime(0, now);
            slots.B.gainNode.gain.linearRampToValueAtTime(1, now + CROSSFADE_TIME);
            activeTrack = 'B';
        } else {
            slots.A.gainNode.gain.setValueAtTime(0, now);
            slots.A.gainNode.gain.linearRampToValueAtTime(1, now + CROSSFADE_TIME);
            slots.B.gainNode.gain.setValueAtTime(1, now);
            slots.B.gainNode.gain.linearRampToValueAtTime(0, now + CROSSFADE_TIME);
            activeTrack = 'A';
        }

        if (onToggle) onToggle(activeTrack);
        return activeTrack;
    }

    function play() {
        if (!isReady()) return;
        resumeContext();

        var elA = slots.A.element;
        var elB = slots.B.element;

        // Ensure we start within trim bounds
        if (elA.currentTime < trimStart || elA.currentTime >= trimEnd) {
            elA.currentTime = trimStart;
        }

        // Always align B to A + offset before starting playback
        var targetB = Math.max(0, elA.currentTime + trackOffset);
        if (Math.abs(elB.currentTime - targetB) > 0.001) {
            elB.currentTime = targetB;
        }

        elA.play();
        elB.play();
        isPlaying = true;
        startSyncLoop();
    }

    function pause() {
        if (!isReady()) return;
        slots.A.element.pause();
        slots.B.element.pause();
        isPlaying = false;
        stopSyncLoop();
    }

    function stop() {
        pause();
        seek(trimStart);
    }

    function seek(time) {
        if (!isReady()) return;

        // Clamp to trim range
        time = Math.max(trimStart, Math.min(getEffectiveDuration(), time));

        slots.A.element.currentTime = time;
        slots.B.element.currentTime = Math.max(0, time + trackOffset);

        if (onTimeUpdate) onTimeUpdate(time, getDuration());
    }

    function getDuration() {
        if (!slots.A.element) return 0;
        var dA = slots.A.element.duration || 0;
        var dB = slots.B.element ? (slots.B.element.duration || 0) : dA;
        return Math.min(dA, dB);
    }

    function getEffectiveDuration() {
        var dur = getDuration();
        return trimEnd < dur ? trimEnd : dur;
    }

    function getCurrentTime() {
        if (!slots.A.element) return 0;
        return slots.A.element.currentTime || 0;
    }

    function getIsPlaying() {
        return isPlaying;
    }

    function getActiveTrack() {
        return activeTrack;
    }

    function setVolume(value) {
        // value: 0–1
        if (masterGain) {
            masterGain.gain.setValueAtTime(value, audioCtx.currentTime);
        }
    }

    function setLooping(loop) {
        isLooping = loop;
    }

    function getLooping() {
        return isLooping;
    }

    function setTrimStart(time) {
        trimStart = time;
    }

    function setTrimEnd(time) {
        trimEnd = time;
    }

    function getTrimStart() {
        return trimStart;
    }

    function getTrimEnd() {
        return trimEnd;
    }

    function getAudioContext() {
        return audioCtx;
    }

    function setTrackOffset(ms) {
        trackOffset = ms / 1000; // store as seconds
        // Immediately correct B's position if both tracks are loaded
        if (isReady()) {
            var elB = slots.B.element;
            var elA = slots.A.element;
            elB.currentTime = Math.max(0, elA.currentTime + trackOffset);
        }
    }

    function getTrackOffset() {
        return trackOffset * 1000; // return as ms
    }

    // --- Sync loop ---

    function startSyncLoop() {
        if (syncRAF) return;
        syncTick();
    }

    function stopSyncLoop() {
        if (syncRAF) {
            cancelAnimationFrame(syncRAF);
            syncRAF = null;
        }
    }

    function syncTick() {
        if (!isPlaying) {
            syncRAF = null;
            return;
        }

        var elA = slots.A.element;
        var elB = slots.B.element;

        if (elA && elB) {
            // Drift correction: snap B to A (with offset)
            var targetBTime = elA.currentTime + trackOffset;
            var drift = Math.abs(elB.currentTime - targetBTime);
            if (drift > SYNC_THRESHOLD) {
                elB.currentTime = Math.max(0, targetBTime);
            }

            // Keep both elements actually playing — browsers can stall the silent one
            if (elA.paused && !elA.ended) elA.play();
            if (elB.paused && !elB.ended) elB.play();

            // Trim enforcement
            var currentTime = elA.currentTime;
            var effectiveEnd = getEffectiveDuration();

            if (currentTime >= effectiveEnd) {
                if (isLooping) {
                    seek(trimStart);
                    elA.play();
                    elB.play();
                } else {
                    pause();
                    if (onEnded) onEnded();
                }
            }

            if (onTimeUpdate) onTimeUpdate(currentTime, getDuration());
        }

        syncRAF = requestAnimationFrame(syncTick);
    }

    // --- Event hooks ---

    function setOnTimeUpdate(cb) { onTimeUpdate = cb; }
    function setOnEnded(cb) { onEnded = cb; }
    function setOnToggle(cb) { onToggle = cb; }

    return {
        init: init,
        loadTrack: loadTrack,
        isReady: isReady,
        toggle: toggle,
        play: play,
        pause: pause,
        stop: stop,
        seek: seek,
        getDuration: getDuration,
        getEffectiveDuration: getEffectiveDuration,
        getCurrentTime: getCurrentTime,
        getIsPlaying: getIsPlaying,
        getActiveTrack: getActiveTrack,
        setVolume: setVolume,
        setLooping: setLooping,
        getLooping: getLooping,
        setTrimStart: setTrimStart,
        setTrimEnd: setTrimEnd,
        getTrimStart: getTrimStart,
        getTrimEnd: getTrimEnd,
        setOnTimeUpdate: setOnTimeUpdate,
        setOnEnded: setOnEnded,
        setOnToggle: setOnToggle,
        resumeContext: resumeContext,
        getAudioContext: getAudioContext,
        setTrackOffset: setTrackOffset,
        getTrackOffset: getTrackOffset
    };
})();
