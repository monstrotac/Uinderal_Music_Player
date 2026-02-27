/**
 * App — Main entry point. Initializes all modules and wires them together.
 */
(function () {
    var tracksLoaded = { A: false, B: false };
    var filesForWaveform = { A: null, B: null };

    window.addEventListener('DOMContentLoaded', function () {
        // Initialize core audio engine
        AudioEngine.init();

        // Initialize video manager
        VideoManager.init();

        // Initialize config manager
        ConfigManager.init();

        // Initialize file loader with callback
        FileLoader.init({
            onTrackLoaded: function (slot, mediaElement, fileInfo) {
                tracksLoaded[slot] = true;
                filesForWaveform[slot] = fileInfo.file;

                // Store filename (and path if available) for config identification
                ConfigManager.setFileName(slot, fileInfo.name, fileInfo.path);

                // Connect to audio engine
                AudioEngine.loadTrack(slot, mediaElement);

                // If video, register with video manager
                if (fileInfo.type === 'video') {
                    VideoManager.addVideo(slot, mediaElement);
                } else {
                    // Remove any existing video for this slot (if replacing video with audio)
                    VideoManager.removeVideo(slot);
                }

                // Start loading waveform for this track immediately
                if (fileInfo.file) {
                    Waveform.loadTrack(slot, fileInfo.file);
                }

                // If both tracks are loaded, show the player UI
                if (tracksLoaded.A && tracksLoaded.B) {
                    showPlayerUI();
                }
            }
        });

        // Initialize UI controls (button handlers, keyboard shortcuts)
        UIControls.init();

        // Wire up engine callbacks
        AudioEngine.setOnTimeUpdate(function (currentTime, duration) {
            Timeline.updateDisplay(currentTime, duration);
            Waveform.updatePlayhead(currentTime, duration);
        });

        AudioEngine.setOnEnded(function () {
            UIControls.onPlaybackEnded();
        });

        AudioEngine.setOnToggle(function (activeTrack) {
            UIControls.updateToggleUI(activeTrack);
        });
    });

    function showPlayerUI() {
        var duration = AudioEngine.getDuration();

        // Show sections FIRST so elements have real dimensions for canvas sizing
        show('toggle-section');
        show('timeline-section');
        show('transport-section');
        show('config-section');

        // Make file loader compact
        var loaderSection = document.getElementById('file-loader-section');
        if (loaderSection) loaderSection.classList.add('compact');

        // Initialize AFTER sections are visible (canvas needs real getBoundingClientRect)
        Timeline.init(duration);
        TrimController.init(duration);
        Waveform.init(duration);

        // Apply any config that was loaded before tracks were ready
        ConfigManager.applyPendingConfig();
    }

    function show(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    }
})();
