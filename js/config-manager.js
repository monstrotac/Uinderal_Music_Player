/**
 * ConfigManager — Save and load per-song configurations as JSON files.
 *
 * Stores: track offset, trim start/end, volume, loop state, and filenames for identification.
 * Uses the browser's download and file picker APIs.
 */
window.ConfigManager = (function () {
    var saveBtn = null;
    var loadBtn = null;
    var loadInput = null;
    var configNameDisplay = null;

    // Track the loaded file names for identification
    var fileNames = { A: '', B: '' };

    function init() {
        saveBtn = document.getElementById('btn-save-config');
        loadBtn = document.getElementById('btn-load-config');
        loadInput = document.getElementById('config-file-input');
        configNameDisplay = document.getElementById('config-name-display');

        if (saveBtn) {
            saveBtn.addEventListener('click', saveConfig);
        }

        if (loadBtn && loadInput) {
            loadBtn.addEventListener('click', function () {
                loadInput.click();
            });

            loadInput.addEventListener('change', function (e) {
                if (e.target.files && e.target.files[0]) {
                    loadConfigFile(e.target.files[0]);
                    // Reset so re-loading same file triggers change
                    loadInput.value = '';
                }
            });
        }
    }

    function setFileName(slot, name) {
        fileNames[slot] = name || '';
    }

    function getFileName(slot) {
        return fileNames[slot];
    }

    /**
     * Gather current settings into a config object.
     */
    function gatherConfig() {
        var config = {
            version: 1,
            savedAt: new Date().toISOString(),
            files: {
                A: fileNames.A,
                B: fileNames.B
            },
            trackOffsetMs: AudioEngine.getTrackOffset(),
            trimStart: AudioEngine.getTrimStart(),
            trimEnd: AudioEngine.getTrimEnd(),
            volume: document.getElementById('volume-slider')
                ? parseInt(document.getElementById('volume-slider').value, 10)
                : 100,
            looping: AudioEngine.getLooping()
        };

        return config;
    }

    /**
     * Download current config as a JSON file.
     */
    function saveConfig() {
        if (!AudioEngine.isReady()) {
            alert('Load both tracks before saving a configuration.');
            return;
        }

        var config = gatherConfig();

        // Generate a filename from the track names
        var nameA = stripExt(fileNames.A) || 'trackA';
        var nameB = stripExt(fileNames.B) || 'trackB';
        var fileName = sanitizeFilename(nameA + '_' + nameB) + '.dtp.json';

        var json = JSON.stringify(config, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);

        var link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showConfigName('Saved: ' + fileName);
    }

    /**
     * Load a config from a JSON file.
     */
    function loadConfigFile(file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            try {
                var config = JSON.parse(e.target.result);
                applyConfig(config);
                showConfigName('Loaded: ' + file.name);
            } catch (err) {
                alert('Invalid config file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    /**
     * Apply a config object to the current player state.
     */
    function applyConfig(config) {
        if (!config || config.version !== 1) {
            alert('Unrecognized config format.');
            return;
        }

        // Warn if filenames don't match
        var mismatch = false;
        if (config.files) {
            if (config.files.A && fileNames.A && config.files.A !== fileNames.A) {
                mismatch = true;
            }
            if (config.files.B && fileNames.B && config.files.B !== fileNames.B) {
                mismatch = true;
            }
        }

        if (mismatch) {
            var proceed = confirm(
                'This config was saved for different files:\n' +
                '  A: ' + (config.files.A || '(none)') + '\n' +
                '  B: ' + (config.files.B || '(none)') + '\n\n' +
                'Current files:\n' +
                '  A: ' + (fileNames.A || '(none)') + '\n' +
                '  B: ' + (fileNames.B || '(none)') + '\n\n' +
                'Apply anyway?'
            );
            if (!proceed) return;
        }

        // Apply track offset
        if (typeof config.trackOffsetMs === 'number') {
            AudioEngine.setTrackOffset(config.trackOffsetMs);

            // Update waveform visual offset to match
            if (window.Waveform && window.Waveform.setOffsetFromMs) {
                Waveform.setOffsetFromMs(config.trackOffsetMs);
            }
        }

        // Apply trim
        if (typeof config.trimStart === 'number') {
            AudioEngine.setTrimStart(config.trimStart);
        }
        if (typeof config.trimEnd === 'number') {
            AudioEngine.setTrimEnd(config.trimEnd);
        }

        // Update TrimController visuals
        if (window.TrimController && window.TrimController.applyConfig) {
            TrimController.applyConfig(config.trimStart, config.trimEnd);
        }

        // Apply volume
        if (typeof config.volume === 'number') {
            var slider = document.getElementById('volume-slider');
            if (slider) {
                slider.value = config.volume;
                AudioEngine.setVolume(config.volume / 100);
            }
        }

        // Apply loop state
        if (typeof config.looping === 'boolean') {
            AudioEngine.setLooping(config.looping);
            var loopBtn = document.getElementById('btn-loop');
            if (loopBtn) loopBtn.classList.toggle('active', config.looping);
        }
    }

    function showConfigName(text) {
        if (configNameDisplay) {
            configNameDisplay.textContent = text;
            configNameDisplay.classList.remove('hidden');

            // Fade out after 5 seconds
            clearTimeout(configNameDisplay._fadeTimer);
            configNameDisplay._fadeTimer = setTimeout(function () {
                configNameDisplay.classList.add('fade-out');
                setTimeout(function () {
                    configNameDisplay.classList.remove('fade-out');
                    configNameDisplay.classList.add('hidden');
                }, 500);
            }, 5000);
        }
    }

    function stripExt(name) {
        if (!name) return '';
        return name.replace(/\.[^.]+$/, '');
    }

    function sanitizeFilename(name) {
        return name.replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 80);
    }

    return {
        init: init,
        setFileName: setFileName,
        getFileName: getFileName,
        saveConfig: saveConfig,
        applyConfig: applyConfig
    };
})();
