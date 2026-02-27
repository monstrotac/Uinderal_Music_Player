/**
 * Waveform — Static waveform visualization with zoom, drag-to-align, and auto-sync.
 *
 * Decodes audio files into AudioBuffers, computes peak amplitudes,
 * draws Audacity-style waveforms on canvas elements.
 * Supports zoom for precision alignment and loop cropping.
 * Advanced mode allows dragging Track B to set a time offset.
 */
window.Waveform = (function () {
    var canvasA = null;
    var canvasB = null;
    var rowA = null;
    var rowB = null;
    var playheadEl = null;
    var advancedBtn = null;
    var offsetDisplay = null;
    var resetOffsetBtn = null;
    var areaEl = null;

    var duration = 0;
    var isAdvancedMode = false;

    // Peak data storage (array of {min, max} per sample bucket)
    var peaks = { A: null, B: null };

    // Raw AudioBuffers for cross-correlation auto-sync
    var audioBuffers = { A: null, B: null };
    var autoSyncBtn = null;
    var isAutoSyncing = false;

    // Zoom state: viewStart and viewEnd as fractions of duration (0..1)
    var zoom = {
        level: 1,       // 1 = full view, 2 = 2x zoom, etc.
        viewStart: 0,   // fraction 0..1
        viewEnd: 1,     // fraction 0..1
        isPanning: false,
        panStartX: 0,
        panStartView: 0
    };

    // Zoom UI elements
    var zoomInBtn = null;
    var zoomOutBtn = null;
    var zoomResetBtn = null;
    var zoomLevelDisplay = null;

    // Colors
    var COLOR_A = 'rgba(220, 38, 38, 0.8)';   // red
    var COLOR_B = 'rgba(255, 255, 255, 0.7)';  // white

    // Drag state for advanced align
    var dragState = {
        active: false,
        startX: 0,
        currentOffsetPx: 0,  // committed offset in pixels
        dragDeltaPx: 0       // in-progress drag delta
    };

    function init(dur) {
        duration = dur;

        canvasA = document.getElementById('waveform-canvas-a');
        canvasB = document.getElementById('waveform-canvas-b');
        rowA = document.getElementById('waveform-row-a');
        rowB = document.getElementById('waveform-row-b');
        playheadEl = document.getElementById('waveform-playhead');
        advancedBtn = document.getElementById('btn-advanced');
        offsetDisplay = document.getElementById('offset-display');
        resetOffsetBtn = document.getElementById('btn-reset-offset');
        areaEl = document.getElementById('waveform-area');
        autoSyncBtn = document.getElementById('btn-auto-sync');
        zoomInBtn = document.getElementById('btn-zoom-in');
        zoomOutBtn = document.getElementById('btn-zoom-out');
        zoomResetBtn = document.getElementById('btn-zoom-reset');
        zoomLevelDisplay = document.getElementById('zoom-level-display');

        setupCanvasSize(canvasA);
        setupCanvasSize(canvasB);

        // Draw any already-loaded peaks
        redrawAll();

        setupAdvancedMode();
        setupAutoSync();
        setupZoom();
        setupResize();
    }

    function setupCanvasSize(canvas) {
        if (!canvas) return;
        var parent = canvas.parentElement;
        var rect = parent.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return;
        var dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        var ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
    }

    function setupResize() {
        var resizeTimer = null;
        window.addEventListener('resize', function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                setupCanvasSize(canvasA);
                setupCanvasSize(canvasB);
                redrawAll();
            }, 150);
        });
    }

    function redrawAll() {
        if (peaks.A) drawWaveformZoomed(canvasA, peaks.A, COLOR_A, 0);
        if (peaks.B) drawWaveformZoomed(canvasB, peaks.B, COLOR_B, dragState.currentOffsetPx);
    }

    /**
     * Load a track's audio data and compute waveform peaks.
     */
    function loadTrack(slot, file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var arrayBuffer = e.target.result;
            var audioCtx = AudioEngine.getAudioContext();
            var bufferCopy = arrayBuffer.slice(0);
            audioCtx.decodeAudioData(bufferCopy, function (audioBuffer) {
                audioBuffers[slot] = audioBuffer;
                // Compute peaks at high resolution (one per ~2 samples at canvas width)
                // We store many more peaks than needed so zooming reveals more detail
                var numPeaks = Math.max(2000, getCanvasWidth(slot) * 4);
                var peakData = computePeaks(audioBuffer, numPeaks);
                peaks[slot] = peakData;

                var canvas = slot === 'A' ? canvasA : canvasB;
                var color = slot === 'A' ? COLOR_A : COLOR_B;
                var offset = slot === 'B' ? dragState.currentOffsetPx : 0;
                if (canvas) {
                    setupCanvasSize(canvas);
                    drawWaveformZoomed(canvas, peakData, color, offset);
                }
            }, function (err) {
                console.warn('Waveform: Could not decode audio for slot ' + slot, err);
            });
        };
        reader.readAsArrayBuffer(file);
    }

    function getCanvasWidth(slot) {
        var canvas = slot === 'A' ? canvasA : canvasB;
        if (canvas) {
            var parent = canvas.parentElement;
            if (parent) {
                var w = Math.floor(parent.getBoundingClientRect().width);
                if (w > 0) return w;
            }
        }
        return 800;
    }

    /**
     * Compute min/max peak pairs from an AudioBuffer.
     */
    function computePeaks(audioBuffer, numBuckets) {
        var channels = audioBuffer.numberOfChannels;
        var length = audioBuffer.length;
        var mono = new Float32Array(length);

        for (var ch = 0; ch < channels; ch++) {
            var channelData = audioBuffer.getChannelData(ch);
            for (var i = 0; i < length; i++) {
                mono[i] += channelData[i] / channels;
            }
        }

        var samplesPerBucket = Math.floor(length / numBuckets);
        if (samplesPerBucket < 1) samplesPerBucket = 1;
        var result = [];

        for (var b = 0; b < numBuckets; b++) {
            var start = b * samplesPerBucket;
            var end = Math.min(start + samplesPerBucket, length);
            var min = 0;
            var max = 0;

            for (var s = start; s < end; s++) {
                var val = mono[s];
                if (val < min) min = val;
                if (val > max) max = val;
            }

            result.push({ min: min, max: max });
        }

        return result;
    }

    /**
     * Draw a waveform on a canvas, respecting the current zoom viewport.
     * Only draws the portion of the waveform visible in the zoom window.
     */
    function drawWaveformZoomed(canvas, peakData, color, alignOffsetPx) {
        if (!canvas) return;
        alignOffsetPx = alignOffsetPx || 0;

        var parent = canvas.parentElement;
        var displayWidth = parent.getBoundingClientRect().width;
        var displayHeight = parent.getBoundingClientRect().height;
        if (displayWidth < 1 || displayHeight < 1) return;

        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, displayWidth, displayHeight);

        var centerY = displayHeight / 2;
        var numBars = peakData.length;

        // Which portion of the peak data is visible?
        var startIdx = Math.floor(zoom.viewStart * numBars);
        var endIdx = Math.ceil(zoom.viewEnd * numBars);
        var visibleBars = endIdx - startIdx;
        if (visibleBars < 1) return;

        var barWidth = displayWidth / visibleBars;

        // Convert align offset from full-view pixels to zoomed pixels
        var zoomScale = numBars / visibleBars;
        var scaledOffset = alignOffsetPx * zoomScale;

        ctx.fillStyle = color;
        ctx.beginPath();

        for (var vi = 0; vi < visibleBars; vi++) {
            var dataIdx = startIdx + vi;
            if (dataIdx < 0 || dataIdx >= numBars) continue;

            var x = (vi * barWidth) + scaledOffset;
            if (x + barWidth < 0 || x > displayWidth) continue;

            var minVal = peakData[dataIdx].min;
            var maxVal = peakData[dataIdx].max;

            var top = centerY - (maxVal * centerY);
            var bottom = centerY - (minVal * centerY);
            var height = Math.max(1, bottom - top);

            ctx.rect(x, top, Math.max(1, barWidth - 0.5), height);
        }

        ctx.fill();

        // Draw time markers when zoomed in
        if (zoom.level >= 2) {
            drawTimeMarkers(ctx, displayWidth, displayHeight);
        }
    }

    /**
     * Draw subtle time markers on the waveform when zoomed in.
     */
    function drawTimeMarkers(ctx, width, height) {
        if (!duration) return;

        var viewDuration = (zoom.viewEnd - zoom.viewStart) * duration;
        // Choose a nice interval based on visible duration
        var interval;
        if (viewDuration < 2) interval = 0.1;
        else if (viewDuration < 10) interval = 0.5;
        else if (viewDuration < 30) interval = 1;
        else if (viewDuration < 120) interval = 5;
        else interval = 10;

        var startTime = zoom.viewStart * duration;
        var endTime = zoom.viewEnd * duration;
        var firstMark = Math.ceil(startTime / interval) * interval;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';

        for (var t = firstMark; t < endTime; t += interval) {
            var ratio = (t - startTime) / (endTime - startTime);
            var x = ratio * width;

            // Tick line
            ctx.fillRect(x, 0, 1, height);

            // Time label
            var label = formatTimeMs(t);
            ctx.fillText(label, x, height - 2);
        }
    }

    function formatTimeMs(seconds) {
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        if (s < 10) return m + ':0' + s.toFixed(1);
        return m + ':' + s.toFixed(1);
    }

    /**
     * Update the playhead position during playback, accounting for zoom.
     */
    function updatePlayhead(currentTime, dur) {
        if (!playheadEl || !dur) return;
        var ratio = currentTime / dur;

        // Map global ratio to zoomed viewport
        var viewRatio = (ratio - zoom.viewStart) / (zoom.viewEnd - zoom.viewStart);
        viewRatio = Math.max(-0.01, Math.min(1.01, viewRatio));

        playheadEl.style.left = (viewRatio * 100) + '%';
        // Hide if outside viewport
        playheadEl.style.opacity = (viewRatio >= 0 && viewRatio <= 1) ? '1' : '0';
    }

    // ---- Zoom ----

    function setupZoom() {
        // Button controls
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', function () { zoomBy(2); });
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', function () { zoomBy(0.5); });
        }
        if (zoomResetBtn) {
            zoomResetBtn.addEventListener('click', function () { resetZoom(); });
        }

        // Mouse wheel zoom on waveform area
        if (areaEl) {
            areaEl.addEventListener('wheel', function (e) {
                e.preventDefault();
                var rect = areaEl.getBoundingClientRect();
                var mouseX = (e.clientX - rect.left) / rect.width; // 0..1 within area

                if (e.deltaY < 0) {
                    zoomAt(1.3, mouseX);
                } else {
                    zoomAt(1 / 1.3, mouseX);
                }
            }, { passive: false });

            // Middle-click pan or right-click pan on waveform
            areaEl.addEventListener('pointerdown', function (e) {
                // Pan with middle mouse or when not in advanced mode
                if (e.button === 1 || (!isAdvancedMode && e.button === 0 && zoom.level > 1)) {
                    if (isAdvancedMode && e.button === 0) return; // let drag-align handle it
                    e.preventDefault();
                    zoom.isPanning = true;
                    zoom.panStartX = e.clientX;
                    zoom.panStartView = zoom.viewStart;
                    areaEl.setPointerCapture(e.pointerId);
                }
            });

            areaEl.addEventListener('pointermove', function (e) {
                if (!zoom.isPanning) return;
                var rect = areaEl.getBoundingClientRect();
                var deltaPx = e.clientX - zoom.panStartX;
                var deltaFrac = -(deltaPx / rect.width) * (zoom.viewEnd - zoom.viewStart);

                var viewWidth = zoom.viewEnd - zoom.viewStart;
                var newStart = zoom.panStartView + deltaFrac;
                newStart = Math.max(0, Math.min(1 - viewWidth, newStart));

                zoom.viewStart = newStart;
                zoom.viewEnd = newStart + viewWidth;
                redrawAll();
                updateZoomDisplay();
            });

            areaEl.addEventListener('pointerup', function () {
                zoom.isPanning = false;
            });

            areaEl.addEventListener('pointercancel', function () {
                zoom.isPanning = false;
            });
        }

        updateZoomDisplay();
    }

    function zoomBy(factor) {
        // Zoom centered on the middle of the current view
        zoomAt(factor, 0.5);
    }

    function zoomAt(factor, anchorFrac) {
        var viewWidth = zoom.viewEnd - zoom.viewStart;
        var anchorTime = zoom.viewStart + anchorFrac * viewWidth;

        var newWidth = viewWidth / factor;
        // Clamp: minimum zoom shows 0.5 seconds, maximum is full duration
        var minWidth = 0.5 / (duration || 1);
        newWidth = Math.max(minWidth, Math.min(1, newWidth));

        var newStart = anchorTime - anchorFrac * newWidth;
        newStart = Math.max(0, Math.min(1 - newWidth, newStart));

        zoom.viewStart = newStart;
        zoom.viewEnd = newStart + newWidth;
        zoom.level = 1 / newWidth;

        redrawAll();
        updateZoomDisplay();
    }

    function resetZoom() {
        zoom.viewStart = 0;
        zoom.viewEnd = 1;
        zoom.level = 1;
        redrawAll();
        updateZoomDisplay();
    }

    function updateZoomDisplay() {
        if (zoomLevelDisplay) {
            if (zoom.level <= 1.05) {
                zoomLevelDisplay.textContent = '1x';
            } else {
                zoomLevelDisplay.textContent = zoom.level.toFixed(1) + 'x';
            }
        }

        // Enable/disable buttons
        if (zoomOutBtn) zoomOutBtn.disabled = zoom.level <= 1.05;
        if (zoomResetBtn) zoomResetBtn.disabled = zoom.level <= 1.05;
    }

    // ---- Advanced Align Mode ----

    function setupAdvancedMode() {
        if (advancedBtn) {
            advancedBtn.addEventListener('click', function () {
                setAdvancedMode(!isAdvancedMode);
            });
        }

        if (resetOffsetBtn) {
            resetOffsetBtn.addEventListener('click', function () {
                resetOffset();
            });
        }

        // Drag handlers on rowB
        if (rowB) {
            rowB.addEventListener('pointerdown', function (e) {
                if (!isAdvancedMode || e.button !== 0) return;
                e.stopPropagation(); // prevent pan
                dragState.active = true;
                dragState.startX = e.clientX;
                dragState.dragDeltaPx = 0;
                rowB.setPointerCapture(e.pointerId);
                rowB.classList.add('dragging');
            });

            rowB.addEventListener('pointermove', function (e) {
                if (!dragState.active) return;
                // Scale drag by zoom level for precision
                var rawDelta = e.clientX - dragState.startX;
                dragState.dragDeltaPx = rawDelta / zoom.level;
                var totalOffset = dragState.currentOffsetPx + dragState.dragDeltaPx;

                if (peaks.B) {
                    drawWaveformZoomed(canvasB, peaks.B, COLOR_B, totalOffset);
                }
                updateOffsetDisplay(totalOffset);
            });

            rowB.addEventListener('pointerup', function () {
                if (!dragState.active) return;
                dragState.active = false;
                dragState.currentOffsetPx += dragState.dragDeltaPx;
                dragState.dragDeltaPx = 0;
                rowB.classList.remove('dragging');
                commitOffset();
            });

            rowB.addEventListener('pointercancel', function () {
                dragState.active = false;
                dragState.dragDeltaPx = 0;
                rowB.classList.remove('dragging');
            });
        }
    }

    function setAdvancedMode(on) {
        isAdvancedMode = on;

        if (advancedBtn) {
            advancedBtn.classList.toggle('active', on);
            advancedBtn.textContent = on ? 'Advanced Align (ON)' : 'Advanced Align';
        }

        if (rowB) {
            rowB.classList.toggle('draggable', on);
        }

        if (offsetDisplay) offsetDisplay.classList.toggle('hidden', !on);
        if (resetOffsetBtn) resetOffsetBtn.classList.toggle('hidden', !on);

        if (on) {
            updateOffsetDisplay(dragState.currentOffsetPx);
        }
    }

    function commitOffset() {
        if (!duration || !canvasB) return;
        var parent = canvasB.parentElement;
        var displayWidth = parent.getBoundingClientRect().width;
        if (displayWidth < 1) return;

        // Convert pixel offset (at full zoom) to time offset in ms
        var offsetMs = (dragState.currentOffsetPx / displayWidth) * duration * 1000;
        AudioEngine.setTrackOffset(offsetMs);
        updateOffsetDisplay(dragState.currentOffsetPx);
    }

    function updateOffsetDisplay(offsetPx) {
        if (!offsetDisplay || !duration || !canvasB) return;
        var parent = canvasB.parentElement;
        var displayWidth = parent.getBoundingClientRect().width;
        if (displayWidth < 1) return;
        var offsetMs = Math.round((offsetPx / displayWidth) * duration * 1000);
        var sign = offsetMs >= 0 ? '+' : '';
        offsetDisplay.textContent = 'Offset: ' + sign + offsetMs + 'ms';
    }

    function resetOffset() {
        dragState.currentOffsetPx = 0;
        dragState.dragDeltaPx = 0;
        AudioEngine.setTrackOffset(0);
        redrawAll();
        updateOffsetDisplay(0);
    }

    function getOffset() {
        if (!duration || !canvasB) return 0;
        var parent = canvasB.parentElement;
        var displayWidth = parent.getBoundingClientRect().width;
        if (displayWidth < 1) return 0;
        return Math.round((dragState.currentOffsetPx / displayWidth) * duration * 1000);
    }

    // ---- Auto-Sync via Cross-Correlation ----

    function setupAutoSync() {
        if (!autoSyncBtn) return;
        autoSyncBtn.addEventListener('click', function () {
            autoSync();
        });
    }

    function autoSync() {
        if (!audioBuffers.A || !audioBuffers.B) {
            alert('Both tracks must be loaded before auto-syncing.');
            return;
        }
        if (isAutoSyncing) return;

        isAutoSyncing = true;
        if (autoSyncBtn) {
            autoSyncBtn.textContent = 'Analyzing...';
            autoSyncBtn.disabled = true;
        }

        setTimeout(function () {
            var offsetSamples = crossCorrelate(audioBuffers.A, audioBuffers.B);
            var sampleRate = audioBuffers.A.sampleRate;
            var offsetMs = Math.round((offsetSamples / sampleRate) * 1000);

            AudioEngine.setTrackOffset(offsetMs);

            // Update visual offset
            if (canvasB && canvasB.parentElement) {
                var displayWidth = canvasB.parentElement.getBoundingClientRect().width;
                if (displayWidth > 0) {
                    dragState.currentOffsetPx = (offsetMs / 1000 / duration) * displayWidth;
                    dragState.dragDeltaPx = 0;
                }
            }

            redrawAll();

            if (!isAdvancedMode) {
                setAdvancedMode(true);
            }
            updateOffsetDisplay(dragState.currentOffsetPx);

            isAutoSyncing = false;
            if (autoSyncBtn) {
                autoSyncBtn.textContent = 'Auto Sync';
                autoSyncBtn.disabled = false;
            }
        }, 50);
    }

    function crossCorrelate(bufferA, bufferB) {
        var sampleRate = bufferA.sampleRate;
        var analysisSeconds = 30;
        var maxSamples = Math.floor(analysisSeconds * sampleRate);
        var dsRate = 100;
        var chunkSize = Math.max(1, Math.floor(sampleRate / dsRate));

        var envA = getEnvelope(bufferA, chunkSize, maxSamples);
        var envB = getEnvelope(bufferB, chunkSize, maxSamples);

        var maxLagSeconds = 10;
        var maxLagDS = Math.floor(maxLagSeconds * dsRate);
        maxLagDS = Math.min(maxLagDS, Math.floor(Math.min(envA.length, envB.length) / 2));

        var compareLen = Math.min(envA.length, envB.length);
        var bestLag = 0;
        var bestCorr = -Infinity;

        for (var lag = -maxLagDS; lag <= maxLagDS; lag++) {
            var sum = 0;
            var count = 0;

            for (var i = 0; i < compareLen; i++) {
                var j = i + lag;
                if (j >= 0 && j < envB.length) {
                    sum += envA[i] * envB[j];
                    count++;
                }
            }

            if (count > 0) {
                var corr = sum / count;
                if (corr > bestCorr) {
                    bestCorr = corr;
                    bestLag = lag;
                }
            }
        }

        return bestLag * chunkSize;
    }

    function getEnvelope(audioBuffer, chunkSize, maxSamples) {
        var length = Math.min(audioBuffer.length, maxSamples || audioBuffer.length);
        var numChunks = Math.floor(length / chunkSize);
        var envelope = new Float32Array(numChunks);
        var data = audioBuffer.getChannelData(0);

        for (var c = 0; c < numChunks; c++) {
            var start = c * chunkSize;
            var end = start + chunkSize;
            var sumSq = 0;
            for (var s = start; s < end; s++) {
                sumSq += data[s] * data[s];
            }
            envelope[c] = Math.sqrt(sumSq / chunkSize);
        }

        return envelope;
    }

    /**
     * Set the visual waveform offset from a millisecond value (used by config loading).
     */
    function setOffsetFromMs(ms) {
        if (!duration || !canvasB) return;
        var parent = canvasB.parentElement;
        var displayWidth = parent ? parent.getBoundingClientRect().width : 0;
        if (displayWidth < 1) return;
        dragState.currentOffsetPx = (ms / 1000 / duration) * displayWidth;
        dragState.dragDeltaPx = 0;
        redrawAll();
        if (isAdvancedMode) {
            updateOffsetDisplay(dragState.currentOffsetPx);
        }
    }

    // ---- Public API ----

    return {
        init: init,
        loadTrack: loadTrack,
        updatePlayhead: updatePlayhead,
        setAdvancedMode: setAdvancedMode,
        getOffset: getOffset,
        resetOffset: resetOffset,
        autoSync: autoSync,
        zoomBy: zoomBy,
        resetZoom: resetZoom,
        setOffsetFromMs: setOffsetFromMs
    };
})();
