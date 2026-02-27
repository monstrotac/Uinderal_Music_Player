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

// Ensure default config directory exists
fs.mkdirSync(DEFAULT_CONFIG_DIR, { recursive: true });

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
};

function getMime(filePath) {
    return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * Fix unescaped backslashes in a JSON string so JSON.parse doesn't choke on Windows paths.
 */
function fixBackslashes(text) {
    return text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
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
                var config = JSON.parse(fixBackslashes(raw));
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
                var config = JSON.parse(fixBackslashes(raw));
                return jsonResponse(res, 200, config);
            } catch (e) {
                return jsonResponse(res, 500, { error: 'Malformed config file' });
            }
        });
        return;
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
