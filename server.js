/**
 * Minimal local server for Dual Track Player.
 *
 * - Serves the app's static files on http://localhost:3000
 * - Provides /api/local-file?path=... to stream any local file
 *   (needed because browsers block fetch('file://...') due to CORS)
 *
 * Usage:  node server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4298;
const ROOT = __dirname;
const DEFAULT_CONFIG_DIR = path.join(ROOT, 'configs');
const DEFAULT_SONGS_DIR = path.join(ROOT, 'songs');

// Ensure default directories exist
fs.mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });
fs.mkdirSync(DEFAULT_SONGS_DIR, { recursive: true });

const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.wma': 'audio/x-ms-wma',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

function getMime(filePath) {
    return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * Parse JSON that may contain unescaped Windows backslashes.
 * Tries parsing as-is first (for properly escaped files saved by the app).
 * Falls back to fixing unescaped backslashes (for manually created files).
 */
function parseJsonSafe(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        var fixed = text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
        return JSON.parse(fixed);
    }
}

/**
 * Extract just the filename from a path (handles / and \).
 */
function basename(p) {
    if (!p) return '';
    return p.replace(/^.*[\\\/]/, '');
}

/**
 * Strip file extension from a filename.
 */
function stripExt(name) {
    if (!name) return '';
    return name.replace(/\.[^.]+$/, '');
}

/**
 * Check if a filename looks like a DTP config file (.dtp.json or .json).
 */
function isConfigFile(name) {
    return name.endsWith('.dtp.json') || name.endsWith('.json');
}

/**
 * Resolve config directory: use the provided dir param or fall back to default.
 */
function resolveConfigDir(url) {
    var dir = url.searchParams.get('dir');
    if (!dir) return DEFAULT_CONFIG_DIR;
    // Resolve relative paths against ROOT
    return path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
}

/**
 * Read the request body as a string (for POST endpoints).
 */
function readBody(req, callback) {
    var chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () { callback(Buffer.concat(chunks).toString('utf8')); });
}

/**
 * Send a JSON response.
 */
function jsonResponse(res, status, data) {
    var body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
}

