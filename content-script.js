/* global chrome */
(function () {
  'use strict';

  var INJECT_FLAG = 'data-apple-picker-injected';
  var OVERLAY_ID = 'apple-picker-overlay';
  var MAX_PATHS = 50;
  var MAX_PATH_LEN = 30;
  var STRATEGY_KEY = 'applePickerStrategy';
  var STRATEGIES = {
    MAX_COUNT_ANY: 'max_count_any',
    MAX_VALUE_FIRST: 'max_value_first',
    LOOKAHEAD_1: 'lookahead_1'
  };
  var currentStrategies = [];
  var storageReady = false;
  var STRATEGY_COLORS = {};
  STRATEGY_COLORS[STRATEGIES.MAX_COUNT_ANY] = '#00C853';
  STRATEGY_COLORS[STRATEGIES.MAX_VALUE_FIRST] = '#2962FF';
  STRATEGY_COLORS[STRATEGIES.LOOKAHEAD_1] = '#FF6D00';
  var STRATEGY_FILLS = {};
  STRATEGY_FILLS[STRATEGIES.MAX_COUNT_ANY] = 'rgba(0, 200, 83, 0.12)';
  STRATEGY_FILLS[STRATEGIES.MAX_VALUE_FIRST] = 'rgba(41, 98, 255, 0.12)';
  STRATEGY_FILLS[STRATEGIES.LOOKAHEAD_1] = 'rgba(255, 109, 0, 0.12)';
  var STRATEGY_VALUES = Object.keys(STRATEGIES).map(function (key) { return STRATEGIES[key]; });

  function isValidStrategy(value) {
    return STRATEGY_VALUES.indexOf(value) >= 0;
  }

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

  function getPathCount(path) {
    return path.type === 'rect' ? path.count : path.ids.length;
  }

  function getPathArea(path) {
    if (path.type === 'rect') {
      return (path.r2 - path.r1 + 1) * (path.c2 - path.c1 + 1);
    }
    return path.ids.length;
  }

  function getPathMaxValue(path, tiles, byId) {
    var max = -Infinity;
    if (path.type === 'rect') {
      for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        if (t.dropped) continue;
        if (t.row < path.r1 || t.row > path.r2) continue;
        if (t.col < path.c1 || t.col > path.c2) continue;
        if (t.nu > max) max = t.nu;
      }
      return max;
    }
    for (var j = 0; j < path.ids.length; j++) {
      var id = path.ids[j];
      var mt = byId.get(id);
      if (mt && mt.nu > max) max = mt.nu;
    }
    return max;
  }

  function applyPathRemoval(path, tiles) {
    if (path.type === 'rect') {
      for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        if (t.dropped) continue;
        if (t.row < path.r1 || t.row > path.r2) continue;
        if (t.col < path.c1 || t.col > path.c2) continue;
        t.dropped = true;
      }
      return;
    }
    for (var j = 0; j < path.ids.length; j++) {
      var id = path.ids[j];
      for (var k = 0; k < tiles.length; k++) {
        if (tiles[k].id === id) {
          tiles[k].dropped = true;
          break;
        }
      }
    }
  }

  function cloneTiles(tiles) {
    var out = [];
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      out.push({
        id: t.id,
        nu: t.nu,
        x: t.x,
        y: t.y,
        gx: t.gx,
        gy: t.gy,
        row: t.row,
        col: t.col,
        dropped: t.dropped
      });
    }
    return out;
  }

  function pathKey(path) {
    if (!path) return '';
    if (path.type === 'rect') {
      return 'rect:' + path.r1 + ',' + path.c1 + ',' + path.r2 + ',' + path.c2;
    }
    return 'line:' + path.ids.join(',');
  }

  function pickPath(paths, tiles, strategy, excludeKeys) {
    if (!paths.length) return null;
    var excluded = excludeKeys || new Set();
    if (strategy === STRATEGIES.MAX_COUNT_ANY) {
      var scored = paths.map(function (p) {
        return { path: p, count: getPathCount(p), area: getPathArea(p) };
      });
      scored.sort(function (a, b) {
        if (a.count !== b.count) return b.count - a.count;
        return a.area - b.area;
      });
      for (var s = 0; s < scored.length; s++) {
        var key = pathKey(scored[s].path);
        if (!excluded.has(key)) return scored[s].path;
      }
      return null;
    }
    if (strategy === STRATEGIES.MAX_VALUE_FIRST) {
      var byId = new Map();
      for (var i = 0; i < tiles.length; i++) {
        byId.set(tiles[i].id, tiles[i]);
      }
      var scoredValue = paths.map(function (p) {
        return {
          path: p,
          maxValue: getPathMaxValue(p, tiles, byId),
          count: getPathCount(p),
          area: getPathArea(p)
        };
      });
      scoredValue.sort(function (a, b) {
        if (a.maxValue !== b.maxValue) return b.maxValue - a.maxValue;
        if (a.count !== b.count) return a.count - b.count;
        return a.area - b.area;
      });
      for (var sv = 0; sv < scoredValue.length; sv++) {
        var keyValue = pathKey(scoredValue[sv].path);
        if (!excluded.has(keyValue)) return scoredValue[sv].path;
      }
      return null;
    }
    if (strategy === STRATEGIES.LOOKAHEAD_1) {
      var MAX_BRANCH = 12;
      var DEPTH = 2;

      function scorePaths(nextPaths, nextTiles, depth) {
        if (!nextPaths.length || depth <= 0) return 0;
        nextPaths.sort(function (a, b) { return getPathCount(b) - getPathCount(a); });
        nextPaths = nextPaths.slice(0, MAX_BRANCH);
        var best = 0;
        for (var i = 0; i < nextPaths.length; i++) {
          var p = nextPaths[i];
          var localCount = getPathCount(p);
          var sim = cloneTiles(nextTiles);
          applyPathRemoval(p, sim);
          var following = findPathsSum10(sim);
          var optionScore = Math.min(following.length, 20) * 0.1;
          var total = localCount + optionScore + scorePaths(following, sim, depth - 1);
          if (total > best) best = total;
        }
        return best;
      }

      var candidates = paths.slice();
      candidates.sort(function (a, b) { return getPathCount(b) - getPathCount(a); });
      candidates = candidates.slice(0, MAX_BRANCH);
      var scoredLook = [];
      for (var j = 0; j < candidates.length; j++) {
        var cur = candidates[j];
        var curCount = getPathCount(cur);
        var simTiles = cloneTiles(tiles);
        applyPathRemoval(cur, simTiles);
        var nextPaths = findPathsSum10(simTiles);
        var optionScore = Math.min(nextPaths.length, 20) * 0.2;
        var score = curCount + optionScore + scorePaths(nextPaths, simTiles, DEPTH - 1);
        scoredLook.push({ path: cur, score: score, area: getPathArea(cur) });
      }
      scoredLook.sort(function (a, b) {
        if (a.score !== b.score) return b.score - a.score;
        return a.area - b.area;
      });
      for (var sl = 0; sl < scoredLook.length; sl++) {
        var keyLook = pathKey(scoredLook[sl].path);
        if (!excluded.has(keyLook)) return scoredLook[sl].path;
      }
      return null;
    }
    return null;
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

  function drawOverlay(canvasEl, tiles, paths, stageSize, grid, scaleFix) {
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

    var scaleX = scaleFix && scaleFix.x ? scaleFix.x : rect.width / (stageSize.width || rect.width);
    var scaleY = scaleFix && scaleFix.y ? scaleFix.y : rect.height / (stageSize.height || rect.height);

    var byId = new Map();
    for (var i = 0; i < tiles.length; i++) {
      byId.set(tiles[i].id, tiles[i]);
    }

    var max = Math.min(paths.length, MAX_PATHS);
    for (var p = 0; p < max; p++) {
      var path = paths[p];
      var color = path.color || '#00C853';
      if (path.type === 'rect') {
        if (!grid || !grid.xCenters.length || !grid.yCenters.length) continue;
        var minX = null;
        var maxX = null;
        var minY = null;
        var maxY = null;
        for (var t1 = 0; t1 < tiles.length; t1++) {
          var tt = tiles[t1];
          if (tt.dropped) continue;
          if (tt.row < path.r1 || tt.row > path.r2) continue;
          if (tt.col < path.c1 || tt.col > path.c2) continue;
          var cx = grid.xCenters[tt.col];
          var cy = grid.yCenters[tt.row];
          if (minX == null || cx < minX) minX = cx;
          if (maxX == null || cx > maxX) maxX = cx;
          if (minY == null || cy < minY) minY = cy;
          if (maxY == null || cy > maxY) maxY = cy;
        }
        if (minX == null || minY == null) continue;
        var xL = minX - grid.xSpacing / 2;
        var xR = maxX + grid.xSpacing / 2;
        var yT = minY - grid.ySpacing / 2;
        var yB = maxY + grid.ySpacing / 2;
        var rx = xL * scaleX;
        var ry = yT * scaleY;
        var rw = (xR - xL) * scaleX;
        var rh = (yB - yT) * scaleY;
        var inset = path.inset || 0;
        rx += inset;
        ry += inset;
        rw = Math.max(0, rw - inset * 2);
        rh = Math.max(0, rh - inset * 2);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.fillStyle = 'rgba(0, 200, 83, 0.12)';
        if (path.fill) ctx.fillStyle = path.fill;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.restore();
        continue;
      }
      if (path.type !== 'line' || path.ids.length < 2) continue;
      if (!grid || !grid.xCenters.length || !grid.yCenters.length) continue;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.fillStyle = path.fill || 'rgba(0, 200, 83, 0.12)';
      for (var m = 0; m < path.ids.length; m++) {
        var mt = byId.get(path.ids[m]);
        if (!mt) continue;
        var lcx = grid.xCenters[mt.col];
        var lcy = grid.yCenters[mt.row];
        var lxL = lcx - grid.xSpacing / 2;
        var lyT = lcy - grid.ySpacing / 2;
        var lrx = lxL * scaleX;
        var lry = lyT * scaleY;
        var lrw = grid.xSpacing * scaleX;
        var lrh = grid.ySpacing * scaleY;
        var inset = path.inset || 0;
        lrx += inset;
        lry += inset;
        lrw = Math.max(0, lrw - inset * 2);
        lrh = Math.max(0, lrh - inset * 2);
        ctx.strokeRect(lrx, lry, lrw, lrh);
        ctx.fillRect(lrx, lry, lrw, lrh);
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
      var scaleFix = null;
      if (lastPayload.stageScaleX && window.devicePixelRatio) {
        scaleFix = {
          x: lastPayload.stageScaleX / window.devicePixelRatio,
          y: lastPayload.stageScaleY / window.devicePixelRatio
        };
      }
      var gridInput = tiles.map(function (t) {
        return {
          id: t.id,
          nu: t.nu,
          x: t.x,
          y: t.y,
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
      if (!currentStrategies.length) {
        clearOverlay();
        return;
      }
      var allPaths = findPathsSum10(gridTiles);
      var picked = [];
      var pickedKeys = new Set();
      for (var i = 0; i < currentStrategies.length; i++) {
        var strategy = currentStrategies[i];
        var chosen = pickPath(allPaths, gridTiles, strategy, pickedKeys);
        if (!chosen) continue;
        var copy = {};
        for (var key in chosen) copy[key] = chosen[key];
        copy.color = STRATEGY_COLORS[strategy] || '#00C853';
        copy.fill = STRATEGY_FILLS[strategy] || 'rgba(0, 200, 83, 0.12)';
        copy.inset = 0;
        // copy.inset = i * 2; // 전략 별 인레이 사각형 크기 다르게.
        picked.push(copy);
        pickedKeys.add(pathKey(chosen));
      }
      drawOverlay(document.getElementById('canvas'), gridTiles, picked, stageSize, grid, scaleFix);
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
    if (event.ctrlKey && !event.shiftKey && event.key === 'S') {
      currentStrategies = [STRATEGIES.MAX_COUNT_ANY];
      if (storageReady && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ applePickerStrategy: currentStrategies });
      }
    }
  });

  if (chrome && chrome.storage && chrome.storage.local) {
    storageReady = true;
    chrome.storage.local.get({ applePickerStrategy: currentStrategies }, function (data) {
      if (!data) return;
      if (Array.isArray(data.applePickerStrategy)) {
        currentStrategies = data.applePickerStrategy.filter(function (s) { return isValidStrategy(s); });
        if (!currentStrategies.length) clearOverlay();
      } else if (isValidStrategy(data.applePickerStrategy)) {
        currentStrategies = [data.applePickerStrategy];
      }
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      if (changes.applePickerStrategy) {
        var nextValue = changes.applePickerStrategy.newValue;
        if (Array.isArray(nextValue)) {
          currentStrategies = nextValue.filter(function (s) { return isValidStrategy(s); });
          if (!currentStrategies.length) clearOverlay();
        } else if (isValidStrategy(nextValue)) {
          currentStrategies = [nextValue];
        }
      }
    });
  }

  inject();
})();
