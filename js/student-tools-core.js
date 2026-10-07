/* Student Tools — shared helpers (recent tools + specialized AI calls) */
(function (w) {
  "use strict";
  var API = "https://codex-backend-new.onrender.com/chat";
  var API_BASE = "https://codex-backend-new.onrender.com";
  var RECENT_KEY = "codex_student_tools_recent";
  var MAX_RECENT = 12;

  var TOOLS = {
    "scan-solve": {
      id: "scan-solve",
      name: "Scan & Solve",
      href: "tool-scan-solve.html",
      category: "Solve",
      tags: ["Math", "Science", "Problems"],
      desc: "Scan, upload or type a question and work through the solution step by step."
    },
    diagram: {
      id: "diagram",
      name: "Diagram Maker",
      href: "tool-diagram.html",
      category: "Create",
      tags: ["Biology", "Physics", "Labels"],
      desc: "Create clean academic diagrams and labelled scientific visuals from a description."
    },
    flowchart: {
      id: "flowchart",
      name: "Flowchart Maker",
      href: "tool-flowchart.html",
      category: "Computer Science",
      tags: ["Algorithms", "Process", "Systems"],
      desc: "Turn algorithms, processes and system ideas into clear editable flowcharts."
    },
    code: {
      id: "code",
      name: "Code Assistant",
      href: "tool-code.html",
      category: "Computer Science",
      tags: ["Python", "C++", "Debug"],
      desc: "Write, understand, debug and improve code for academic projects."
    },
    assignment: {
      id: "assignment",
      name: "Assignment Helper",
      href: "tool-assignment.html",
      category: "Academic",
      tags: ["Essays", "Reports", "Structure"],
      desc: "Understand assignments, create structure and organise academic work."
    },
    archiguide: {
      id: "archiguide",
      name: "ArchiGuide",
      href: "https://archiguide.lovable.app/",
      external: true,
      category: "Engineering & Architecture",
      tags: ["Architecture", "Planning"],
      desc: "AI assistance for architecture, building planning and design concepts."
    }
  };

  function uidKey(uid) {
    return RECENT_KEY + "_" + (uid || "guest");
  }

  function getRecent(uid) {
    try {
      var raw = localStorage.getItem(uidKey(uid));
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function pushRecent(uid, entry) {
    var list = getRecent(uid).filter(function (x) {
      return !(x.toolId === entry.toolId && x.title === entry.title);
    });
    list.unshift({
      toolId: entry.toolId,
      title: entry.title || TOOLS[entry.toolId] && TOOLS[entry.toolId].name || "Tool",
      subtitle: entry.subtitle || "",
      href: entry.href || (TOOLS[entry.toolId] && TOOLS[entry.toolId].href) || "student-tools.html",
      at: Date.now()
    });
    list = list.slice(0, MAX_RECENT);
    try {
      localStorage.setItem(uidKey(uid), JSON.stringify(list));
    } catch (e) {}
    return list;
  }

  /** Scroll a result panel into view (mobile-friendly). */
  function scrollToResult(el) {
    if (!el) return;
    try {
      setTimeout(function () {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (e) {
      try { el.scrollIntoView(true); } catch (e2) {}
    }
  }

  /** Compress a dataURL image for API (avoids CORS/413 on huge camera shots). */
  function compressImageDataUrl(dataUrl, maxSide, quality) {
    maxSide = maxSide || 1280;
    quality = quality == null ? 0.72 : quality;
    return new Promise(function (resolve) {
      if (!dataUrl || dataUrl.indexOf("data:image") !== 0) {
        resolve(dataUrl);
        return;
      }
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) { resolve(dataUrl); return; }
        var scale = 1;
        if (w > maxSide || h > maxSide) scale = maxSide / Math.max(w, h);
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, cw, ch);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch (e) {
          resolve(dataUrl);
        }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  async function callToolAI(opts) {
    opts = opts || {};
    var userText = String(opts.message || "").trim();
    if (!userText && opts.imageBase64) userText = "Please analyse the attached image and respond as instructed.";
    if (!userText) throw new Error("messages required — enter a request first");

    var messages = [];
    if (opts.history && opts.history.length) {
      opts.history.forEach(function (h) {
        if (!h) return;
        messages.push({
          role: h.role === "assistant" ? "assistant" : "user",
          content: String(h.content || h.message || "")
        });
      });
    }
    messages.push({ role: "user", content: userText });

    var img = opts.imageBase64 || null;
    if (img) {
      try { img = await compressImageDataUrl(img, 1280, 0.72); } catch (eC) {}
    }

    /* Backend /chat expects images: [{ mimeType, data }] — NOT raw data-URLs.
       Nova already sends this shape; tools must match or vision is silently dropped. */
    function toVisionImage(dataUrl) {
      if (!dataUrl) return null;
      if (typeof dataUrl === "object" && dataUrl.data && dataUrl.mimeType) return dataUrl;
      var s = String(dataUrl);
      var mm = s.match(/^data:([^;]+);base64,(.+)$/);
      if (mm) return { mimeType: mm[1], data: mm[2] };
      // bare base64
      if (/^[A-Za-z0-9+/=\s]+$/.test(s) && s.length > 100) {
        return { mimeType: "image/jpeg", data: s.replace(/\s/g, "") };
      }
      return null;
    }

    var payload = {
      messages: messages,
      system: opts.system || "You are a specialised Student Tools assistant on Codex Hub for Nigerian university students. Be precise and structured.",
      tool: opts.tool || "student-tools",
      mode: opts.mode || "tool",
      images: [],
      quotaCost: opts.quotaCost || 1
    };
    if (img) {
      var vision = toVisionImage(img);
      if (vision) {
        payload.images = [vision];
        payload.system = (payload.system || "") +
          "\n\nThe user attached an image. Vision data is included with this request. " +
          "You CAN see the image pixels. Read any text/diagram/equation from the image and solve it. " +
          "Never say you cannot view attachments or images when vision data is provided.";
      } else {
        console.warn("Scan/Tools: could not parse image for vision payload");
      }
    }
    if (opts.profile) payload.profile = opts.profile;
    if (opts.uid) payload.uid = opts.uid;

    var headers = { "Content-Type": "application/json" };
    try {
      var user = firebase.auth && firebase.auth().currentUser;
      if (user && user.getIdToken) {
        var tok = await user.getIdToken();
        if (tok) {
          headers.Authorization = "Bearer " + tok;
          payload.idToken = tok;
          payload.uid = payload.uid || user.uid;
        }
      }
    } catch (eAuth) {}

    var res;
    try {
      res = await fetch(API, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload)
      });
    } catch (netErr) {
      var msg = (netErr && netErr.message) || "Failed to fetch";
      if (/Failed to fetch|NetworkError|Load failed|CORS/i.test(msg)) {
        throw new Error(
          "Could not reach Codex AI backend (network/CORS).\n\n" +
          "• Open the app via http://localhost:8080 (not file://)\n" +
          "• Make sure codex-backend-new.onrender.com is awake\n" +
          "• Redeploy backend with localhost CORS if you still see CORS in the console\n\n" +
          "Detail: " + msg
        );
      }
      throw netErr;
    }

    var raw = await res.text().catch(function () { return ""; });
    var data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch (e) {
      throw new Error(raw || ("Tool AI failed (" + res.status + ")"));
    }
    if (!res.ok) {
      var errMsg = (data && (data.error || data.message)) || raw || ("Tool AI failed (" + res.status + ")");
      throw new Error(typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg));
    }
    if (typeof data === "string") return data;
    var reply = data.reply || data.message || data.content || data.text;
    if (data.choices && data.choices[0] && data.choices[0].message) {
      reply = data.choices[0].message.content || reply;
    }
    if (!reply) throw new Error("Empty AI reply");
    return reply;
  }

  function downloadText(filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function downloadDataUrl(filename, dataUrl) {
    var a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }


  function openPrintPdf(title, htmlBody) {
    var w = window.open("", "_blank");
    if (!w) {
      alert("Allow pop-ups to export PDF, then use the browser Print → Save as PDF.");
      return;
    }
    w.document.write(
      "<!DOCTYPE html><html><head><meta charset='utf-8'><title>" + esc(title) + "</title>" +
      "<style>body{font-family:system-ui,sans-serif;padding:24px;max-width:800px;margin:auto;color:#0f172a;line-height:1.5}" +
      "h1{font-size:1.25rem}pre,code{background:#f1f5f9;padding:12px;border-radius:8px;white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px}" +
      ".flow-node{display:block;max-width:280px;margin:8px auto;padding:10px 14px;border:2px solid #4f46e5;border-radius:12px;text-align:center;font-weight:700}" +
      ".flow-node.decision{transform:none;border-radius:4px;background:#fef3c7;border-color:#f59e0b;clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);padding:28px 36px}" +
      ".flow-node.start-end{border-radius:999px;background:#eef2ff}" +
      ".flow-node.loop-arm{border-style:dashed;border-color:#f59e0b;background:#fffbeb}" +
      ".loop-tag{margin-top:4px;font-size:10px;font-weight:800;color:#b45309}" +
      ".flow-arrow{text-align:center;color:#64748b;margin:4px 0}" +
      "@media print{body{padding:0}}<\/style></head><body>" +
      "<h1>" + esc(title) + "</h1>" + htmlBody +
      "<script>setTimeout(function(){window.print();},400);<\/script></body></html>"
    );
    w.document.close();
  }

  /** Collapse raw [S]/[P]/[D]/[Y]/[N] nodes into drawable blocks: a decision
   *  always carries its own yes/no branches (even if the AI forgot to tag
   *  them [Y]/[N] — the next 1-2 process lines are used as a fallback so a
   *  decision never silently flattens into a straight line). Also flags a
   *  branch as a "loop" when its own text implies going back a step (retry,
   *  try again, re-enter…), so the renderer can draw a return arrow instead
   *  of pretending it's a dead end. */
  function describeBranch(text) {
    var t = String(text || "").trim();
    var loop = /\b(retry|try again|go back|re-?enter|repeat|resubmit|back to (start|step|top))\b/i.test(t);
    return { text: t || "Continue", loop: loop };
  }
  function normalizeFlow(nodes) {
    nodes = nodes || [];
    var blocks = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n || n.type === "yes" || n.type === "no") continue;
      if (n.type === "decision") {
        var yNode = null, nNode = null, step = 1;
        if (nodes[i + step] && nodes[i + step].type === "yes") { yNode = nodes[i + step]; step++; }
        if (nodes[i + step] && nodes[i + step].type === "no") { nNode = nodes[i + step]; step++; }
        // Fallback: the AI described branches as plain steps without [Y]/[N] tags —
        // still treat the next one or two process lines as this decision's outcomes
        // instead of letting them flatten into the main vertical line.
        if (!yNode && nodes[i + step] && nodes[i + step].type === "process") { yNode = nodes[i + step]; step++; }
        if (!nNode && nodes[i + step] && nodes[i + step].type === "process") { nNode = nodes[i + step]; step++; }
        blocks.push({
          kind: "decision",
          text: n.text,
          yes: describeBranch(yNode ? yNode.text : "Continue"),
          no: describeBranch(nNode ? nNode.text : "Show error / deny access")
        });
        i += step - 1;
        continue;
      }
      blocks.push({ kind: n.type === "start" ? "start" : "process", text: n.text });
    }
    return blocks;
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    var words = String(text || "").split(/\s+/).filter(Boolean);
    var lines = [], cur = "";
    words.forEach(function (w) {
      var test = cur ? cur + " " + w : w;
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
      else cur = test;
    });
    lines.push(cur || "");
    return lines.slice(0, 6); // hard cap so one giant line can't blow up the canvas
  }

  function flowchartToCanvas(nodes) {
    var blocks = normalizeFlow(nodes);
    var W = 460, pad = 26, gap = 26, lineH = 15, armGap = 14;
    var measure = document.createElement("canvas").getContext("2d");
    measure.font = "700 12.5px system-ui,sans-serif";

    // Pass 1: measure every block so rows can be as small or as tall as they
    // actually need — short steps stay compact, long ones wrap instead of
    // spilling out of the shape.
    var laidOut = blocks.map(function (b) {
      if (b.kind === "decision") {
        var dLines = wrapCanvasText(measure, b.text, 128);
        var dW = Math.max(130, Math.min(190, 70 + dLines.length * 10));
        var dH = Math.max(86, dLines.length * lineH + 46);
        var yLines = wrapCanvasText(measure, b.yes.text, 150);
        var nLines = wrapCanvasText(measure, b.no.text, 150);
        var armH = Math.max(44, Math.max(yLines.length, nLines.length) * lineH + 22);
        return { b: b, dLines: dLines, dW: dW, dH: dH, yLines: yLines, nLines: nLines, armH: armH,
          h: dH + armGap + armH + gap * 2 };
      }
      var pLines = wrapCanvasText(measure, b.text, 220);
      var pH = Math.max(40, pLines.length * lineH + 20);
      return { b: b, pLines: pLines, pH: pH, h: pH + gap };
    });

    var H = pad * 2 + laidOut.reduce(function (s, r) { return s + r.h; }, 0);
    var c = document.createElement("canvas");
    c.width = W; c.height = Math.max(220, H);
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, c.height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var x = W / 2, y = pad;

    function arrowDown(fromY, toY) {
      ctx.strokeStyle = "#94A3B8"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, fromY); ctx.lineTo(x, toY - 7); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 5, toY - 12); ctx.lineTo(x, toY - 2); ctx.lineTo(x + 5, toY - 12); ctx.stroke();
    }
    function drawLines(lines, cy) {
      var ty = cy - ((lines.length - 1) * lineH) / 2;
      lines.forEach(function (ln) { ctx.fillText(ln, x, ty); ty += lineH; });
    }

    laidOut.forEach(function (row, idx) {
      ctx.font = "700 12.5px system-ui,sans-serif";
      if (row.b.kind === "decision") {
        var cy = y + row.dH / 2;
        var hw = row.dW / 2, hh = row.dH / 2;
        ctx.beginPath();
        ctx.moveTo(x, cy - hh); ctx.lineTo(x + hw, cy); ctx.lineTo(x, cy + hh); ctx.lineTo(x - hw, cy);
        ctx.closePath();
        ctx.fillStyle = "#FEF3C7"; ctx.fill();
        ctx.strokeStyle = "#F59E0B"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#92400E";
        drawLines(row.dLines, cy);

        var armY = y + row.dH + armGap;
        var armCy = armY + row.armH / 2;
        var leftX = x - W / 4, rightX = x + W / 4;
        var armW = W / 2 - 34;
        // connectors from the diamond's side points down to each arm
        ctx.strokeStyle = "#94A3B8"; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(x - hw, cy); ctx.lineTo(leftX, cy); ctx.lineTo(leftX, armY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + hw, cy); ctx.lineTo(rightX, cy); ctx.lineTo(rightX, armY); ctx.stroke();
        ctx.font = "800 10px system-ui,sans-serif"; ctx.fillStyle = "#4F46E5";
        ctx.fillText("YES", leftX, armY - 7);
        ctx.fillText("NO", rightX, armY - 7);

        [{ cx: leftX, lines: row.yLines, loop: row.b.yes.loop },
         { cx: rightX, lines: row.nLines, loop: row.b.no.loop }].forEach(function (arm) {
          roundRect(ctx, arm.cx - armW / 2, armY, armW, row.armH, 10);
          if (arm.loop) { ctx.setLineDash([4, 3]); }
          ctx.fillStyle = "#F8FAFC"; ctx.fill();
          ctx.strokeStyle = arm.loop ? "#F59E0B" : "#6366F1"; ctx.lineWidth = 2; ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = "700 11.5px system-ui,sans-serif"; ctx.fillStyle = "#1E1B4B";
          drawLines(arm.lines, armY + row.armH / 2);
          if (arm.loop) {
            ctx.font = "800 9px system-ui,sans-serif"; ctx.fillStyle = "#B45309";
            ctx.fillText("\u21BA loops back", arm.cx, armY + row.armH + 11);
          }
        });

        var afterArmsY = armY + row.armH + gap;
        if (idx < laidOut.length - 1) arrowDown(armY + row.armH, afterArmsY);
        y = afterArmsY + 2;
      } else {
        var h = row.pH;
        var boxY = y, cy2 = y + h / 2;
        if (row.b.kind === "start") {
          roundRect(ctx, x - 110, boxY, 220, h, h / 2);
          ctx.fillStyle = "#EEF2FF"; ctx.fill();
          ctx.strokeStyle = "#4F46E5"; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = "#312E81";
        } else {
          roundRect(ctx, x - 120, boxY, 240, h, 10);
          ctx.fillStyle = "#F8FAFC"; ctx.fill();
          ctx.strokeStyle = "#6366F1"; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = "#1E1B4B";
        }
        ctx.font = "700 12.5px system-ui,sans-serif";
        drawLines(row.pLines, cy2);
        var nextY = y + h + gap;
        if (idx < laidOut.length - 1) arrowDown(boxY + h, nextY);
        y = nextY;
      }
    });
    return c;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  
  /** Generate image via backend: Gemini → HF SD3 → HF SDXL → Pollinations */
  function generateImage(prompt, opts) {
    opts = opts || {};
    var body = {
      prompt: String(prompt || "").slice(0, 2000),
      text: String(prompt || "").slice(0, 2000),
      quotaCost: 1
    };
    function doFetch(headers) {
      return fetch(API_BASE + "/image-gen", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.json().then(function (data) {
          if (!r.ok) throw new Error((data && (data.error || data.message)) || ("HTTP " + r.status));
          if (!data || !data.image_url) throw new Error("No image returned");
          return data;
        });
      });
    }
    var headers = { "Content-Type": "application/json" };
    try {
      var user = firebase.auth().currentUser;
      if (user && user.getIdToken) {
        return user.getIdToken().then(function (tok) {
          if (tok) headers.Authorization = "Bearer " + tok;
          return doFetch(headers);
        }).catch(function () { return doFetch(headers); });
      }
    } catch (e) {}
    return doFetch(headers);
  }

  w.CodexStudentTools = {
    TOOLS: TOOLS,
    getRecent: getRecent,
    pushRecent: pushRecent,
    renderMd: function (t) { return (w.CodexMd && CodexMd.render) ? CodexMd.render(t) : String(t || ""); },
    setMd: function (el, t) { if (w.CodexMd) CodexMd.setHtml(el, t); else if (el) el.textContent = t; },
    callToolAI: callToolAI,
    scrollToResult: scrollToResult,
    compressImageDataUrl: compressImageDataUrl,
    downloadText: downloadText,
    downloadDataUrl: downloadDataUrl,
    esc: esc,
    API: API,
    API_BASE: API_BASE,
    generateImage: generateImage,
    openPrintPdf: openPrintPdf,
    flowchartToCanvas: flowchartToCanvas,
    normalizeFlow: normalizeFlow
  };
})(window);
