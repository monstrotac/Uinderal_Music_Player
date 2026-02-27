/**
 * UIControls — Transport buttons, volume slider, toggle button, and keyboard shortcuts.
 */
window.UIControls = (function () {
    var playBtn = null;
    var stopBtn = null;
    var loopBtn = null;
    var toggleBtn = null;
    var volumeSlider = null;
    var toggleSideA = null;
    var toggleSideB = null;
    var playIcon = null;

    var PAUSE_SVG = '<rect x="5" y="3" width="5" height="18" rx="1" fill="currentColor"/><rect x="14" y="3" width="5" height="18" rx="1" fill="currentColor"/>';
    var PLAY_SVG = '<polygon points="6,3 20,12 6,21" fill="currentColor"/>';

    function init() {
        playBtn = document.getElementById('btn-play');
        stopBtn = document.getElementById('btn-stop');
        loopBtn = document.getElementById('btn-loop');
        toggleBtn = document.getElementById('track-toggle');
        volumeSlider = document.getElementById('volume-slider');
        toggleSideA = document.getElementById('toggle-label-a');
        toggleSideB = document.getElementById('toggle-label-b');
        playIcon = document.getElementById('play-icon');

        setupButtons();
        setupVolume();
        setupKeyboard();
    }

    function setupButtons() {
        if (playBtn) {
            playBtn.addEventListener('click', function () {
                AudioEngine.resumeContext();
                if (AudioEngine.getIsPlaying()) {
                    AudioEngine.pause();
                    updatePlayButton(false);
                } else {
                    AudioEngine.play();
                    updatePlayButton(true);
                }
            });
        }

        if (stopBtn) {
            stopBtn.addEventListener('click', function () {
                AudioEngine.stop();
                updatePlayButton(false);
            });
        }

        if (loopBtn) {
            loopBtn.addEventListener('click', function () {
                var newState = !AudioEngine.getLooping();
                AudioEngine.setLooping(newState);
                loopBtn.classList.toggle('active', newState);
            });
        }

        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                var active = AudioEngine.toggle();
                updateToggleUI(active);
            });
        }
    }

    function setupVolume() {
        if (!volumeSlider) return;
        volumeSlider.addEventListener('input', function () {
            var value = parseInt(volumeSlider.value, 10) / 100;
            AudioEngine.setVolume(value);
        });
    }

    function setupKeyboard() {
        document.addEventListener('keydown', function (e) {
            // Don't intercept if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (!AudioEngine.isReady()) return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    AudioEngine.resumeContext();
                    if (AudioEngine.getIsPlaying()) {
                        AudioEngine.pause();
                        updatePlayButton(false);
                    } else {
                        AudioEngine.play();
                        updatePlayButton(true);
                    }
                    break;

                case 'KeyT':
                    e.preventDefault();
                    var active = AudioEngine.toggle();
                    updateToggleUI(active);
                    break;

                case 'ArrowLeft':
                    e.preventDefault();
                    AudioEngine.seek(AudioEngine.getCurrentTime() - 5);
                    break;

                case 'ArrowRight':
                    e.preventDefault();
                    AudioEngine.seek(AudioEngine.getCurrentTime() + 5);
                    break;

                case 'KeyM':
                    e.preventDefault();
                    if (volumeSlider) {
                        var current = parseInt(volumeSlider.value, 10);
                        if (current > 0) {
                            volumeSlider._previousValue = current;
                            volumeSlider.value = 0;
                            AudioEngine.setVolume(0);
                        } else {
                            volumeSlider.value = volumeSlider._previousValue || 100;
                            AudioEngine.setVolume((volumeSlider._previousValue || 100) / 100);
                        }
                    }
                    break;

                case 'Equal':
                case 'NumpadAdd':
                    e.preventDefault();
                    Waveform.zoomBy(2);
                    break;

                case 'Minus':
                case 'NumpadSubtract':
                    e.preventDefault();
                    Waveform.zoomBy(0.5);
                    break;

                case 'Digit0':
                case 'Numpad0':
                    e.preventDefault();
                    Waveform.resetZoom();
                    break;
            }
        });
    }

    function updatePlayButton(playing) {
        if (!playIcon) return;
        playIcon.innerHTML = playing ? PAUSE_SVG : PLAY_SVG;
    }

    function updateToggleUI(activeTrack) {
        if (toggleSideA) toggleSideA.classList.toggle('active', activeTrack === 'A');
        if (toggleSideB) toggleSideB.classList.toggle('active', activeTrack === 'B');

        // Update video labels
        if (window.VideoManager) {
            VideoManager.updateActiveTrack(activeTrack);
        }
    }

    // Called by AudioEngine when playback ends
    function onPlaybackEnded() {
        updatePlayButton(false);
    }

    return {
        init: init,
        updatePlayButton: updatePlayButton,
        updateToggleUI: updateToggleUI,
        onPlaybackEnded: onPlaybackEnded
    };
})();