const server = http.createServer(function (req, res) {
    var url;
    try { url = new URL(req.url, 'http://localhost:' + PORT); }
    catch (e) { res.writeHead(400); res.end('Bad request'); return; }

    // --- API: serve a local file by absolute path ---
    if (url.pathname === '/api/local-file') {
        var filePath = url.searchParams.get('path');
        if (!filePath) {
            res.writeHead(400);
            res.end('Missing path parameter');
            return;
        }

        // Range support for media seeking
        fs.stat(filePath, function (err, stat) {
            if (err) {
                res.writeHead(404);
                res.end('File not found: ' + err.message);
                return;
            }

            var contentType = getMime(filePath);
            var range = req.headers.range;

            if (range) {
                var parts = range.replace(/bytes=/, '').split('-');
                var start = parseInt(parts[0], 10);
                var end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                res.writeHead(206, {
                    'Content-Type': contentType,
                    'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': end - start + 1,
                });
                fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
            } else {
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Content-Length': stat.size,
                    'Accept-Ranges': 'bytes',
                });
                fs.createReadStream(filePath).pipe(res);
            }
        });
        return;
    }

    // --- API: browse directories for folder picker ---
    if (url.pathname === '/api/browse' && req.method === 'GET') {
        var browseDir = url.searchParams.get('path') || DEFAULT_CONFIG_DIR;
        // Resolve relative paths
        if (!path.isAbsolute(browseDir)) browseDir = path.join(ROOT, browseDir);

        var entries;
        try { entries = fs.readdirSync(browseDir, { withFileTypes: true }); }
        catch (e) {
            return jsonResponse(res, 200, { path: browseDir, parent: path.dirname(browseDir), dirs: [], configCount: 0, error: e.code });
        }

        var dirs = [];
        var configCount = 0;
        entries.forEach(function (entry) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                dirs.push(entry.name);
            }
            if (entry.isFile() && isConfigFile(entry.name)) {
                configCount++;
            }
        });

        dirs.sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base' }); });

        return jsonResponse(res, 200, {
            path: browseDir,
            parent: path.dirname(browseDir),
            dirs: dirs,
            configCount: configCount
        });
    }

    // --- API: browse songs directory (lists files + subdirectories) ---
    if (url.pathname === '/api/browse-songs' && req.method === 'GET') {
        var songsDir = url.searchParams.get('path') || DEFAULT_SONGS_DIR;
        if (!path.isAbsolute(songsDir)) songsDir = path.join(ROOT, songsDir);

        var entries;
        try { entries = fs.readdirSync(songsDir, { withFileTypes: true }); }
        catch (e) {
            return jsonResponse(res, 200, {
                path: songsDir, parent: path.dirname(songsDir),
                dirs: [], files: [], error: e.code
            });
        }

        var MEDIA_EXTS = ['mp3','wav','ogg','flac','aac','m4a','wma','mp4','webm','mkv','avi','mov'];
        var dirs = [];
        var files = [];

        entries.forEach(function (entry) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
                dirs.push(entry.name);
            }
            if (entry.isFile()) {
                var ext = entry.name.split('.').pop().toLowerCase();
                if (MEDIA_EXTS.indexOf(ext) !== -1) {
                    try {
                        var stat = fs.statSync(path.join(songsDir, entry.name));
                        files.push({ name: entry.name, size: stat.size });
                    } catch (e) {
                        files.push({ name: entry.name, size: 0 });
                    }
                }
            }
        });

        dirs.sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base' }); });
        files.sort(function (a, b) { return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }); });

        return jsonResponse(res, 200, {
            path: songsDir,
            parent: path.dirname(songsDir),
            dirs: dirs,
            files: files
        });
    }

    // --- API: list all configs in a directory ---
    if (url.pathname === '/api/configs' && req.method === 'GET') {
        var configDir = resolveConfigDir(url);
        var files;
        try { files = fs.readdirSync(configDir); }
        catch (e) {
            return jsonResponse(res, 200, { directory: configDir, configs: [] });
        }

        var configs = [];
        files.filter(function (f) { return isConfigFile(f); }).forEach(function (f) {
            try {
                var raw = fs.readFileSync(path.join(configDir, f), 'utf8');
                var config = parseJsonSafe(raw);
                // Validate it's actually a DTP config (must have version and files)
                if (!config.version || !config.files) return;
                var nameA = stripExt(basename(config.files.A));
                var nameB = stripExt(basename(config.files.B));
                configs.push({
                    filename: f,
                    displayName: (nameA || 'Track A') + ' / ' + (nameB || 'Track B'),
                    savedAt: config.savedAt || null,
                    trackOffsetMs: config.trackOffsetMs || 0
                });
            } catch (e) {
                console.warn('Skipping malformed config: ' + f, e.message);
            }
        });

        // Sort newest first
        configs.sort(function (a, b) {
            return (b.savedAt || '').localeCompare(a.savedAt || '');
        });

        return jsonResponse(res, 200, { directory: configDir, configs: configs });
    }

    // --- API: get a single config file ---
    if (url.pathname === '/api/config' && req.method === 'GET') {
        var configDir = resolveConfigDir(url);
        var file = url.searchParams.get('file');
        if (!file) {
            return jsonResponse(res, 400, { error: 'Missing file parameter' });
        }
        // Prevent path traversal
        if (file.indexOf('..') !== -1 || file.indexOf('/') !== -1 || file.indexOf('\\') !== -1) {
            return jsonResponse(res, 400, { error: 'Invalid filename' });
        }
        var filePath = path.join(configDir, file);
        fs.readFile(filePath, 'utf8', function (err, raw) {
            if (err) {
                return jsonResponse(res, 404, { error: 'Config not found' });
            }
            try {
                var config = parseJsonSafe(raw);
                return jsonResponse(res, 200, config);
            } catch (e) {
                return jsonResponse(res, 500, { error: 'Malformed config file' });
            }
        });
        return;
    }

    // --- API: resolve filenames to full paths ---
    // Searches directories known from existing configs for matching filenames.
    if (url.pathname === '/api/resolve-paths' && req.method === 'GET') {
        var names = (url.searchParams.get('names') || '').split(',').filter(Boolean);
        if (names.length === 0) {
            return jsonResponse(res, 200, { paths: {} });
        }

        var configDir = resolveConfigDir(url);

        // Collect known directories from existing configs
        var knownDirs = new Set();
        try {
            var configFiles = fs.readdirSync(configDir);
            configFiles.filter(function (f) { return isConfigFile(f); }).forEach(function (f) {
                try {
                    var raw = fs.readFileSync(path.join(configDir, f), 'utf8');
                    var cfg = parseJsonSafe(raw);
                    if (cfg.files) {
                        ['A', 'B'].forEach(function (slot) {
                            if (cfg.files[slot]) {
                                var dir = path.dirname(cfg.files[slot]);
                                if (dir && dir !== '.' && path.isAbsolute(dir)) {
                                    knownDirs.add(dir);
                                }
                            }
                        });
                    }
                } catch (e) { /* skip */ }
            });
        } catch (e) { /* no config dir */ }

        // Search known directories for each filename
        var resolved = {};
        names.forEach(function (name) {
            knownDirs.forEach(function (dir) {
                if (resolved[name]) return; // already found
                var candidate = path.join(dir, name);
                try {
                    if (fs.existsSync(candidate)) {
                        resolved[name] = candidate;
                    }
                } catch (e) { /* skip */ }
            });
        });

        return jsonResponse(res, 200, { paths: resolved });
    }

    // --- API: save a config file ---
    if (url.pathname === '/api/config' && req.method === 'POST') {
        readBody(req, function (body) {
            try {
                var data = JSON.parse(body);
                if (!data.config || !data.filename) {
                    return jsonResponse(res, 400, { error: 'Missing config or filename' });
                }
                var configDir = resolveConfigDir(url);
                fs.mkdirSync(configDir, { recursive: true });

                // Sanitize filename
                var safeName = data.filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
                if (!safeName.endsWith('.dtp.json')) safeName += '.dtp.json';

                var filePath = path.join(configDir, safeName);
                var json = JSON.stringify(data.config, null, 2);
                fs.writeFileSync(filePath, json, 'utf8');
                return jsonResponse(res, 200, { ok: true, filename: safeName });
            } catch (e) {
                return jsonResponse(res, 500, { error: 'Save failed: ' + e.message });
            }
        });
        return;
    }

    // --- Static files from app directory ---
    var safePath = path.normalize(url.pathname).replace(/^(\.\.[\/\\])+/, '');
    var filePath = path.join(ROOT, safePath === '/' || safePath === '\\' ? 'index.html' : safePath);

    fs.readFile(filePath, function (err, data) {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': getMime(filePath) });
        res.end(data);
    });
});

server.on('error', function (err) {
    if (err.code === 'EADDRINUSE') {
        console.log('Port ' + PORT + ' is already in use — the server may already be running.');
        console.log('Opening http://localhost:' + PORT + ' in your browser...');
        var exec = require('child_process').exec;
        exec('start http://localhost:' + PORT);
    } else {
        console.error(err);
    }
});

server.listen(PORT, function () {
    console.log('Dual Track Player running at http://localhost:' + PORT);
    // Auto-open in default browser
    var exec = require('child_process').exec;
    exec('start http://localhost:' + PORT);
});
