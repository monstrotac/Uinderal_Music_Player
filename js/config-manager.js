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

    // Startup load button (visible before tracks are loaded)
    var startupLoadBtn = null;
    var startupInput = null;
    var pendingConfigDisplay = null;

    // Track the loaded file names/paths for identification and saving
    var fileNames = { A: '', B: '' };
    var filePaths = { A: '', B: '' };

    // Pending config: stored when loaded before tracks are ready
    var pendingConfig = null;

    function init() {
        saveBtn = document.getElementById('btn-save-config');
        loadBtn = document.getElementById('btn-load-config');
        loadInput = document.getElementById('config-file-input');
        configNameDisplay = document.getElementById('config-name-display');

        // Startup config loader
        startupLoadBtn = document.getElementById('btn-load-config-startup');
        pendingConfigDisplay = document.getElementById('pending-config-display');

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

        // Startup load button reuses the same config file input
        if (startupLoadBtn && loadInput) {
            startupLoadBtn.addEventListener('click', function () {
                loadInput.click();
            });
        }
    }

    function setFileName(slot, name, path) {
        fileNames[slot] = name || '';
        if (path) filePaths[slot] = path;
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
                A: filePaths.A || fileNames.A,
                B: filePaths.B || fileNames.B
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
                // Fix unescaped backslashes in Windows paths (e.g. J:\Core → J:\\Core)
                var text = e.target.result.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
                var config = JSON.parse(text);
                applyConfig(config);
                showConfigName('Loaded: ' + file.name);
            } catch (err) {
                alert('Invalid config file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    /**
     * Extract just the filename from a path (handles both / and \ separators).
     */
    function basename(path) {
        if (!path) return '';
        return path.replace(/^.*[\\\/]/, '');
    }

    /**
     * Apply a config object to the current player state.
     * If tracks aren't loaded yet, stores as pending config for later.
     */
    function applyConfig(config) {
        if (!config || config.version !== 1) {
            alert('Unrecognized config format.');
            return;
        }

        // If tracks aren't loaded yet, store as pending and try to auto-load from paths
        if (!AudioEngine.isReady()) {
            pendingConfig = config;

            // Try to auto-load files from paths in config (paths contain / or \)
            var hasPathA = config.files && config.files.A && (config.files.A.indexOf('/') !== -1 || config.files.A.indexOf('\\') !== -1);
            var hasPathB = config.files && config.files.B && (config.files.B.indexOf('/') !== -1 || config.files.B.indexOf('\\') !== -1);

            if (hasPathA && hasPathB && window.FileLoader && window.FileLoader.loadFromPath) {
                // Store the full paths so they're saved back later
                filePaths.A = config.files.A;
                filePaths.B = config.files.B;

                var errorShown = false;
                function onLoadError(reason) {
                    if (errorShown) return;
                    errorShown = true;
                    if (reason === 'file-protocol') {
                        showPendingConfigName('Config queued — use start.bat for auto-loading, or load tracks manually');
                    } else {
                        showPendingConfigName('Config queued — could not load files, load tracks manually');
                    }
                }

                showPendingConfigName('Loading files from config...');
                FileLoader.loadFromPath('A', config.files.A, onLoadError);
                FileLoader.loadFromPath('B', config.files.B, onLoadError);
            } else {
                showPendingConfigName('Config queued — load both tracks to apply');
            }
            return;
        }

        // Warn if filenames don't match (compare basenames only)
        var mismatch = false;
        if (config.files) {
            var configA = basename(config.files.A);
            var configB = basename(config.files.B);
            var currentA = basename(fileNames.A);
            var currentB = basename(fileNames.B);

            if (configA && currentA && configA !== currentA) {
                mismatch = true;
            }
            if (configB && currentB && configB !== currentB) {
                mismatch = true;
            }
        }

        if (mismatch) {
            var proceed = confirm(
                'This config was saved for different files:\n' +
                '  A: ' + basename(config.files.A || '') + '\n' +
                '  B: ' + basename(config.files.B || '') + '\n\n' +
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

    /**
     * Apply any pending config that was loaded before tracks were ready.
     * Called by app.js after both tracks are loaded.
     */
    function applyPendingConfig() {
        if (pendingConfig) {
            var config = pendingConfig;
            pendingConfig = null;
            hidePendingConfigName();
            applyConfig(config);
        }
    }

    function showPendingConfigName(text) {
        if (pendingConfigDisplay) {
            pendingConfigDisplay.textContent = text;
            pendingConfigDisplay.classList.remove('hidden');
        }
    }

    function hidePendingConfigName() {
        if (pendingConfigDisplay) {
            pendingConfigDisplay.classList.add('hidden');
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
        applyConfig: applyConfig,
        applyPendingConfig: applyPendingConfig
    };
})();
