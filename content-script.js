/* global chrome */
(function () {
  'use strict';

  var INJECT_FLAG = 'data-apple-picker-injected';
  var OVERLAY_ID = 'apple-picker-overlay';
  var MAX_PATHS = 10;
  var MAX_PATH_LEN = 30;

  function inject() {
    var root = document.documentElement;
    if (root.hasAttribute(INJECT_FLAG)) return;
    root.setAttribute(INJECT_FLAG, '1');

    if (!window.chrome || !chrome.runtime || !chrome.runtime.getURL) {
      console.warn('[apple-picker] chrome.runtime.getURL not available');
      return;
    }

    var script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.async = true;
    script.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function median(nums) {
    if (!nums.length) return 0;
    var sorted = nums.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function clusterValues(values, tolerance) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var clusters = [];
    for (var i = 0; i < sorted.length; i++) {
      var v = sorted[i];
      if (!clusters.length || Math.abs(v - clusters[clusters.length - 1].last) > tolerance) {
        clusters.push({ sum: v, count: 1, last: v });
      } else {
        var c = clusters[clusters.length - 1];
        c.sum += v;
        c.count += 1;
        c.last = v;
      }
    }
    return clusters.map(function (c) { return c.sum / c.count; });
  }

  function inferGrid(tiles) {
    var xs = tiles.map(function (t) { return t.x; });
    var ys = tiles.map(function (t) { return t.y; });
    var xSorted = xs.slice().sort(function (a, b) { return a - b; });
    var ySorted = ys.slice().sort(function (a, b) { return a - b; });

    var xDiffs = [];
    var yDiffs = [];
    for (var i = 1; i < xSorted.length; i++) {
      var dx = xSorted[i] - xSorted[i - 1];
      if (dx > 0.5) xDiffs.push(dx);
    }
    for (var j = 1; j < ySorted.length; j++) {
      var dy = ySorted[j] - ySorted[j - 1];
      if (dy > 0.5) yDiffs.push(dy);
    }

    var xSpacing = median(xDiffs) || 1;
    var ySpacing = median(yDiffs) || 1;
    var xCenters = clusterValues(xs, xSpacing * 0.5);
    var yCenters = clusterValues(ys, ySpacing * 0.5);

    function assignIndex(v, centers, spacing) {
      if (!centers.length) return Math.round(v / spacing);
      var best = 0;
      var bestDist = Math.abs(v - centers[0]);
      for (var k = 1; k < centers.length; k++) {
        var d = Math.abs(v - centers[k]);
        if (d < bestDist) {
          bestDist = d;
          best = k;
        }
      }
      return best;
    }

    return {
      xCenters: xCenters,
      yCenters: yCenters,
      xSpacing: xSpacing,
      ySpacing: ySpacing,
      assign: function (t) {
        t.col = assignIndex(t.x, xCenters, xSpacing);
        t.row = assignIndex(t.y, yCenters, ySpacing);
        return t;
      }
    };
  }

  function findPathsSum10(tiles) {
    var results = [];
    var maxRow = 0;
    var maxCol = 0;
    var rows = new Map();
    var cols = new Map();
    tiles.forEach(function (t) {
      if (t.dropped) return;
      if (t.row > maxRow) maxRow = t.row;
      if (t.col > maxCol) maxCol = t.col;
      if (!rows.has(t.row)) rows.set(t.row, []);
      if (!cols.has(t.col)) cols.set(t.col, []);
      rows.get(t.row).push(t);
      cols.get(t.col).push(t);
    });

    function buildPrefix(rowsCount, colsCount, values) {
      var ps = [];
      for (var r = 0; r <= rowsCount; r++) {
        ps[r] = [];
        for (var c = 0; c <= colsCount; c++) {
          ps[r][c] = 0;
        }
      }
      for (var r1 = 1; r1 <= rowsCount; r1++) {
        for (var c1 = 1; c1 <= colsCount; c1++) {
          var v = values[r1 - 1][c1 - 1];
          ps[r1][c1] = v + ps[r1 - 1][c1] + ps[r1][c1 - 1] - ps[r1 - 1][c1 - 1];
        }
      }
      return ps;
    }

    function sumRect(ps, r1, c1, r2, c2) {
      return ps[r2 + 1][c2 + 1] - ps[r1][c2 + 1] - ps[r2 + 1][c1] + ps[r1][c1];
    }

    function addRectSolutions() {
      var rowsCount = maxRow + 1;
      var colsCount = maxCol + 1;
      var values = [];
      var counts = [];
      for (var r = 0; r < rowsCount; r++) {
        values[r] = [];
        counts[r] = [];
        for (var c = 0; c < colsCount; c++) {
          values[r][c] = 0;
          counts[r][c] = 0;
        }
      }
      tiles.forEach(function (t) {
        if (t.dropped) return;
        values[t.row][t.col] = t.nu;
        counts[t.row][t.col] = 1;
      });
      var psVal = buildPrefix(rowsCount, colsCount, values);
      var psCnt = buildPrefix(rowsCount, colsCount, counts);

      for (var r1 = 0; r1 < rowsCount; r1++) {
        for (var r2 = r1; r2 < rowsCount; r2++) {
          for (var c1 = 0; c1 < colsCount; c1++) {
            for (var c2 = c1; c2 < colsCount; c2++) {
              var cnt = sumRect(psCnt, r1, c1, r2, c2);
              if (cnt === 0 || cnt > MAX_PATH_LEN) continue;
              var sum = sumRect(psVal, r1, c1, r2, c2);
              if (sum === 10) {
                results.push({
                  type: 'rect',
                  r1: r1,
                  c1: c1,
                  r2: r2,
                  c2: c2,
                  count: cnt
                });
                if (results.length >= MAX_PATHS) return true;
              }
            }
          }
        }
      }
      return false;
    }

    function addLinePaths(list, axis) {
      list.sort(function (a, b) {
        return axis === 'row' ? a.col - b.col : a.row - b.row;
      });
      var n = list.length;
      var start = 0;
      var sum = 0;
      for (var end = 0; end < n; end++) {
        sum += list[end].nu;
        while (sum > 10 && start <= end) {
          sum -= list[start].nu;
          start += 1;
        }
        if (sum === 10) {
          var path = [];
          for (var i = start; i <= end; i++) {
            path.push(list[i].id);
          }
          if (path.length <= MAX_PATH_LEN) {
            results.push({ type: 'line', ids: path.slice() });
            if (results.length >= MAX_PATHS) return true;
          }
          sum -= list[start].nu;
          start += 1;
        }
      }
      return false;
    }

    if (addRectSolutions()) return results;

    rows.forEach(function (list) {
      if (addLinePaths(list, 'row')) return;
    });
    if (results.length >= MAX_PATHS) return results;
    cols.forEach(function (list) {
      if (addLinePaths(list, 'col')) return;
    });
    return results;
  }

  function pickPaths(paths) {
    if (!paths.length) return paths;
    var rects = paths.filter(function (p) { return p.type === 'rect'; });
    if (rects.length) {
      rects.sort(function (a, b) {
        if (a.count !== b.count) return b.count - a.count;
        var areaA = (a.r2 - a.r1 + 1) * (a.c2 - a.c1 + 1);
        var areaB = (b.r2 - b.r1 + 1) * (b.c2 - b.c1 + 1);
        return areaA - areaB;
      });
      return [rects[0]];
    }
    var lines = paths.filter(function (p) { return p.type === 'line'; });
    lines.sort(function (a, b) { return b.ids.length - a.ids.length; });
    return lines.length ? [lines[0]] : [];
  }

  function ensureOverlay() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;
    overlay = document.createElement('canvas');
    overlay.id = OVERLAY_ID;
    overlay.style.position = 'fixed';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '9999';
    document.body.appendChild(overlay);
    return overlay;
  }

  function drawOverlay(canvasEl, tiles, paths, stageSize, grid) {
    var gameCanvas = document.getElementById('canvas');
    if (!gameCanvas) return;
    var rect = gameCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    var overlay = ensureOverlay();
    overlay.width = Math.round(rect.width * window.devicePixelRatio);
    overlay.height = Math.round(rect.height * window.devicePixelRatio);
    overlay.style.left = rect.left + 'px';
    overlay.style.top = rect.top + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    var ctx = overlay.getContext('2d');
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    var scaleX = rect.width / (stageSize.width || rect.width);
    var scaleY = rect.height / (stageSize.height || rect.height);

    var byId = new Map();
    for (var i = 0; i < tiles.length; i++) {
      byId.set(tiles[i].id, tiles[i]);
    }

    var max = Math.min(paths.length, MAX_PATHS);
    var palette = ['#00C853'];
    for (var p = 0; p < max; p++) {
      var path = paths[p];
      var color = palette[p % palette.length];
      if (path.type === 'rect') {
        if (!grid || !grid.xCenters.length || !grid.yCenters.length) continue;
        var xL = grid.xCenters[path.c1] - grid.xSpacing / 2;
        var xR = grid.xCenters[path.c2] + grid.xSpacing / 2;
        var yT = grid.yCenters[path.r1] - grid.ySpacing / 2;
        var yB = grid.yCenters[path.r2] + grid.ySpacing / 2;
        var rx = xL * scaleX;
        var ry = yT * scaleY;
        var rw = (xR - xL) * scaleX;
        var rh = (yB - yT) * scaleY;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.fillStyle = 'rgba(0, 200, 83, 0.12)';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.restore();
        continue;
      }
      if (path.type !== 'line' || path.ids.length < 2) continue;
      var first = byId.get(path.ids[0]);
      var last = byId.get(path.ids[path.ids.length - 1]);
      if (!first || !last) continue;
      var x1 = (first.gx != null ? first.gx : first.x) * scaleX;
      var y1 = (first.gy != null ? first.gy : first.y) * scaleY;
      var x2 = (last.gx != null ? last.gx : last.x) * scaleX;
      var y2 = (last.gy != null ? last.gy : last.y) * scaleY;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = color;
      for (var m = 0; m < path.ids.length; m++) {
        var mt = byId.get(path.ids[m]);
        if (!mt) continue;
        var mx = (mt.gx != null ? mt.gx : mt.x) * scaleX;
        var my = (mt.gy != null ? mt.gy : mt.y) * scaleY;
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  var lastPayload = null;
  var rafPending = false;
  var overlayEnabled = true;

  function scheduleDraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      if (!lastPayload) return;
      if (!overlayEnabled) return;
      var tiles = lastPayload.tiles;
      var stageSize = lastPayload.stageSize || { width: 720, height: 470 };
      var gridInput = tiles.map(function (t) {
        return {
          id: t.id,
          nu: t.nu,
          x: (t.gx != null ? t.gx : t.x),
          y: (t.gy != null ? t.gy : t.y),
          gx: t.gx,
          gy: t.gy,
          dropped: t.dropped
        };
      });
      var grid = inferGrid(gridInput);
      var gridTiles = gridInput.map(function (t) {
        var assigned = grid.assign({
          id: t.id,
          nu: t.nu,
          x: t.x,
          y: t.y,
          gx: t.gx,
          gy: t.gy,
          dropped: t.dropped
        });
        return assigned;
      });
      var paths = pickPaths(findPathsSum10(gridTiles));
      drawOverlay(document.getElementById('canvas'), gridTiles, paths, stageSize, grid);
    });
  }

  function clearOverlay() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    var ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    var data = event.data;
    if (!data || data.source !== 'APPLE_PICKER' || data.type !== 'APPLE_PICKER_TILES') return;
    lastPayload = data.payload;
    scheduleDraw();
  });

  window.addEventListener('keydown', function (event) {
    if (event.ctrlKey && !event.shiftKey && event.key === 'Q') {
      overlayEnabled = !overlayEnabled;
      if (!overlayEnabled) clearOverlay();
    }
  });

  inject();
})();
