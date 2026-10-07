/* Codex Hub — shared Markdown + MathJax rendering (notes-style) */
(function (w) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function inlineMarkup(text) {
    var safe = esc(text);
    // bold **text**
    safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // italic *text* (not part of **)
    safe = safe.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    // underline-ish __text__ rarely used
    safe = safe.replace(/__(.+?)__/g, "<strong>$1</strong>");
    // inline code `x`
    safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
    return safe;
  }


  function isTableSep(line) {
    // |---|:---| or ---|---
    var t = String(line || "").trim();
    if (!t) return false;
    if (/^\|?[\s:-]+\|[\s|:-]*\|?$/.test(t) && /[-:]/.test(t)) return true;
    return false;
  }

  function splitTableRow(line) {
    var t = String(line || "").trim();
    if (t.charAt(0) === "|") t = t.slice(1);
    if (t.charAt(t.length - 1) === "|") t = t.slice(0, -1);
    return t.split("|").map(function (c) { return c.trim(); });
  }

  function renderTable(headerCells, bodyRows) {
    var html = ['<div class="md-table-wrap"><table class="md-table"><thead><tr>'];
    headerCells.forEach(function (c) {
      html.push("<th>" + inlineMarkup(c) + "</th>");
    });
    html.push("</tr></thead><tbody>");
    bodyRows.forEach(function (row) {
      html.push("<tr>");
      row.forEach(function (c) {
        html.push("<td>" + inlineMarkup(c) + "</td>");
      });
      html.push("</tr>");
    });
    html.push("</tbody></table></div>");
    return html.join("");
  }

  /** Protect $$...$$ and \[...\] and \(...\) from other transforms */
  function extractMath(text) {
    var store = [];
    var out = String(text).replace(
      /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g,
      function (m) {
        var i = store.length;
        store.push(m);
        return "%%MATH" + i + "%%";
      }
    );
    return { text: out, store: store };
  }

  function restoreMath(html, store) {
    return html.replace(/%%MATH(\d+)%%/g, function (_, i) {
      return store[Number(i)] || "";
    });
  }

  /**
   * Render AI / notes-style markdown to safe HTML.
   * Supports: # headings, **bold**, *italic*, lists, numbered lists, code fences, MathJax delimiters.
   */
  function render(raw) {
    if (raw == null || raw === "") return "";
    var text = String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // Code fences first
    var codes = [];
    text = text.replace(/```([\w]*)\n?([\s\S]*?)```/g, function (_, lang, code) {
      var i = codes.length;
      codes.push({ lang: lang || "", code: String(code || "").replace(/^\n+|\n+$/g, "") });
      return "\n%%CODE" + i + "%%\n";
    });

    var math = extractMath(text);
    text = math.text;

    var lines = text.split("\n");
    var html = [];
    var inUl = false, inOl = false;

    function closeLists() {
      if (inUl) { html.push("</ul>"); inUl = false; }
      if (inOl) { html.push("</ol>"); inOl = false; }
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      var codeM = trimmed.match(/^%%CODE(\d+)%%$/);
      if (codeM) {
        closeLists();
        var c = codes[Number(codeM[1])] || { lang: "", code: "" };
        html.push(
          '<pre class="md-code"><span class="md-code-lang">' +
            esc((c.lang || "code").toUpperCase()) +
            "</span><code>" +
            esc(c.code) +
            "</code></pre>"
        );
        continue;
      }

      if (!trimmed) {
        closeLists();
        html.push('<div class="md-gap"></div>');
        continue;
      }

      // Markdown tables: header | sep | rows
      if (trimmed.indexOf("|") !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        closeLists();
        var headerCells = splitTableRow(trimmed);
        i += 2; // skip header + separator
        var bodyRows = [];
        while (i < lines.length) {
          var rl = lines[i].trim();
          if (!rl || rl.indexOf("|") === -1) { i--; break; }
          if (isTableSep(rl)) { i++; continue; }
          bodyRows.push(splitTableRow(rl));
          i++;
        }
        html.push(renderTable(headerCells, bodyRows));
        continue;
      }

      var h = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (h) {
        closeLists();
        var level = Math.min(h[1].length, 3);
        html.push('<h' + level + ' class="md-h md-h' + level + '">' + inlineMarkup(h[2]) + "</h" + level + ">");
        continue;
      }

      // horizontal rule
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
        closeLists();
        html.push("<hr class=\"md-hr\">");
        continue;
      }

      var bullet = trimmed.match(/^(?:[-*•›])\s+(.+)$/);
      if (bullet) {
        if (inOl) { html.push("</ol>"); inOl = false; }
        if (!inUl) { html.push('<ul class="md-ul">'); inUl = true; }
        html.push("<li>" + inlineMarkup(bullet[1]) + "</li>");
        continue;
      }

      var num = trimmed.match(/^(\d+)[.)]\s+(.+)$/);
      if (num) {
        if (inUl) { html.push("</ul>"); inUl = false; }
        if (!inOl) { html.push('<ol class="md-ol" start="' + num[1] + '">'); inOl = true; }
        // value= keeps 10, 11… correct even if browser restarts counters
        html.push('<li value="' + num[1] + '">' + inlineMarkup(num[2]) + "</li>");
        continue;
      }

      closeLists();
      html.push('<p class="md-p">' + inlineMarkup(trimmed) + "</p>");
    }
    closeLists();

    var out = html.join("\n");
    out = restoreMath(out, math.store);
    return out;
  }

  function typeset(el) {
    if (!el) return;
    try {
      if (w.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([el]).catch(function () {});
      }
    } catch (e) {}
  }

  function setHtml(el, raw) {
    if (!el) return;
    el.innerHTML = render(raw);
    typeset(el);
  }

  w.CodexMd = {
    esc: esc,
    render: render,
    typeset: typeset,
    setHtml: setHtml,
    inlineMarkup: inlineMarkup
  };
})(window);
