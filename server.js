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

const PORT = 3000;
const ROOT = __dirname;

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
