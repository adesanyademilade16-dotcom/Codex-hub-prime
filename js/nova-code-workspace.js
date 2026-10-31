/**
 * Nova coding workspace (Phase 3)
 * Turns fenced code blocks from one reply into a project: file tree, per-file view,
 * ZIP export, and a sandboxed preview for web projects.
 *
 * Security: previews run in an <iframe sandbox> WITHOUT allow-same-origin, so the
 * generated page gets an opaque origin and cannot touch this app, its cookies,
 * Firebase session or localStorage. Nothing is executed on any server.
 */
(function (w, d) {
  "use strict";

  var EXT = {
    html: "html", htm: "html", css: "css", js: "js", javascript: "js", mjs: "js",
    jsx: "jsx", ts: "ts", typescript: "ts", tsx: "tsx", py: "py", python: "py",
    json: "json", md: "md", markdown: "md", sh: "sh", bash: "sh", sql: "sql",
    java: "java", c: "c", cpp: "cpp", cs: "cs", php: "php", rb: "rb", go: "go",
    rs: "rs", kt: "kt", swift: "swift", xml: "xml", yml: "yml", yaml: "yaml",
    txt: "txt", text: "txt", vue: "vue", svelte: "svelte", env: "env"
  };
  var DEFAULT = {
    html: "index.html", css: "styles.css", js: "app.js", jsx: "App.jsx",
    ts: "index.ts", tsx: "App.tsx", py: "main.py", json: "data.json",
    md: "README.md", sh: "run.sh", sql: "query.sql", java: "Main.java",
    php: "index.php", rb: "main.rb", go: "main.go", rs: "main.rs", xml: "data.xml"
  };
  var FILE_MARK = /^(?:\/\/|#|--|;|\/\*|<!--)\s*(?:file(?:name)?\s*[:=]\s*)?([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,8})\s*(?:\*\/|-->)?\s*$/;
  var BANNER_MARK = /^={2,}\s*([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,8})\s*={2,}$/;

  var registry = {};
  var seq = 0;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function key(lang) { return String(lang || "").toLowerCase().split(/[\s:]/)[0]; }

  function nameFromBlock(block, index, used) {
    var code = String(block.code || "");
    var lines = code.split("\n");
    var first = (lines[0] || "").trim();
    var m = first.match(FILE_MARK) || first.match(BANNER_MARK);
    var name = "";
    if (m) { name = m[1]; lines = lines.slice(1); }
    var L = key(block.lang);
    if (!name) {
      name = DEFAULT[L] || ("snippet-" + (index + 1) + "." + (EXT[L] || "txt"));
    }
    name = name.replace(/^\.?\//, "").replace(/[<>:"|?*]/g, "-");
    if (used[name]) {
      var dot = name.lastIndexOf(".");
      var base = dot > 0 ? name.slice(0, dot) : name;
      var ext = dot > 0 ? name.slice(dot) : "";
      var n = used[name] + 1;
      while (used[base + "-" + n + ext]) n++;
      name = base + "-" + n + ext;
    }
    used[name] = 1;
    return { name: name, content: lines.join("\n").replace(/^\n+|\n+$/g, "") };
  }

  function normalize(blocks) {
    var used = {};
    return (blocks || []).map(function (b, i) { return nameFromBlock(b, i, used); });
  }

  function isWeb(files) {
    return files.some(function (f) { return /\.html?$/i.test(f.name); });
  }

  function cardHtml(blocks) {
    var files = normalize(blocks);
    if (files.length < 2) return "";
    var id = "proj" + (++seq) + "_" + Date.now();
    registry[id] = files;

    var first = files[0];
    var tabs = files.map(function (f, i) {
      return '<button type="button" role="tab" data-proj-tab="' + id + '" data-idx="' + i + '"' +
        (i === 0 ? ' aria-selected="true"' : ' aria-selected="false"') + ">" + esc(f.name) + "</button>";
    }).join("");

    return '<div class="cw-card" data-proj="' + id + '">' +
      '<div class="cw-head"><span class="cw-badge">Project &middot; ' + files.length + ' files</span>' +
      '<div class="cw-actions">' +
      (isWeb(files) ? '<button type="button" data-proj-preview="' + id + '">Preview</button>' : "") +
      '<button type="button" data-proj-revise="' + id + '" class="cw-ghost">Revise</button>' +
      '<button type="button" data-proj-zip="' + id + '">Download ZIP</button>' +
      "</div></div>" +
      '<div class="cw-tabs" role="tablist">' + tabs + "</div>" +
      '<pre class="cw-code" data-proj-out="' + id + '">' + esc(first.content) + "</pre>" +
      "</div>";
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = d.createElement("a");
    a.href = url;
    a.download = filename;
    d.body.appendChild(a);
    a.click();
    d.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function downloadZip(files, label) {
    if (!w.CodexZip) return;
    var blob = w.CodexZip.build(files);
    download(blob, (label || "codex-project") + ".zip");
  }

  /** Inline the project's css/js into its html so the sandbox can render it standalone. */
  function srcdocFor(files) {
    var byName = {};
    files.forEach(function (f) { byName[f.name] = f; });
    var inlined = {};
    var htmlFile = files.filter(function (f) { return /\.html?$/i.test(f.name); })[0];
    var doc = htmlFile ? htmlFile.content : "<!doctype html><html><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>" +
      "<body><div id=\"app\"></div></body></html>";

    function find(ref) {
      var clean = String(ref || "").replace(/^\.?\//, "").split(/[?#]/)[0];
      return byName[clean] || byName[clean.replace(/^.*\//, "")] || null;
    }

    doc = doc.replace(/<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi, function (m, href) {
      var f = find(href);
      if (!f) return m;
      inlined[f.name] = 1;
      return "<style>\n" + f.content + "\n</style>";
    });
    doc = doc.replace(/<script([^>]*)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, function (m, pre, src) {
      var f = find(src);
      if (!f) return m;
      inlined[f.name] = 1;
      return "<script>\n" + f.content + "\n<\/script>";
    });

    var extraCss = files.filter(function (f) {
      return /\.css$/i.test(f.name) && !inlined[f.name];
    }).map(function (f) { return "<style>\n" + f.content + "\n</style>"; }).join("");

    var extraJs = files.filter(function (f) {
      return /\.m?js$/i.test(f.name) && !inlined[f.name];
    }).map(function (f) { return "<script>\n" + f.content + "\n<\/script>"; }).join("");

    if (extraCss) doc = /<\/head>/i.test(doc) ? doc.replace(/<\/head>/i, extraCss + "</head>") : extraCss + doc;
    if (extraJs) doc = /<\/body>/i.test(doc) ? doc.replace(/<\/body>/i, extraJs + "</body>") : doc + extraJs;
    return doc;
  }

  function openPreview(id) {
    var files = registry[id];
    if (!files) return;
    var bg = d.createElement("div");
    bg.className = "cw-preview-bg";
    bg.innerHTML = '<div class="cw-preview">' +
      '<div class="cw-preview-head"><b>Preview</b>' +
      '<span class="cw-note">Sandboxed run of the generated files &middot; not tested on our servers</span>' +
      '<button type="button" data-cw-close="1">Close</button></div>' +
      '<iframe class="cw-frame" sandbox="allow-scripts allow-forms allow-modals allow-popups" ' +
      'referrerpolicy="no-referrer" title="Generated project preview"></iframe></div>';
    d.body.appendChild(bg);
    bg.querySelector("iframe").srcdoc = srcdocFor(files);
    function close() { if (bg.parentNode) bg.parentNode.removeChild(bg); }
    bg.addEventListener("click", function (e) {
      if (e.target === bg || e.target.closest("[data-cw-close]")) close();
    });
    d.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") { close(); d.removeEventListener("keydown", onKey); }
    });
  }

  d.addEventListener("click", function (e) {
    var tab = e.target.closest("[data-proj-tab]");
    if (tab) {
      var tid = tab.getAttribute("data-proj-tab");
      var idx = parseInt(tab.getAttribute("data-idx"), 10) || 0;
      var files = registry[tid];
      if (!files) return;
      var card = tab.closest(".cw-card");
      card.querySelectorAll("[data-proj-tab]").forEach(function (b) {
        b.setAttribute("aria-selected", b === tab ? "true" : "false");
      });
      var out = card.querySelector("[data-proj-out]");
      if (out) out.textContent = files[idx].content;
      return;
    }
    var zipBtn = e.target.closest("[data-proj-zip]");
    if (zipBtn) {
      var zid = zipBtn.getAttribute("data-proj-zip");
      if (registry[zid]) downloadZip(registry[zid], "codex-project");
      return;
    }
    var prev = e.target.closest("[data-proj-preview]");
    if (prev) { openPreview(prev.getAttribute("data-proj-preview")); return; }

    var rev = e.target.closest("[data-proj-revise]");
    if (rev) {
      var input = d.getElementById("input");
      if (input) {
        input.value = "Revise this project. Change: ";
        input.focus();
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) {}
      }
      return;
    }

    var dl = e.target.closest("[data-dl-code]");
    if (dl) {
      var cid = dl.getAttribute("data-dl-code");
      var code = (w.__novaCodeBlocks || {})[cid];
      if (code == null) return;
      var f = normalize([{ lang: dl.getAttribute("data-lang"), code: code }])[0];
      download(new Blob([code], { type: "text/plain;charset=utf-8" }), f.name);
      return;
    }
  });

  w.CodexWorkspace = {
    cardHtml: cardHtml,
    normalize: normalize,
    downloadZip: downloadZip,
    srcdocFor: srcdocFor
  };
})(window, document);
