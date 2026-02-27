/**
 * Home — Config browser landing page.
 *
 * Lists .dtp.json configs from a server directory, allows searching,
 * and clicking a config to auto-load tracks into the player.
 */
window.Home = (function () {
    var DEFAULT_DIR = './configs/';

    // DOM elements
    var homeSection = null;
    var homeList = null;
    var homeEmpty = null;
    var homeLoading = null;
    var searchInput = null;
    var dirPathEl = null;
    var changeDirBtn = null;
    var newSessionBtn = null;
    var backBtn = null;

    // Folder modal elements
    var folderModal = null;
    var folderModalClose = null;
    var folderBreadcrumb = null;
    var folderList = null;
    var folderConfigCount = null;
    var folderSelectBtn = null;

    // State
    var configDir = DEFAULT_DIR;
    var configs = [];
    var searchTerm = '';
    var browsePath = '';  // Current path in the folder browser modal

    function init() {
        homeSection = document.getElementById('home-section');
        homeList = document.getElementById('home-list');
        homeEmpty = document.getElementById('home-empty');
        homeLoading = document.getElementById('home-loading');
        searchInput = document.getElementById('home-search-input');
        dirPathEl = document.getElementById('home-dir-path');
        changeDirBtn = document.getElementById('btn-change-dir');
        newSessionBtn = document.getElementById('btn-new-session');
        backBtn = document.getElementById('btn-back-home');

        // Folder browser modal
        folderModal = document.getElementById('folder-modal');
        folderModalClose = document.getElementById('folder-modal-close');
        folderBreadcrumb = document.getElementById('folder-breadcrumb');
        folderList = document.getElementById('folder-list');
        folderConfigCount = document.getElementById('folder-config-count');
        folderSelectBtn = document.getElementById('folder-modal-select');

        // Load persisted directory
        var saved = localStorage.getItem('dtp-config-dir');
        if (saved) {
            configDir = saved;
        }
        if (dirPathEl) dirPathEl.textContent = configDir;

        // Search
        if (searchInput) {
            searchInput.addEventListener('input', function () {
                searchTerm = searchInput.value.trim().toLowerCase();
                filterAndRender();
            });
        }

        // Change directory — open folder browser modal
        if (changeDirBtn) {
            changeDirBtn.addEventListener('click', function () {
                openFolderModal(configDir);
            });
        }

        // Folder modal: close button
        if (folderModalClose) {
            folderModalClose.addEventListener('click', closeFolderModal);
        }

        // Folder modal: click overlay to close
        if (folderModal) {
            folderModal.addEventListener('click', function (e) {
                if (e.target === folderModal) closeFolderModal();
            });
        }

        // Folder modal: select button
        if (folderSelectBtn) {
            folderSelectBtn.addEventListener('click', function () {
                configDir = browsePath;
                localStorage.setItem('dtp-config-dir', configDir);
                if (dirPathEl) dirPathEl.textContent = configDir;
                closeFolderModal();
                refreshList();
            });
        }

        // New session
        if (newSessionBtn) {
            newSessionBtn.addEventListener('click', function () {
                hide();
            });
        }

        // Back button
        if (backBtn) {
            backBtn.addEventListener('click', function () {
                show();
            });
        }

        refreshList();
    }

    function show() {
        // Reset player state
        if (window.App && App.resetPlayer) {
            App.resetPlayer();
        }

        // Hide all player sections
        hideEl('file-loader-section');
        hideEl('video-section');
        hideEl('toggle-section');
        hideEl('timeline-section');
        hideEl('transport-section');
        hideEl('config-section');

        // Show home
        if (homeSection) homeSection.classList.remove('hidden');
        if (backBtn) backBtn.classList.add('hidden');

        // Clear search
        if (searchInput) searchInput.value = '';
        searchTerm = '';

        refreshList();
    }

    function hide() {
        if (homeSection) homeSection.classList.add('hidden');

        // Show file loader (non-compact for fresh session)
        var fileLoader = document.getElementById('file-loader-section');
        if (fileLoader) {
            fileLoader.classList.remove('hidden');
            fileLoader.classList.remove('compact');
        }

        // Show back button
        if (backBtn) backBtn.classList.remove('hidden');
    }

    function refreshList() {
        if (homeLoading) homeLoading.classList.remove('hidden');
        if (homeEmpty) homeEmpty.classList.add('hidden');
        if (homeList) homeList.innerHTML = '';

        fetch('/api/configs?dir=' + encodeURIComponent(configDir))
            .then(function (res) {
                if (!res.ok) throw new Error('Server returned ' + res.status);
                return res.json();
            })
            .then(function (data) {
                configs = data.configs || [];
                if (homeLoading) homeLoading.classList.add('hidden');
                filterAndRender();
            })
            .catch(function (err) {
                configs = [];
                if (homeLoading) homeLoading.classList.add('hidden');
                if (homeList) {
                    homeList.innerHTML = '<div class="home-no-match">Could not load configs. Make sure the server is running.</div>';
                }
                console.warn('Home: failed to fetch configs', err);
            });
    }

    function filterAndRender() {
        if (!homeList) return;
        homeList.innerHTML = '';

        var filtered = configs;
        if (searchTerm) {
            filtered = configs.filter(function (c) {
                return c.displayName.toLowerCase().indexOf(searchTerm) !== -1;
            });
        }

        if (configs.length === 0) {
            // No configs at all
            if (homeEmpty) homeEmpty.classList.remove('hidden');
            return;
        }

        if (homeEmpty) homeEmpty.classList.add('hidden');

        if (filtered.length === 0) {
            homeList.innerHTML = '<div class="home-no-match">No configs match your search.</div>';
            return;
        }

        filtered.forEach(function (cfg) {
            var card = document.createElement('div');
            card.className = 'config-card';
            card.setAttribute('data-filename', cfg.filename);

            var name = document.createElement('div');
            name.className = 'config-card-name';
            name.textContent = cfg.displayName;

            var meta = document.createElement('div');
            meta.className = 'config-card-meta';

            var date = document.createElement('span');
            date.textContent = formatDate(cfg.savedAt);

            meta.appendChild(date);

            if (cfg.trackOffsetMs) {
                var offset = document.createElement('span');
                offset.className = 'config-card-offset';
                var sign = cfg.trackOffsetMs >= 0 ? '+' : '';
                offset.textContent = sign + cfg.trackOffsetMs + 'ms';
                meta.appendChild(offset);
            }

            card.appendChild(name);
            card.appendChild(meta);

            card.addEventListener('click', function () {
                handleConfigClick(cfg);
            });

            homeList.appendChild(card);
        });
    }

    function handleConfigClick(summary) {
        // Show loading state on the card
        var cards = homeList.querySelectorAll('.config-card');
        cards.forEach(function (c) {
            if (c.getAttribute('data-filename') === summary.filename) {
                c.style.opacity = '0.6';
                c.style.pointerEvents = 'none';
            }
        });

        fetch('/api/config?dir=' + encodeURIComponent(configDir) + '&file=' + encodeURIComponent(summary.filename))
            .then(function (res) {
                if (!res.ok) throw new Error('Server returned ' + res.status);
                return res.json();
            })
            .then(function (config) {
                hide();
                // applyConfig will trigger auto-load since no tracks are loaded
                if (window.ConfigManager) {
                    ConfigManager.applyConfig(config);
                }
            })
            .catch(function (err) {
                alert('Failed to load config: ' + err.message);
                // Reset card appearance
                cards.forEach(function (c) {
                    c.style.opacity = '';
                    c.style.pointerEvents = '';
                });
            });
    }

    function formatDate(isoString) {
        if (!isoString) return '';
        try {
            var d = new Date(isoString);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch (e) {
            return '';
        }
    }

    function hideEl(id) {
        var el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    }

    function getConfigDir() {
        return configDir;
    }

    // --- Folder browser modal ---

    function openFolderModal(startPath) {
        if (!folderModal) return;
        browsePath = startPath || configDir;
        folderModal.classList.remove('hidden');
        browseDirectory(browsePath);
    }

    function closeFolderModal() {
        if (folderModal) folderModal.classList.add('hidden');
    }

    function browseDirectory(dirPath) {
        if (!folderList) return;
        browsePath = dirPath;
        folderList.innerHTML = '<div class="modal-loading">Loading...</div>';
        if (folderConfigCount) folderConfigCount.textContent = '';

        fetch('/api/browse?path=' + encodeURIComponent(dirPath))
            .then(function (res) {
                if (!res.ok) throw new Error('Server returned ' + res.status);
                return res.json();
            })
            .then(function (data) {
                browsePath = data.path || dirPath;
                renderBreadcrumb(browsePath);
                renderFolderList(data);
            })
            .catch(function (err) {
                folderList.innerHTML = '<div class="modal-error">Could not browse directory.</div>';
                console.warn('Browse error:', err);
            });
    }

    function renderBreadcrumb(fullPath) {
        if (!folderBreadcrumb) return;
        folderBreadcrumb.innerHTML = '';

        // Split path into segments (handle both / and \)
        var normalized = fullPath.replace(/\\/g, '/');
        var parts = normalized.split('/').filter(function (p) { return p; });

        // Check if it starts with a drive letter (e.g., "J:")
        var isAbsolute = /^[A-Za-z]:/.test(fullPath);

        parts.forEach(function (part, idx) {
            if (idx > 0) {
                var sep = document.createElement('span');
                sep.className = 'breadcrumb-sep';
                sep.textContent = ' / ';
                folderBreadcrumb.appendChild(sep);
            }

            var btn = document.createElement('button');
            btn.className = 'breadcrumb-btn';
            btn.textContent = part;

            // Build the path up to this segment
            var pathUpTo;
            if (isAbsolute) {
                pathUpTo = parts.slice(0, idx + 1).join('/');
                // Ensure drive letter keeps its colon form (e.g., J:/)
                if (idx === 0 && !pathUpTo.endsWith('/')) pathUpTo += '/';
            } else {
                pathUpTo = parts.slice(0, idx + 1).join('/');
            }

            btn.addEventListener('click', function () {
                browseDirectory(pathUpTo);
            });

            folderBreadcrumb.appendChild(btn);
        });
    }

    function renderFolderList(data) {
        if (!folderList) return;
        folderList.innerHTML = '';

        // Config count
        if (folderConfigCount) {
            var count = data.configCount || 0;
            folderConfigCount.textContent = count + ' config' + (count !== 1 ? 's' : '') + ' in this folder';
        }

        // Error from server (e.g., ENOENT)
        if (data.error) {
            folderList.innerHTML = '<div class="modal-error">Cannot access directory (' + data.error + ')</div>';
            return;
        }

        // Parent directory entry
        if (data.parent && data.parent !== data.path) {
            var parentEntry = document.createElement('div');
            parentEntry.className = 'folder-entry folder-entry-parent';
            parentEntry.innerHTML = '<span class="folder-entry-icon">\u2191</span> <span>..</span>';
            parentEntry.addEventListener('click', function () {
                browseDirectory(data.parent);
            });
            folderList.appendChild(parentEntry);
        }

        // Subdirectories
        if (!data.dirs || data.dirs.length === 0) {
            if (!data.parent || data.parent === data.path) {
                folderList.innerHTML = '<div class="modal-error">No subdirectories found.</div>';
            } else {
                var empty = document.createElement('div');
                empty.className = 'modal-error';
                empty.textContent = 'No subdirectories.';
                folderList.appendChild(empty);
            }
            return;
        }

        data.dirs.forEach(function (dirName) {
            var entry = document.createElement('div');
            entry.className = 'folder-entry';

            var icon = document.createElement('span');
            icon.className = 'folder-entry-icon';
            icon.textContent = '\uD83D\uDCC1'; // folder emoji

            var name = document.createElement('span');
            name.className = 'folder-name';
            name.textContent = dirName;

            entry.appendChild(icon);
            entry.appendChild(name);

            entry.addEventListener('click', function () {
                var childPath = data.path.replace(/\\/g, '/').replace(/\/$/, '') + '/' + dirName;
                browseDirectory(childPath);
            });

            folderList.appendChild(entry);
        });
    }

    return {
        init: init,
        show: show,
        hide: hide,
        refreshList: refreshList,
        getConfigDir: getConfigDir
    };
})();
