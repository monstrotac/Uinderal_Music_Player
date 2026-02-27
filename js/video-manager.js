/**
 * VideoManager — Handles displaying video elements when video files are loaded.
 *
 * Manages the video container layout: single video, dual video, or no video.
 * Adds labels ("Instrumental" / "Vocals") with active-track highlighting.
 */
window.VideoManager = (function () {
    var container = null;
    var section = null;
    var videos = { A: null, B: null };
    var wrappers = { A: null, B: null };
    var labels = { A: null, B: null };

    function init() {
        container = document.getElementById('video-container');
        section = document.getElementById('video-section');
    }

    function addVideo(slot, videoElement) {
        if (!container || !section) init();

        // Remove existing video wrapper for this slot
        if (wrappers[slot]) {
            container.removeChild(wrappers[slot]);
        }

        // Create wrapper with label
        var wrapper = document.createElement('div');
        wrapper.className = 'video-wrapper';
        wrapper.setAttribute('data-slot', slot);

        var label = document.createElement('div');
        label.className = 'video-label';
        label.textContent = slot === 'A' ? 'Instrumental' : 'Vocals';

        // Highlight active track label
        if (AudioEngine.getActiveTrack() === slot) {
            label.classList.add('active');
        }

        wrapper.appendChild(videoElement);
        wrapper.appendChild(label);

        videos[slot] = videoElement;
        wrappers[slot] = wrapper;
        labels[slot] = label;

        // Insert in order (A before B)
        if (slot === 'A' && wrappers.B) {
            container.insertBefore(wrapper, wrappers.B);
        } else {
            container.appendChild(wrapper);
        }

        updateLayout();
        section.classList.remove('hidden');

        // Make the video element visible (it was in the hidden container)
        videoElement.style.display = '';
    }

    function removeVideo(slot) {
        if (wrappers[slot]) {
            container.removeChild(wrappers[slot]);
            wrappers[slot] = null;
            videos[slot] = null;
            labels[slot] = null;
        }
        updateLayout();

        // Hide section if no videos
        if (!videos.A && !videos.B) {
            section.classList.add('hidden');
        }
    }

    function updateLayout() {
        if (!container) return;
        var count = (videos.A ? 1 : 0) + (videos.B ? 1 : 0);
        container.classList.toggle('dual-video', count === 2);
    }

    function updateActiveTrack(activeSlot) {
        if (labels.A) {
            labels.A.classList.toggle('active', activeSlot === 'A');
        }
        if (labels.B) {
            labels.B.classList.toggle('active', activeSlot === 'B');
        }
    }

    function hasAnyVideo() {
        return videos.A !== null || videos.B !== null;
    }

    return {
        init: init,
        addVideo: addVideo,
        removeVideo: removeVideo,
        updateActiveTrack: updateActiveTrack,
        hasAnyVideo: hasAnyVideo
    };
})();
