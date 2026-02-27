/**
 * SongBrowser — Built-in song browser modal.
 *
 * Allows users to browse the songs/ directory and select audio/video files
 * to load into track slot A or B via FileLoader.loadFromPath().
 */
window.SongBrowser = (function () {
    var DEFAULT_SONGS_DIR = './songs/';

    // DOM elements
    var songModal = null;
    var songModalClose = null;
    var songBreadcrumb = null;
    var songList = null;
    var songModalInfo = null;
    var songModalSlot = null;

    // State
    var currentPath = '';
    var targetSlot = 'A';

    function init() {
        songModal = document.getElementById('song-modal');
        songModalClose = document.getElementById('song-modal-close');
        songBreadcrumb = document.getElementById('song-breadcrumb');
        songList = document.getElementById('song-list');
        songModalInfo = document.getElementById('song-modal-info');
        songModalSlot = document.getElementById('song-modal-slot');

        if (songModalClose) {
            songModalClose.addEventListener('click', close);
        }

        if (songModal) {
            songModal.addEventListener('click', function (e) {
                if (e.target === songModal) close();
            });
        }

        setupBrowseButtons();
    }

    function setupBrowseButtons() {
        var buttons = document.querySelectorAll('.btn-browse-songs');
        buttons.forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                e.preventDefault();
                var slot = btn.getAttribute('data-slot');
                open(slot);
            });
        });
    }

    function open(slot) {
        targetSlot = slot || 'A';
        if (!songModal) return;

        var slotLabel = targetSlot === 'A' ? 'Instrumental' : 'Vocals';
        if (songModalSlot) {
            songModalSlot.textContent = 'Loading into: ' + slotLabel;
        }

        songModal.classList.remove('hidden');
        browseSongs(DEFAULT_SONGS_DIR);
    }

    function close() {
        if (songModal) songModal.classList.add('hidden');
    }

    function browseSongs(dirPath) {
        currentPath = dirPath;
        if (!songList) return;
        songList.innerHTML = '<div class="modal-loading">Loading...</div>';
        if (songModalInfo) songModalInfo.textContent = '';

        fetch('/api/browse-songs?path=' + encodeURIComponent(dirPath))
            .then(function (res) {
                if (!res.ok) throw new Error('Server returned ' + res.status);
                return res.json();
            })
            .then(function (data) {
                currentPath = data.path || dirPath;
                renderBreadcrumb(currentPath);
                renderSongList(data);
            })
            .catch(function (err) {
                songList.innerHTML = '<div class="modal-error">Could not browse songs directory.</div>';
                console.warn('Song browse error:', err);
            });
    }

    function renderBreadcrumb(fullPath) {
        if (!songBreadcrumb) return;
        songBreadcrumb.innerHTML = '';

        var normalized = fullPath.replace(/\\/g, '/');
        var parts = normalized.split('/').filter(function (p) { return p; });
        var isAbsolute = /^[A-Za-z]:/.test(fullPath);

        parts.forEach(function (part, idx) {
            if (idx > 0) {
                var sep = document.createElement('span');
                sep.className = 'breadcrumb-sep';
                sep.textContent = ' / ';
                songBreadcrumb.appendChild(sep);
            }

            var btn = document.createElement('button');
            btn.className = 'breadcrumb-btn';
            btn.textContent = part;

            var pathUpTo;
            if (isAbsolute) {
                pathUpTo = parts.slice(0, idx + 1).join('/');
                if (idx === 0 && !pathUpTo.endsWith('/')) pathUpTo += '/';
            } else {
                pathUpTo = parts.slice(0, idx + 1).join('/');
            }

            btn.addEventListener('click', function () {
                browseSongs(pathUpTo);
            });

            songBreadcrumb.appendChild(btn);
        });
    }

    function renderSongList(data) {
        if (!songList) return;
        songList.innerHTML = '';

        if (songModalInfo) {
            var fileCount = (data.files || []).length;
            var dirCount = (data.dirs || []).length;
            var parts = [];
            if (dirCount > 0) parts.push(dirCount + ' folder' + (dirCount !== 1 ? 's' : ''));
            if (fileCount > 0) parts.push(fileCount + ' file' + (fileCount !== 1 ? 's' : ''));
            songModalInfo.textContent = parts.join(', ') || 'Empty folder';
        }

        if (data.error) {
            songList.innerHTML = '<div class="modal-error">Cannot access directory (' + data.error + ')</div>';
            return;
        }

        // Parent directory
        if (data.parent && data.parent !== data.path) {
            var parentEntry = document.createElement('div');
            parentEntry.className = 'folder-entry folder-entry-parent';
            parentEntry.innerHTML = '<span class="folder-entry-icon">\u2191</span> <span>..</span>';
            parentEntry.addEventListener('click', function () {
                browseSongs(data.parent);
            });
            songList.appendChild(parentEntry);
        }

        // Subdirectories
        (data.dirs || []).forEach(function (dirName) {
            var entry = document.createElement('div');
            entry.className = 'folder-entry';

            var icon = document.createElement('span');
            icon.className = 'folder-entry-icon';
            icon.textContent = '\uD83D\uDCC1';

            var name = document.createElement('span');
            name.className = 'folder-name';
            name.textContent = dirName;

            entry.appendChild(icon);
            entry.appendChild(name);

            entry.addEventListener('click', function () {
                var childPath = data.path.replace(/\\/g, '/').replace(/\/$/, '') + '/' + dirName;
                browseSongs(childPath);
            });

            songList.appendChild(entry);
        });

        // Files
        var VIDEO_EXTS = ['mp4', 'webm', 'mkv', 'avi', 'mov'];

        (data.files || []).forEach(function (file) {
            var entry = document.createElement('div');
            entry.className = 'folder-entry song-entry';

            var icon = document.createElement('span');
            icon.className = 'folder-entry-icon';
            var ext = file.name.split('.').pop().toLowerCase();
            icon.textContent = VIDEO_EXTS.indexOf(ext) !== -1 ? '\u25B6' : '\u266B';

            var name = document.createElement('span');
            name.className = 'song-entry-name';
            name.textContent = file.name;

            var size = document.createElement('span');
            size.className = 'song-entry-size';
            size.textContent = formatFileSize(file.size);

            entry.appendChild(icon);
            entry.appendChild(name);
            entry.appendChild(size);

            entry.addEventListener('click', function () {
                selectSong(data.path, file.name);
            });

            songList.appendChild(entry);
        });

        // Empty state
        if ((data.dirs || []).length === 0 && (data.files || []).length === 0) {
            var emptyMsg = document.createElement('div');
            emptyMsg.className = 'modal-error';
            emptyMsg.textContent = 'No songs found. Add audio/video files to the songs/ folder.';
            songList.appendChild(emptyMsg);
        }
    }

    function selectSong(dirPath, fileName) {
        var fullPath = dirPath.replace(/\\/g, '/').replace(/\/$/, '') + '/' + fileName;
        close();

        if (window.FileLoader && window.FileLoader.loadFromPath) {
            FileLoader.loadFromPath(targetSlot, fullPath, function (reason) {
                alert('Could not load song: ' + fileName + '\nReason: ' + reason);
            });
        }
    }

    function formatFileSize(bytes) {
        if (!bytes || bytes <= 0) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    return {
        init: init,
        open: open,
        close: close
    };
})();
