/* Nova conversation context. Pure helpers, safe in browsers and Node tests. */
(function (root) {
  'use strict';
  function clean(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().replace(/[?!.,]+$/, '')
      .replace(/^(?:the|a|an)\s+/i, '').replace(/\s+(?:please|for me)$/i, '').trim();
  }
  function ambiguous(s) {
    return !s || /^(?:me|us|you|him|her|them|it|this|that|those|these|the same|same|one|that one|this one|something|someone|images?|pictures?|photos?)$/i.test(s)
      || /^(?:can|could|would|will)\s+you\b/i.test(s);
  }
  function explicit(text) {
    var t = String(text || '').trim();
    var patterns = [
      /(?:i\s+meant|i\s+mean|i(?:'m| am)\s+talking\s+about)\s+(.+)$/i,
      /(?:do\s+you\s+know|tell\s+me\s+about|who\s+(?:is|are)|who's|what\s+(?:is|are)|what's|explain)\s+(.+)$/i,
      /(?:images?|pictures?|photos?|diagrams?|references?)\s+(?:of|for|about|on)\s+(.+)$/i,
      /(?:compare|comparison\s+of)\s+(.+)$/i,
      /(?:show|find|look\s*up|search\s+for)\s+(?:me\s+)?(.+)$/i
    ];
    for (var i = 0; i < patterns.length; i++) {
      var m = t.match(patterns[i]);
      if (m) { var s = clean(m[1]); if (!ambiguous(s)) return s; }
    }
    // Preserve named gadgets in informal questions without inferring from assistant prose.
    var gadget = t.match(/\b(?:HP|Dell|Lenovo|Apple|Samsung|ASUS|Acer|Microsoft|Sony|Google|iPhone|MacBook|PlayStation|Xbox)\s+[\w -]{2,70}/i);
    if (gadget) return clean(gadget[0]).replace(/\s+(?:is|was|does|can|specs|specifications|price)\b.*$/i, '');
    return '';
  }
  function resolveSubject(text, messages) {
    var s = explicit(text); if (s) return s.slice(0, 160);
    var h = messages || [];
    for (var i = h.length - 1; i >= 0; i--) {
      if (h[i] && h[i].role === 'user') {
        s = explicit(h[i].content || h[i].text);
        if (s) return s.slice(0, 160);
      }
    }
    return '';
  }
  function wantsImages(text) {
    var t = String(text || '');
    if (/\b(generate|draw|create|design)\b.{0,35}\b(images?|pictures?|art|photos?)\b/i.test(t)) return false;
    if (/\b(images?|pictures?|photos?|diagrams?|references?)\b/i.test(t)) return true;
    var s = explicit(t);
    if (!s) return false;
    if (/\b(who\s+(?:is|are)|who's|do\s+you\s+know|compare|comparison)\b/i.test(t)) return true;
    if (/\b(HP|EliteBook|laptop|phone|iPhone|MacBook|Dell|Samsung|Lenovo|car|animal|dog|cat|lion|actor|character|mountain|landmark|Eiffel|wrestler|Spider.?Man)\b/i.test(s)) return true;
    // Proper names, not abstract definitions.
    return /(?:tell me about|what is|what's)/i.test(t) && /^[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)+$/.test(s);
  }
  function relevantImages(images, subject) {
    if (!subject) return [];
    var groups = subject.split(/\s+(?:vs\.?|versus|and|with)\s+/i).map(function (s) {
      return s.toLowerCase().match(/[a-z0-9]+/g) || [];
    });
    return (images || []).map(function (im, index) {
      var u = im.original || im.full || im.url || im.src || '';
      if (!/^https?:\/\//i.test(u)) return null;
      var hay = String((im.title || '') + ' ' + (im.description || '') + ' ' + u).toLowerCase();
      try { hay = decodeURIComponent(hay); } catch (e) {}
      if (/wallpaper|signature|template|mockup|carousel|ui.?kit|dribbble|powerpoint|start.menu|software.interface/i.test(hay)) return null;
      var words = hay.match(/[a-z0-9]+/g) || [];
      var score = 0;
      groups.forEach(function (tokens) {
        var model = tokens.filter(function (t) { return /\d/.test(t); });
        if (model.some(function (t) { return words.indexOf(t) < 0; })) return;
        var meaningful = tokens.filter(function (t) { return !/^(the|a|an|of|for|is|to|me)$/.test(t); });
        var hits = meaningful.filter(function (t) { return words.indexOf(t) >= 0; }).length;
        if (hits >= Math.min(2, meaningful.length) && hits >= Math.ceil(meaningful.length * 0.6)) score = Math.max(score, hits);
      });
      return score ? { image: im, score: score, index: index } : null;
    }).filter(Boolean).sort(function (a, b) { return b.score - a.score || a.index - b.index; })
      .slice(0, 6).map(function (r) { return r.image; });
  }
  function history(messages, text) {
    var out = (messages || []).filter(function (m) { return m && /^(user|assistant)$/.test(m.role); }).map(function (m) {
      var content = String(m.content || '').replace(/%%CAROUSEL_START%%[\s\S]*?%%CAROUSEL_END%%/g, '[Reference images accompanied this answer.]')
        .replace(/<div class="img-carousel"[\s\S]*?<\/div><\/div>/g, '[Reference images accompanied this answer.]');
      var row = { role: m.role, content: content }; if (m.imageUrl) row.imageUrl = m.imageUrl; return row;
    });
    if (out.length && out[out.length - 1].role === 'user') out[out.length - 1].content = text;
    else out.push({ role: 'user', content: text });
    return out;
  }
  function gallerySelection(card) {
    var track = card && card.closest('.img-carousel');
    if (!track) return { urls: [], index: 0 };
    var cards = Array.from(track.querySelectorAll('.icard'));
    var urls = [], index = 0;
    cards.forEach(function (c) {
      var img = c.querySelector('img'); if (!img) return;
      var url = img.getAttribute('data-full') || img.src; if (!url) return;
      if (c === card) index = urls.length;
      urls.push(url);
    });
    return { urls: urls, index: index };
  }
  var api = { resolveSubject: resolveSubject, wantsImages: wantsImages, relevantImages: relevantImages, history: history, gallerySelection: gallerySelection };
  root.NovaConversation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
