/*!
 * reveal.js-termcluster 1.4.0
 * Interactive word clouds for reveal.js — great as an advance organizer:
 * show the key terms of a topic up front, then tap a word to bring it into focus.
 * Author words as a simple list (a leading number sets the size). Ships its own
 * CSS and bundles wordcloud2.js for the dense packing. Works offline (no CDN).
 * @author  Florian Loyns
 * @license MIT
 * Bundles wordcloud2.js by Tim Guan-tin Chien (MIT) — see plugin/termcluster/vendor/LICENSE.
 * Requirement: load vendor/wordcloud2.js BEFORE this script.
 * Docs, options & data-* overrides: see README.
 */
'use strict';

  /* ---- Druck: überall gleich erkannt und gleich ausgegeben ----
     reveal.js baut die Druckansicht mit ?print-pdf in der URL (oder view:'print'
     in der Konfiguration) und setzt dann nur Klassen an <html>; @media print greift
     erst im Druckdialog. Darum jede Druckregel zweimal: für den Druckdialog und
     für die ?print-pdf-Ansicht – so sieht die Vorschau im Browser aus wie das PDF. */
  function isPrintView(deck){
    if (/(?:\?|&)print-pdf\b/i.test(window.location.search)) return true;
    var c = deck && deck.getConfig ? deck.getConfig() : null;
    return !!(c && c.view === 'print');
  }
  function printCSS(css){
    var pdf = css.replace(/(^|\})([^{}]+)\{/g, function (m, vor, sel) {
      return vor + sel.split(',').map(function (s) { return 'html.print-pdf ' + s.trim(); }).join(',') + '{';
    });
    return '@media print{' + css + '}' + pdf;
  }

  function injectCSS(){
    if (document.getElementById('termcluster-css')) return;
    var css =
      ".reveal .termcluster{position:relative;width:1160px;max-width:100%;height:540px;margin:0 auto}"
    + ".reveal .termcluster span{line-height:1;-webkit-user-select:none;user-select:none}"
    + printCSS(".reveal .termcluster span{color:#111 !important;opacity:1 !important;text-shadow:none !important}");
    var s = document.createElement('style');
    s.id = 'termcluster-css'; s.textContent = css;
    document.head.appendChild(s);
  }

  var SCHEMES = {
    /* c = classic, vivid = default layout, compact = vivid fallback for long lists */
    marine: { c:['#12294A','#1E3452','#2C4A6E','#3E5677','#55697F','#6E7E90'], compact:['#142D4E','#274668','#3D5B79','#526B83'], vivid:['#1E3452','#2C4A6E','#3E5677','#55697F'], focus:'#2C4A6E', dim:'#CBD5E0' },
    green:  { c:['#173404','#27500A','#3B6D11','#4F7D18','#6E9A34','#9CC06A'], compact:['#173B12','#2D5825','#497141','#638661'], vivid:['#173B12','#28582B','#477F59','#709B77'], focus:'#173404', dim:'#CBD5E0' },
    warm:   { c:['#7A2E12','#9A3B17','#C05621','#D97706','#DF9440','#E9BB82'], compact:['#793118','#93451F','#AD612C','#BA793D'], vivid:['#793118','#9D491C','#C07B35','#D49B67'], focus:'#7A2E12', dim:'#E6D8C7' },
    dark:   { c:['#F2F7FF','#D2E1F3','#B0C7E4','#8FADD2','#7091B8','#57769A'], compact:['#F1F6FF','#D4E2F5','#B6CCE8','#96B4D6'], vivid:['#F1F6FF','#D4E2F5','#B6CCE8','#96B4D6'], focus:'#FFFFFF', dim:'#3A4E6A' }
  };
  function ramp(scheme, weight){
    var i = weight >= 7 ? 0 : weight >= 6 ? 1 : weight >= 5 ? 2 : weight >= 4 ? 3 : weight >= 3 ? 4 : 5;
    return scheme.c[i];
  }

  function compactColor(scheme, score){
    return scheme.compact[score >= 0.76 ? 0 : score >= 0.48 ? 1 : score >= 0.22 ? 2 : 3];
  }
  function clamp(n, min, max){ return Math.min(max, Math.max(min, n)); }

  /* Ein fester Seed gilt für alle Durchläufe derselben Wolke. Das verändert
     weder Math.random global noch das Verhalten anderer reveal-Plugins. */
  function hashString(s){
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i); h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function seededRandom(seed){
    var state = seed >>> 0;
    return function(){
      state += 0x6D2B79F5;
      var x = state;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  function balanceWords(words, full){
    var weights = words.map(function(x){ return x.weight; });
    var low = Math.min.apply(null, weights), high = Math.max.apply(null, weights);
    var span = Math.sqrt(high) - Math.sqrt(low);
    return words.map(function(x, i){
      var score = span > 0 ? (Math.sqrt(x.weight) - Math.sqrt(low)) / span : 0.5;
      /* Vivid: ausgepraegte Typo-Hierarchie, kleine Woerter bleiben lesbar.
         Kompakt (lange Listen): gleichmaessigere Groessen. */
      var size = full ? 22 + 91 * Math.pow(score, 1.42) : 24 + score * 55;
      return { text:x.text, size:size, score:score, index:i };
    }).sort(function(a,b){ return b.size - a.size || a.index - b.index; });
  }

  function vividColor(scheme, score, word){
    var colors = scheme.vivid;
    /* Marine: nur marineblaue Wortfarben; auch der Klick-Fokus nutzt das Hauptblau #2C4A6E.
       Andere Farbschemata behalten ihre bestehenden Akzente. */
    if (scheme !== SCHEMES.marine && score > 0.16 && score < 0.73 && (hashString(word) % 5 === 0)) {
      if (scheme === SCHEMES.green) return '#7A8626';
      if (scheme === SCHEMES.warm) return '#A05672';
    }
    return colors[score > 0.80 ? 0 : score > 0.51 ? 1 : score > 0.24 ? 2 : 3];
  }

  /* Grobe Dichte-Schätzung vor dem Packen. Der Scale-Faktor ist für ALLE Wörter
     gleich und kann später im Ganzen reduziert werden; keine Einzel-Schrumpfung. */
  function initialScale(words, W, H, font){
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return 1;
    var area = 0;
    words.forEach(function(x){
      ctx.font = (x.size >= 46 ? '700 ' : '600 ') + x.size + 'px ' + font;
      area += ctx.measureText(x.text).width * x.size * 1.08;
    });
    return clamp(Math.sqrt((W * H * 0.44) / Math.max(area, 1)), 0.72, 1.25);
  }

  /* Bewerte mehrere deterministische Packungen anhand ihrer tatsächlichen
     Text-Rechtecke: zentrale Lücken, Links/Rechts-/Oben/Unten-Balance und
     Kompaktheit. Keine individuellen Schriftgrößen werden verändert. */
  function layoutQuality(stage, W, H){
    var spans = stage.querySelectorAll('span');
    if (!spans.length) return -Infinity;
    var root = stage.getBoundingClientRect();
    var minX = W, minY = H, maxX = 0, maxY = 0;
    var area = 0, centerX = 0, centerY = 0;
    var left = 0, right = 0, upper = 0, lower = 0;
    var rects = [];
    [].forEach.call(spans, function(sp){
      var r = sp.getBoundingClientRect();
      var x1 = clamp(r.left - root.left, 0, W), x2 = clamp(r.right - root.left, 0, W);
      var y1 = clamp(r.top - root.top, 0, H), y2 = clamp(r.bottom - root.top, 0, H);
      if (x2 <= x1 || y2 <= y1) return;
      var a = (x2 - x1) * (y2 - y1);
      var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      minX = Math.min(minX, x1); maxX = Math.max(maxX, x2);
      minY = Math.min(minY, y1); maxY = Math.max(maxY, y2);
      area += a; centerX += cx * a; centerY += cy * a;
      left += a * (cx < W / 2 ? 1 : 0);
      right += a * (cx >= W / 2 ? 1 : 0);
      upper += a * (cy < H / 2 ? 1 : 0);
      lower += a * (cy >= H / 2 ? 1 : 0);
      rects.push({ x1:x1, x2:x2, y1:y1, y2:y2 });
    });
    if (!area) return -Infinity;
    centerX /= area; centerY /= area;
    var bounds = Math.max(1, (maxX - minX) * (maxY - minY));
    var imbalance = Math.abs(left - right) / area + Math.abs(upper - lower) / area;
    var drift = Math.abs(centerX / W - 0.5) + Math.abs(centerY / H - 0.5);
    /* Innerhalb des belegten Bereichs freie Zellen nahe der Mitte
       besonders stark bestrafen, statt nur rechteckige Dichte zu zählen. */
    var cells = 0, used = 0, centralHoles = 0;
    var cols = 22, rows = 12;
    for (var gy = 0; gy < rows; gy++) {
      for (var gx = 0; gx < cols; gx++) {
        var x = minX + (gx + 0.5) * (maxX - minX) / cols;
        var y = minY + (gy + 0.5) * (maxY - minY) / rows;
        var dx = (x - (minX + maxX) / 2) / Math.max(1, (maxX - minX) / 2);
        var dy = (y - (minY + maxY) / 2) / Math.max(1, (maxY - minY) / 2);
        if (dx * dx + dy * dy > 0.85) continue;
        cells++;
        var occupied = rects.some(function(r){
          return x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2;
        });
        if (occupied) used++;
        else if (dx * dx + dy * dy < 0.24) centralHoles++;
      }
    }
    var occupancy = used / Math.max(1, cells);
    var base = 2.4 * occupancy - 0.9 * imbalance - 1.8 * drift -
      0.7 * centralHoles / Math.max(1, cells) +
      0.25 * Math.min(1, area / bounds);
    /* Eine grosszuegige Silhouette in Breite und Hoehe belohnen. */
    return base + 0.88 * (maxX - minX) / W + 1.12 * (maxY - minY) / H;
  }

  /* automatische, stabile Größenstreuung, falls keine data-weight gesetzt sind */
  var PATTERN = [6,3,4,2,5,3,7,2,4,3,5,2,6,3,4,2,5,3];

  function readWords(cloud){
    var els = [].slice.call(cloud.querySelectorAll('span,li,p'));
    var words;
    if (els.length) {
      /* Auszeichnung per Elementen: <span data-weight="9">Wort</span> */
      words = els.map(function(s){
        var w = parseFloat(s.getAttribute('data-weight'));
        return { text:(s.textContent||'').trim(), weight:(isNaN(w)?0:w) };
      });
    } else {
      /* Liste als Text: eine Zeile pro Wort, Zahl davor -> "9 Insulin", "6 Typ 2".
         Ohne Zahl: nur das Wort (Größe wird automatisch vergeben). */
      words = (cloud.textContent || '').split(/\r?\n/).map(function(line){
        line = line.trim(); if (!line) return null;
        var m = line.match(/^(\d+(?:[.,]\d+)?)[\s.:;\-]+(.+)$/);      // "9 Insulin"
        if (m) return { text: m[2].trim(), weight: parseFloat(m[1].replace(',', '.')) };
        var m2 = line.match(/^(.+?)[;,\t]\s*(\d+(?:[.,]\d+)?)$/);     // "Insulin; 9"
        if (m2) return { text: m2[1].trim(), weight: parseFloat(m2[2].replace(',', '.')) };
        return { text: line, weight: 0 };
      }).filter(Boolean);
    }
    words = words.filter(function(x){ return x.text; });
    var anyW = words.some(function(x){ return x.weight > 0; });
    if (!anyW) {
      words.forEach(function(x,i){ x.weight = PATTERN[i % PATTERN.length]; });
    } else {
      /* Gemischte Listen: fehlende Gewichte erhalten das untere Quartil statt 0. */
      var known = words.filter(function(x){ return x.weight > 0; })
        .map(function(x){ return x.weight; }).sort(function(a,b){ return a-b; });
      var q = (known.length - 1) * 0.25;
      var a = Math.floor(q), b = Math.ceil(q);
      var fallback = known[a] + (known[b] - known[a]) * (q - a);
      words.forEach(function(x){ if (!(x.weight > 0)) x.weight = fallback; });
    }
    return words;
  }

  function wireFocus(cloud, focus, dim){
    var spans = cloud.querySelectorAll('span');
    var focused = null;
    [].forEach.call(spans, function(sp){
      sp.dataset.base = sp.style.color;
      sp.dataset.tf = sp.style.transform || '';                 // Rotation merken
      sp.dataset.to = sp.style.transformOrigin || '';
      sp.style.cursor = 'pointer';
      sp.style.transition = 'color .2s ease,opacity .2s ease,text-shadow .2s ease,transform .2s ease';
      sp.addEventListener('pointerdown', function(e){ e.stopPropagation(); });
      sp.addEventListener('click', function(e){
        e.stopPropagation(); e.preventDefault();
        focused = (focused === sp) ? null : sp;
        [].forEach.call(spans, function(p){
          var on = (focused === p);
          p.style.color = on ? focus : (focused ? dim : p.dataset.base);
          p.style.opacity = (focused === null || on) ? '1' : '0.22';
          p.style.textShadow = on ? '0 5px 20px rgba(0,0,0,.38)' : 'none';
          if (on){
            p.style.transformOrigin = 'center center';
            p.style.transform = (p.dataset.tf + ' scale(1.15)').trim();
            p.style.zIndex = '30';
          } else {
            p.style.transform = p.dataset.tf;
            p.style.transformOrigin = p.dataset.to;
            p.style.zIndex = '';
          }
        });
      });
    });
  }

  function renderCloud(cloud, o){
    if (cloud.getAttribute('data-tc-init')) return;
    if (!window.WordCloud) {                                  // Bibliothek fehlt -> sichtbarer Hinweis
      cloud.setAttribute('data-tc-init', '1');
      cloud.innerHTML = '<div style="color:#D14A4A;font-size:20px">wordcloud2.js (vendor) nicht geladen – Pfad prüfen.</div>';
      return;
    }
    if (!cloud.clientWidth || !cloud.clientHeight) {          // Folie noch nicht vermessbar -> später erneut
      if ((cloud._tcTry = (cloud._tcTry || 0) + 1) < 60) requestAnimationFrame(function(){ renderCloud(cloud, o); });
      return;
    }
    cloud.setAttribute('data-tc-init', '1');

    var words = readWords(cloud);
    if (!words.length) return;
    cloud.innerHTML = '';

    /* Zwei Layouts: vivid (Standard) und classic (Renderer vor 1.2).
       Fruehere Zwischenmodi (expressive, balanced) werden als vivid dargestellt. */
    var ds = cloud.dataset;
    var num = function(v, d){
      var n = (v != null && v !== '') ? parseFloat(v) : NaN;
      return isFinite(n) ? n : d;
    };
    var vivid = (ds.layout || o.layout) !== 'classic';
    var shape = ds.shape || o.shape || 'circle';
    var ellipticity = clamp(num(ds.ellipticity, o.ellipticity != null ? o.ellipticity : (vivid ? 0.62 : 0.65)), 0, 1);
    var gridSize = Math.max(2, num(ds.grid, o.gridSize != null ? o.gridSize : (vivid ? 10 : 12)));
    var weightFactor = Math.max(0.1, num(ds.size, o.weightFactor != null ? o.weightFactor : 7));
    var minFontSize = Math.max(1, num(ds.minFont, o.minFontSize != null ? o.minFontSize : 20));
    var angles = ds.angles || o.angles || '90';
    var rotateRatio = clamp(num(ds.rotate, o.rotateRatio != null ? o.rotateRatio : (vivid ? 0.28 : 0.24)), 0, 1);
    var scheme = SCHEMES[ds.colors || o.colors] || SCHEMES.marine;
    var rSteps = 2, rMin = 0, rMax = Math.PI / 2;
    if (angles === '0') { rotateRatio = 0; rSteps = 1; rMin = 0; rMax = 0; }
    else if (angles === 'any') { rSteps = 0; rMin = -Math.PI / 2; rMax = Math.PI / 2; }

    /* Einzelne Karten setzen eine historische, fixe Wolkenhoehe (oft 470px).
       Im Vivid-Modus darf eine alleinstehende Wolke den freien Kartenbereich
       nutzen, ohne bestehendes HTML/CSS oder benachbarte Elemente anzufassen.
       Die CSS-Hoehe wird nur vergroessert, nie verkleinert. */
    if (vivid && !o.printView && cloud.parentElement &&
        cloud.parentElement.classList.contains('s-body') &&
        cloud.parentElement.children.length === 1) {
      var room = cloud.parentElement.clientHeight;
      if (room > cloud.clientHeight + 28) {
        cloud.style.setProperty('height', Math.min(580, room - 8) + 'px', 'important');
      }
    }

    /* Außerhalb der von reveal skalierten Folie messen und packen. */
    var W = cloud.clientWidth, H = cloud.clientHeight;
    var stage = document.createElement('div');
    stage.style.cssText = 'position:absolute;left:0;top:-10000px;visibility:hidden;width:' + W + 'px;height:' + H + 'px';
    document.body.appendChild(stage);

    var finished = false, timer, timeoutFallback;
    function finish(){
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      while (stage.firstChild) cloud.appendChild(stage.firstChild);
      if (stage.parentNode) stage.parentNode.removeChild(stage);
      wireFocus(cloud, scheme.focus, scheme.dim);
    }
    timer = setTimeout(function(){
      if (!finished && window.console && console.warn) console.warn('TermCluster: Layout-Zeitlimit erreicht.');
      if (timeoutFallback) timeoutFallback(); else finish();
    }, 12000);

    function paintClassic(){
      stage.addEventListener('wordcloudstop', finish, { once:true });
      window.WordCloud(stage, {
        list: words.map(function(x){ return [x.text, x.weight]; }),
        fontFamily: o.font,
        fontWeight: function(w, weight){ return weight >= 5 ? '700' : '600'; },
        color: function(w, weight){ return ramp(scheme, weight); },
        weightFactor: weightFactor, gridSize: gridSize,
        shape: shape, ellipticity: ellipticity, rotateRatio: rotateRatio,
        rotationSteps: rSteps, minRotation: rMin, maxRotation: rMax,
        drawOutOfBound: false, shrinkToFit: true, wait: 4,
        backgroundColor: 'transparent'
      });
    }

    function paintVivid(){
      /* Bei sehr grossen Wortlisten wird automatisch auf eine kompaktere
         Typografie umgeschaltet, damit keine Woerter ausfallen. */
      var full = words.length <= 38;
      var effectiveRotate = full ? rotateRatio : Math.min(rotateRatio, 0.10);
      var arranged = balanceWords(words, full);
      /* Sehr lange Hauptbegriffe (z. B. "Pflegeberufegesetz") duerfen nie breiter
         als die Wolke werden, sonst fielen gerade die wichtigsten Woerter weg.
         Nur solche Woerter werden einzeln begrenzt; alle anderen bleiben gleich. */
      var capCtx = document.createElement('canvas');
      capCtx = capCtx.getContext && capCtx.getContext('2d');
      arranged.forEach(function(x){
        x.cap = Infinity;
        if (!capCtx) return;
        capCtx.font = '700 100px ' + o.font;
        var w = capCtx.measureText(x.text).width;
        if (w > 0) x.cap = 100 * (W * 0.94) / w;
      });
      var total = arranged.length;
      var smallest = Math.min.apply(null, arranged.map(function(x){ return x.size; }));
      /* Keine Schrift unter der Mindestgröße; wenn keine vollständige Wolke
         mehr möglich ist, wird die beste Teilplatzierung sichtbar markiert. */
      var floorScale = minFontSize / smallest;
      var scale = Math.max(floorScale, initialScale(arranged, W, H, o.font) * weightFactor / 7);
      if (full) scale *= 1.10;
      var seed = hashString(String(ds.seed != null ? ds.seed : (o.seed != null ? o.seed : '')) +
        '|' + W + 'x' + H + '|' + shape + '|' + ellipticity + '|' + gridSize +
        '|' + angles + '|' + effectiveRotate + '|' + arranged.map(function(x){
          return x.text + ':' + x.size.toFixed(4);
        }).join('|'));
      var round = 0, variant = 0, maxRounds = 7, variantsPerRound = 5;
      var gridPhase = 0, activeGrid = gridSize;
      var allowTighterGrid = (ds.grid == null || ds.grid === '') && o.gridSize == null;
      var count = 0, indices = {}, best = null, fullAtThisScale = false;

      function consider(){
        var quality = layoutQuality(stage, W, H);
        /* Erst vollständige Darstellung, dann möglichst große Schrift,
           danach das beste Gleichgewicht der Wortverteilung. */
        if (!best || count > best.count ||
            (count === best.count && (scale > best.scale + 0.0001 ||
            (Math.abs(scale - best.scale) <= 0.0001 && quality > best.quality)))) {
          best = {
            count:count, scale:scale, quality:quality, indices:indices,
            nodes:[].map.call(stage.childNodes, function(n){ return n.cloneNode(true); })
          };
        }
        if (count === total) fullAtThisScale = true;
      }

      function finishBest(){
        if (finished) return;
        if (best) {
          stage.textContent = '';
          best.nodes.forEach(function(n){ stage.appendChild(n); });
        }
        var placed = best ? best.count : count;
        var missing = total - placed;
        cloud.dataset.tcMissing = String(missing);
        cloud.dataset.tcMinFont = String(minFontSize);
        finish();
        /* Hinweis nur fuer Autor*innen in der Browser-Konsole, nie auf der Folie. */
        if (missing > 0 && window.console && console.warn) {
          var unseen = arranged.filter(function(x){ return !(best && best.indices[x.index]); })
            .map(function(x){ return x.text; });
          console.warn('TermCluster: ' + missing + ' von ' + total +
            ' Begriffen nicht darstellbar (Mindestschriftgröße ' + minFontSize + ' px). Nicht platziert: ' +
            unseen.join(', ') + '. Wortanzahl reduzieren oder Wolke vergrößern.');
        }
      }
      timeoutFallback = finishBest;

      stage.addEventListener('wordclouddrawn', function(e){
        if (e.detail && e.detail.drawn) {
          count++;
          var item = e.detail.item;
          if (item && item.attributes) indices[Number(item.attributes['data-tc-index'])] = true;
        }
      });
      stage.addEventListener('wordcloudstop', function(){
        if (finished) return;
        consider();
        variant++;
        if (variant >= variantsPerRound) {
          if (fullAtThisScale) { finishBest(); return; }
          variant = 0;
          if (round + 1 < maxRounds && scale > floorScale + 0.00001) {
            round++;
            scale = Math.max(floorScale, scale * 0.86);
          } else if (allowTighterGrid && gridPhase < 2) {
            /* Bei hoher Dichte notfalls das Raster verringern, statt Wörter
               unter die Mindestschriftgröße zu drücken. Explizite Rasterwerte
               aus bestehenden Vorträgen bleiben dabei unangetastet. */
            gridPhase++;
            activeGrid = Math.max(4, Math.round(gridSize * (gridPhase === 1 ? 0.75 : 0.5)));
            scale = floorScale;
          } else { finishBest(); return; }
          fullAtThisScale = false;
        }
        /* Erst nach dem Stop-Ereignis den nächsten Versuch starten,
           damit kein alter Renderer dessen Lauf wieder abbricht. */
        setTimeout(tryLayout, 0);
      });

      function tryLayout(){
        if (finished) return;
        count = 0; indices = {};
        window.WordCloud(stage, {
          list: arranged.map(function(x){
            return {word:x.text, weight:Math.min(x.size, x.cap / scale), attributes:{
              'data-tc-score':String(x.score),'data-tc-index':String(x.index)
            }};
          }),
          fontFamily: o.font,
          fontWeight: function(w, size){ return size >= 46 ? '700' : '600'; },
          color: function(w, size){
            return full ? vividColor(scheme, clamp((size - 22) / 91, 0, 1), w) :
              compactColor(scheme, clamp((size - 24) / 55, 0, 1));
          },
          weightFactor: function(size){ return size * scale; },
          gridSize: activeGrid, shape: shape, ellipticity: ellipticity,
          origin: [W * (0.5 + (variant % 5 - 2) * 0.018),
                   H * (0.51 + ((variant * 3) % 5 - 2) * 0.017)],
          rotateRatio: function(word, size){
            if (!full) return word.length > 11 || size >= 60 ? 0 : effectiveRotate;
            if (size >= 79 || word.length > 21) return 0;
            return word.length > 11 ? Math.min(0.23, rotateRatio) : rotateRatio;
          },
          rotationSteps: rSteps, minRotation: rMin, maxRotation: rMax,
          drawOutOfBound: false, shrinkToFit: false,
          shuffle: true,
          random: seededRandom(seed + Math.imul(variant + 1, 0x9E3779B1)),
          wait: 0, backgroundColor: 'transparent'
        });
      }
      tryLayout();
    }

    function paint(){
      if (finished) return;
      try {
        if (vivid) paintVivid(); else paintClassic();
      } catch(e) {
        if (window.console && console.warn) console.warn('TermCluster:', e);
        finish();
      }
    }

    /* erst rendern, wenn die Schrift geladen ist – sonst misst wordcloud2 mit
       Ersatzschrift zu schmal und die Wörter überlappen. */
    var family = (o.font.split(',')[0] || 'Inter').replace(/['"]/g, '').trim();
    if (document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load('700 40px "' + family + '"'),
        document.fonts.load('600 40px "' + family + '"')
      ]).then(paint).catch(paint);
    } else {
      paint();
    }
  }

  var Plugin = {
    id: 'termcluster',
    init: function (deck) {
      try {
        var cfg = (deck && deck.getConfig) ? deck.getConfig() : {};
        var c = (cfg && cfg.termcluster) || {};
        var o = {
          font: c.font || "'Inter', system-ui, sans-serif",
          layout: c.layout === 'classic' ? 'classic' : 'vivid',
          weightFactor: (c.weightFactor != null) ? c.weightFactor : 7,
          gridSize: c.gridSize,
          shape: c.shape || 'circle',
          ellipticity: c.ellipticity,
          rotateRatio: c.rotateRatio,
          angles: c.angles || '90',
          colors: c.colors || 'marine',
          seed: c.seed,
          minFontSize: c.minFontSize,
          printView: isPrintView(deck)
        };
        injectCSS();

        function build(){
          [].forEach.call(document.querySelectorAll('.termcluster'), function(cloud){
            if (!cloud.getAttribute('data-tc-init')) cloud._tcTry = 0;   // jeder Anlauf bekommt frische Versuche
            renderCloud(cloud, o);
          });
        }

        /* nur sichtbare Wolken werden gerendert; renderCloud versucht es erneut,
           sobald die Folie vermessbar ist. Auf mehreren Ereignissen anstoßen. */
        if (deck && deck.on){
          deck.on('ready', function(){ build(); requestAnimationFrame(build); });
          deck.on('slidechanged', function(){ build(); requestAnimationFrame(build); setTimeout(build, 150); });
          deck.on('slidetransitionend', build);
        }
        if (deck && deck.isReady && deck.isReady()) build();
        setTimeout(build, 400);
      } catch (e) {
        if (window.console && console.warn) console.warn('TermCluster:', e);
      }
    }
  };

export default Plugin;
