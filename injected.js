(function () {
  'use strict';

  var COMPOSITION_ID = '7475C6A158E3BF4B8C03C4B79FFD5BA3';
  var POLL_MS = 200;
  var MAX_TILES = 500;

  function safeGetExportRoot() {
    if (window.exportRoot) return window.exportRoot;
    if (window.stage && typeof window.stage.getChildAt === 'function') {
      try {
        return window.stage.getChildAt(0);
      } catch (e) {}
    }
    try {
      if (window.AdobeAn && typeof window.AdobeAn.getComposition === 'function') {
        var comp = window.AdobeAn.getComposition(COMPOSITION_ID);
        if (comp && comp.getStage) {
          var stage = comp.getStage();
          if (stage && stage.getChildAt) return stage.getChildAt(0);
        }
      }
    } catch (e2) {}
    return null;
  }

  function walk(root, predicate, maxNodes) {
    var queue = [root];
    var visited = new Set();
    var count = 0;
    while (queue.length && count < maxNodes) {
      var node = queue.shift();
      if (!node || visited.has(node)) continue;
      visited.add(node);
      count += 1;
      if (predicate(node)) return node;
      if (node.children && node.children.length) {
        for (var i = 0; i < node.children.length; i++) {
          queue.push(node.children[i]);
        }
      }
      if (node._children && node._children.length) {
        for (var j = 0; j < node._children.length; j++) {
          queue.push(node._children[j]);
        }
      }
    }
    return null;
  }

  function findMm(exportRoot) {
    if (!exportRoot) return null;
    if (exportRoot.mm) return exportRoot.mm;
    if (typeof exportRoot.getChildByName === 'function') {
      try {
        var mmBase = exportRoot.getChildByName('mm_base');
        if (mmBase) {
          if (mmBase.mm) return mmBase.mm;
          if (mmBase.children && mmBase.children.length) return mmBase.children[0];
        }
      } catch (e) {}
    }
    return walk(exportRoot, function (node) {
      return node && node.mg;
    }, 1000);
  }

  function looksLikeTile(node) {
    return node && typeof node.nu === 'number' && typeof node.x === 'number' && typeof node.y === 'number';
  }

  function findMg(mm) {
    if (!mm) return null;
    if (mm.mg) return mm.mg;
    return walk(mm, function (node) {
      if (!node) return false;
      if (node.children && node.children.length >= 50) {
        var hits = 0;
        for (var i = 0; i < node.children.length; i++) {
          if (looksLikeTile(node.children[i])) hits += 1;
          if (hits >= 20) return true;
        }
      }
      return false;
    }, 1500);
  }

  function getTileList(mg) {
    var tiles = [];
    if (!mg) return tiles;
    if (mg.children && mg.children.length) {
      for (var i = 0; i < mg.children.length; i++) {
        tiles.push(mg.children[i]);
        if (tiles.length >= MAX_TILES) break;
      }
    } else {
      for (var k in mg) {
        if (!Object.prototype.hasOwnProperty.call(mg, k)) continue;
        if (/^mk\d+$/.test(k)) {
          tiles.push(mg[k]);
          if (tiles.length >= MAX_TILES) break;
        }
      }
    }
    return tiles.filter(looksLikeTile);
  }

  function toGlobal(tile, stage) {
    if (tile && typeof tile.localToGlobal === 'function') {
      try {
        return tile.localToGlobal(0, 0);
      } catch (e) {}
    }
    if (stage && typeof stage.localToGlobal === 'function') {
      try {
        return stage.localToGlobal(tile.x || 0, tile.y || 0);
      } catch (e2) {}
    }
    return { x: tile.x || 0, y: tile.y || 0 };
  }

  function getStageSize() {
    try {
      if (window.AdobeAn && window.AdobeAn.getComposition) {
        var comp = window.AdobeAn.getComposition(COMPOSITION_ID);
        if (comp && comp.getLibrary && comp.getLibrary().properties) {
          return {
            width: comp.getLibrary().properties.width,
            height: comp.getLibrary().properties.height
          };
        }
      }
    } catch (e) {}
    return { width: 720, height: 470 };
  }

  function snapshot() {
    var exportRoot = safeGetExportRoot();
    if (!exportRoot) return null;
    var mm = findMm(exportRoot);
    if (!mm) return null;
    var mg = findMg(mm);
    if (!mg) return null;
    var tiles = getTileList(mg);
    var stage = window.stage || (window.AdobeAn && window.AdobeAn.getComposition && window.AdobeAn.getComposition(COMPOSITION_ID) && window.AdobeAn.getComposition(COMPOSITION_ID).getStage && window.AdobeAn.getComposition(COMPOSITION_ID).getStage());
    var stageSize = getStageSize();

    var out = [];
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      var gp = toGlobal(t, stage);
      out.push({
        id: t.name || t.id || ('mk' + i),
        nu: t.nu,
        x: t.x,
        y: t.y,
        gx: gp.x,
        gy: gp.y,
        dropped: !!t.flDroped
      });
    }
    return { tiles: out, stageSize: stageSize, ts: Date.now() };
  }

  function post(data) {
    window.postMessage(
      {
        source: 'APPLE_PICKER',
        type: 'APPLE_PICKER_TILES',
        payload: data
      },
      '*'
    );
  }

  function loop() {
    try {
      var data = snapshot();
      if (data) post(data);
    } catch (e) {}
    setTimeout(loop, POLL_MS);
  }

  loop();
})();
