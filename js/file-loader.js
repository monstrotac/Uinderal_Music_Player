/**
 * FileLoader — Handles drag-and-drop and file picker for both track slots.
 *
 * Creates <audio> or <video> elements from user-selected files,
 * sets them up with blob URLs, and fires a callback when loaded.
 */
window.FileLoader = (function () {
    var AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma'];
    var VIDEO_EXTENSIONS = ['mp4', 'webm', 'mkv', 'avi', 'mov'];

    var onTrackLoaded = null; // callback(slot, mediaElement, fileInfo)

    function init(options) {
        onTrackLoaded = options.onTrackLoaded || null;
        setupDropZone('A');
        setupDropZone('B');
    }

    function setupDropZone(slot) {
        var zoneId = slot === 'A' ? 'drop-zone-a' : 'drop-zone-b';
        var inputId = slot === 'A' ? 'file-input-a' : 'file-input-b';
        var zone = document.getElementById(zoneId);
        var input = document.getElementById(inputId);

        if (!zone || !input) return;

        // Click to browse
        zone.addEventListener('click', function (e) {
            if (e.target === input) return;
            input.click();
        });

        input.addEventListener('change', function () {
            if (input.files && input.files[0]) {
                handleFile(slot, input.files[0]);
            }
        });

        // Drag and drop
        zone.addEventListener('dragenter', function (e) {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragover', function (e) {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', function (e) {
            e.preventDefault();
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', function (e) {
            e.preventDefault();
            zone.classList.remove('drag-over');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFile(slot, e.dataTransfer.files[0]);
            }
        });
    }

    function getMediaType(file) {
        var ext = file.name.split('.').pop().toLowerCase();
        if (VIDEO_EXTENSIONS.indexOf(ext) !== -1) return 'video';
        if (AUDIO_EXTENSIONS.indexOf(ext) !== -1) return 'audio';
        // Fallback: check MIME type
        if (file.type && file.type.startsWith('video/')) return 'video';
        if (file.type && file.type.startsWith('audio/')) return 'audio';
        return null;
    }

    function getMediaTypeFromExt(ext) {
        ext = ext.toLowerCase();
        if (VIDEO_EXTENSIONS.indexOf(ext) !== -1) return 'video';
        if (AUDIO_EXTENSIONS.indexOf(ext) !== -1) return 'audio';
        return null;
    }

    /**
     * Load a track from a local file path.
     * Uses the local server API (/api/local-file) to fetch the file as a blob,
     * then passes it through the normal handleFile flow (blob URL = same-origin).
     * Only works when served via http:// (node server.js).
     */
    function loadFromPath(slot, filePath, onError) {
        var fileName = filePath.replace(/^.*[\\/]/, '');
        var ext = fileName.split('.').pop();
        var mediaType = getMediaTypeFromExt(ext);
        if (!mediaType) return;

        // Must be running on HTTP for the server API to work
        if (window.location.protocol === 'file:') {
            if (onError) onError('file-protocol');
            return;
        }

        var fetchUrl = '/api/local-file?path=' + encodeURIComponent(filePath);

        fetch(fetchUrl)
            .then(function (res) {
                if (!res.ok) throw new Error('Server returned ' + res.status);
                return res.blob();
            })
            .then(function (blob) {
                var file = new File([blob], fileName, { type: blob.type });
                handleFile(slot, file);
            })
            .catch(function (err) {
                console.warn('Could not auto-load from path: ' + filePath, err);
                if (onError) onError('fetch-failed');
            });
    }

    function handleFile(slot, file) {
        var mediaType = getMediaType(file);
        if (!mediaType) {
            alert('Unsupported file type: ' + file.name + '\n\nSupported: mp3, wav, ogg, flac, aac, mp4, webm');
            return;
        }

        // Create blob URL
        var blobUrl = URL.createObjectURL(file);

        // Create the appropriate element
        var element;
        if (mediaType === 'video') {
            element = document.createElement('video');
            element.playsInline = true;
        } else {
            element = document.createElement('audio');
        }

        element.preload = 'auto';
        element.src = blobUrl;

        // Store blob URL reference for cleanup
        element._blobUrl = blobUrl;
        element._fileName = file.name;
        element._mediaType = mediaType;

        // Wait for metadata to load
        element.addEventListener('loadedmetadata', function () {
            // Update the drop zone UI
            updateDropZoneUI(slot, file.name, mediaType);

            // Fire callback (pass the raw File for waveform decoding)
            if (onTrackLoaded) {
                onTrackLoaded(slot, element, {
                    name: file.name,
                    type: mediaType,
                    duration: element.duration,
                    file: file
                });
            }
        });

        element.addEventListener('error', function () {
            alert('Error loading file: ' + file.name + '\n\nThis format may not be supported by your browser.');
        });

        // Place element in hidden container so it exists in DOM
        var container = document.getElementById('media-elements');
        if (container) {
            // Remove any existing element for this slot
            var existing = container.querySelector('[data-slot="' + slot + '"]');
            if (existing) {
                container.removeChild(existing);
            }
            element.setAttribute('data-slot', slot);
            container.appendChild(element);
        }
    }

    function updateDropZoneUI(slot, filename, mediaType) {
        var zoneId = slot === 'A' ? 'drop-zone-a' : 'drop-zone-b';
        var filenameId = slot === 'A' ? 'filename-a' : 'filename-b';
        var zone = document.getElementById(zoneId);
        var filenameEl = document.getElementById(filenameId);

        if (zone) {
            zone.classList.add('loaded');
        }

        if (filenameEl) {
            var icon = mediaType === 'video' ? '\u25B6 ' : '\u266B ';
            filenameEl.textContent = icon + filename;
        }
    }

    return {
        init: init,
        loadFromPath: loadFromPath
    };
})();
