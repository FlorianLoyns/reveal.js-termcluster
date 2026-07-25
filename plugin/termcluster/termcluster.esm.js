/*!
 * reveal.js-termcluster 1.1.0
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

  function injectCSS(){
    if (document.getElementById('termcluster-css')) return;
    var css =
      ".reveal .termcluster{position:relative;width:1160px;max-width:100%;height:540px;margin:0 auto}"
    + ".reveal .termcluster span{line-height:1;-webkit-user-select:none;user-select:none}"
    + "@media print{.reveal .termcluster span{color:#111 !important;opacity:1 !important;text-shadow:none !important}}";
    var s = document.createElement('style');
    s.id = 'termcluster-css'; s.textContent = css;
    document.head.appendChild(s);
  }

  var SCHEMES = {
    marine: { c:['#12294A','#1E3452','#2C4A6E','#3E5677','#55697F','#6E7E90'], focus:'#12294A', dim:'#CBD5E0' },
    green:  { c:['#173404','#27500A','#3B6D11','#4F7D18','#6E9A34','#9CC06A'], focus:'#173404', dim:'#CBD5E0' },
    warm:   { c:['#7A2E12','#9A3B17','#C05621','#D97706','#DF9440','#E9BB82'], focus:'#7A2E12', dim:'#E6D8C7' },
    dark:   { c:['#F2F7FF','#D2E1F3','#B0C7E4','#8FADD2','#7091B8','#57769A'], focus:'#FFFFFF', dim:'#3A4E6A' }
  };
  function ramp(scheme, weight){
    var i = weight >= 7 ? 0 : weight >= 6 ? 1 : weight >= 5 ? 2 : weight >= 4 ? 3 : weight >= 3 ? 4 : 5;
    return scheme.c[i];
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
    if (!anyW) words.forEach(function(x,i){ x.weight = PATTERN[i % PATTERN.length]; });
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

    /* Einstellungen: zentrale Defaults (o) + je-Folie-Overrides über data-*  */
    var ds = cloud.dataset;
    var num = function(v, d){ return (v != null && v !== '') ? parseFloat(v) : d; };
    var shape = ds.shape || o.shape;
    var ellipticity = num(ds.ellipticity, o.ellipticity);
    var gridSize = num(ds.grid, o.gridSize);
    var weightFactor = num(ds.size, o.weightFactor);
    var angles = ds.angles || o.angles;                 // '0' | '90' | 'any'
    var rotateRatio = num(ds.rotate, o.rotateRatio);
    var scheme = SCHEMES[ds.colors || o.colors] || SCHEMES.marine;

    var rSteps = 2, rMin = 0, rMax = Math.PI / 2;
    if (angles === '0') { rotateRatio = 0; rSteps = 1; rMin = 0; rMax = 0; }
    else if (angles === 'any') { rSteps = 0; rMin = -Math.PI / 2; rMax = Math.PI / 2; }

    /* Wolke außerhalb der von reveal skalierten Folie berechnen (Maßstab 1:1),
       damit wordcloud2 die Maße korrekt misst; danach die fertigen Wörter in die
       Folie verschieben. Sonst verrutscht die Wolke je nach reveal-Skalierung. */
    var W = cloud.clientWidth, H = cloud.clientHeight;
    var stage = document.createElement('div');
    stage.style.cssText = 'position:absolute;left:0;top:-10000px;visibility:hidden;width:' + W + 'px;height:' + H + 'px';
    document.body.appendChild(stage);

    /* Wörter übernehmen und Mess-Div entfernen. Der Timeout ist ein Fallback:
       feuert wordcloudstop nie (Bibliothek bricht ab), bleibt sonst das
       unsichtbare Div dauerhaft im DOM hängen. */
    var finished = false;
    function finish(){
      if (finished) return; finished = true;
      while (stage.firstChild) cloud.appendChild(stage.firstChild);
      if (stage.parentNode) stage.parentNode.removeChild(stage);
      wireFocus(cloud, scheme.focus, scheme.dim);
    }
    stage.addEventListener('wordcloudstop', finish, { once:true });
    setTimeout(finish, 8000);

    function paint(){
      window.WordCloud(stage, {
        list: words.map(function(x){ return [x.text, x.weight]; }),
        fontFamily: o.font,
        fontWeight: function(w, weight){ return weight >= 5 ? '700' : '600'; },
        color: function(w, weight){ return ramp(scheme, weight); },
        weightFactor: weightFactor,
        gridSize: gridSize,
        shape: shape,
        ellipticity: ellipticity,
        rotateRatio: rotateRatio,
        rotationSteps: rSteps,
        minRotation: rMin,
        maxRotation: rMax,
        drawOutOfBound: false,
        shrinkToFit: true,
        wait: 4,
        backgroundColor: 'transparent'
      });
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
          weightFactor: c.weightFactor || 7,
          gridSize: c.gridSize || 12,
          shape: c.shape || 'circle',
          ellipticity: (c.ellipticity != null) ? c.ellipticity : 0.65,
          rotateRatio: (c.rotateRatio != null) ? c.rotateRatio : 0.24,
          angles: c.angles || '90',
          colors: c.colors || 'marine'
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
