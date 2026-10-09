
  function updateRequestsTabBadge(n) {
    try {
      var tabs = document.querySelectorAll("[data-tab], .tabs button, .seg button");
      tabs.forEach(function (tab) {
        var label = (tab.textContent || "").toLowerCase();
        var isReq = tab.getAttribute("data-tab") === "requests" || label.indexOf("request") >= 0;
        if (!isReq) return;
        var b = tab.querySelector(".req-tab-badge");
        if (n > 0) {
          if (!b) {
            b = document.createElement("span");
            b.className = "req-tab-badge";
            b.style.cssText = "margin-left:6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#EF4444;color:#fff;font:800 10px/18px system-ui;display:inline-block;text-align:center";
            tab.appendChild(b);
          }
          b.hidden = false;
          b.textContent = n > 99 ? "99+" : String(n);
        } else if (b) b.hidden = true;
      });
    } catch (e) {}
  }

/**
 * Codex Hub — Chats page UI (list + full thread)
 */
(function () {
  "use strict";

  var state = {
    tab: "chats",
    convId: null,
    other: null,
    otherUid: null,
    me: null,
    profile: null,
    unsubMsg: null,
    unsubTyping: null,
    unsubPresence: null,
    replyTo: null,
    selectedMsg: null,
    clearBeforeMs: 0,
    muted: false,
    recording: false,
    mediaRecorder: null,
    recChunks: [],
    allMsgs: [],
    pendingFiles: [],
    groupPhotoURL: "",
    voiceBlob: null,
    voicePaused: false,
    voiceSecs: 0,
    voiceTick: null,
    lightboxUrls: [],
    lightboxMsg: null
  };

  function $(id) { return document.getElementById(id); }
  function initials(name) {
    name = String(name || "?").trim();
    var p = name.split(/\s+/);
    return ((p[0] && p[0][0]) || "?") + ((p[1] && p[1][0]) || "");
  }
  function displayNameOf(card) {
    if (!card) return "Student";
    var u = card.username || card.userName || card.handle;
    if (u && String(u).trim()) return String(u).trim();
    return card.fullName || card.displayName || "Student";
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/`/g, ""); }
  function avHtml(card) {
    card = card || {};
    if (window.CodexMedia && CodexMedia.resolveAvatar) {
      return CodexMedia.resolveAvatar(card, (card.fullName || card.username || "?").slice(0, 1));
    }
    if (card.photoURL) return '<img src="' + card.photoURL + '" alt="">';
    var k = card.avatarKey;
    if (k) return '<img src="../assets/avatars/' + k + '.png" alt="">';
    return '<span>' + String(card.fullName || "?").slice(0, 1).toUpperCase() + '</span>';
  }
  function presenceDot(c) {
    return ''; // list dots filled later via presence listeners if needed
  }
  function timeLabel(ts) {
    if (!ts) return "";
    try {
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      var diff = (Date.now() - d.getTime()) / 60000;
      if (diff < 1) return "now";
      if (diff < 60) return Math.floor(diff) + "m";
      if (diff < 1440) return Math.floor(diff / 60) + "h";
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (e) { return ""; }
  }
  function dayKey(ts) {
    if (!ts) return "";
    try {
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      if (isNaN(d.getTime())) return "";
      return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    } catch (e) { return ""; }
  }
  function dayLabel(ts) {
    if (!ts) return "";
    try {
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      if (isNaN(d.getTime())) return "";
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      var diffDays = Math.round((today - msgDay) / 86400000);
      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      var opts = { weekday: "short", month: "long", day: "numeric" };
      if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
      return d.toLocaleDateString(undefined, opts);
    } catch (e) { return ""; }
  }
  function clock(ts) {
    if (!ts) return "";
    try {
      var d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    } catch (e) { return ""; }
  }
  function lastSeenLabel(p) {
    if (!p) return "Offline";
    var online = p.online === true || (p.state === "online" && window.CodexChat && CodexChat.isEffectivelyOnline && CodexChat.isEffectivelyOnline(p));
    if (online) return "Online";
    if (p.lastSeen) {
      try {
        var d = p.lastSeen.toDate ? p.lastSeen.toDate() : new Date(p.lastSeen);
        var mins = Math.floor((Date.now() - d.getTime()) / 60000);
        var clock = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        if (mins < 1) return "Last seen just now";
        if (mins < 60) return "Last seen " + mins + "m ago · " + clock;
        if (mins < 1440) return "Last seen today · " + clock;
        return "Last seen " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " · " + clock;
      } catch (e) {}
    }
    return "Offline";
  }
  function applyTheme(name) {
    document.body.classList.remove("theme-ocean", "theme-rose", "theme-forest", "theme-sunset");
    if (name && name !== "default") document.body.classList.add("theme-" + name);
    try { localStorage.setItem("codex_chat_theme", name || "default"); } catch (e) {}
  }
  try {
    var saved = localStorage.getItem("codex_chat_theme");
    if (saved) applyTheme(saved);
  } catch (e) {}

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tab").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-tab") === tab);
    });
    loadPane();
  }

  async function refreshGroupPresenceRows() {
    var rows = document.querySelectorAll("[data-group-presence]");
    for (var i = 0; i < rows.length; i++) {
      var el = rows[i];
      var gid = el.getAttribute("data-group-presence");
      if (!gid) continue;
      try {
        var st = await CodexChat.getGroupPresenceStats(gid);
        if (!document.querySelector('[data-group-presence="' + gid + '"]')) continue;
        var total = Number(st.total || 0);
        var online = Number(st.online || 0);
        el.textContent = online + " online · " + total + " member" + (total === 1 ? "" : "s");
        el.classList.toggle("presence-online", online > 0);
        el.classList.toggle("presence-offline", online === 0);
      } catch (e) {
        el.textContent = "Group";
      }
    }
  }

  function emptyHtml(title, sub) {
    return '<div class="empty"><h3>' + escapeHtml(title) + '</h3><p>' + escapeHtml(sub) + '</p></div>';
  }

  async function loadPane() {
    var pane = $("listPane");
    pane.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
    var q = ($("searchInput").value || "").trim();
    try {
      if (state.tab === "chats") {
        var convs = await CodexChat.listConversations();
        if (q) {
          convs = convs.filter(function (c) {
            return (c.card.fullName + " " + (c.lastMessage || "")).toLowerCase().indexOf(q.toLowerCase()) !== -1;
          });
        }
        if (!convs.length) {
          pane.innerHTML = emptyHtml("No conversations yet", "Find classmates and start a study chat.");
          return;
        }
        pane.innerHTML = convs.map(function (c) {
          var isG = c.type === "group" || (c.card && c.card.isGroup);
          return (
            '<button type="button" class="row-item" data-open-conv="' + escapeAttr(c.id) +
              '" data-uid="' + escapeAttr(c.card.uid || "") +
              '" data-type="' + (isG ? "group" : "dm") +
              '" data-name="' + escapeAttr(c.card.fullName || "") +
              '" data-photo="' + escapeAttr(c.card.photoURL || "") +
              '" data-sub="' + escapeAttr(c.card.university || (isG ? "Group" : "")) + '">' +
              '<div class="av">' + avHtml(c.card) + '</div>' +
              '<div class="meta"><div class="top"><span class="name">' + escapeHtml(displayNameOf(c.card)) +
              (c.muted ? " 🔇" : "") + '</span><span class="time">' + escapeHtml(timeLabel(c.updatedAt)) +
              '</span></div><div class="preview">' +
              (function () {
                var preview = c.lastMessage || "Say hello";
                var meId = firebase.auth().currentUser && firebase.auth().currentUser.uid;
                // Make it obvious when the latest message was sent by the current user.
                // This applies even when the conversation has no unread messages.
                if (c.lastSender && c.lastSender === meId) {
                  preview = "[You: " + preview + "]";
                } else if (c.unread > 0 && c.lastSenderName) {
                  preview = c.lastSenderName + ": " + preview;
                }
                return escapeHtml(preview);
              })() +
              (c.unread > 0 ? '<span class="unread-pill">' + (c.unread > 99 ? "99+" : c.unread) + '</span>' : '') +
              '</div>' +
              (isG ? '<div class="group-presence-line" data-group-presence="' + escapeAttr(c.id) + '">Checking online…</div>' : '') +
              '</div></button>'
          );
        }).join("");
        refreshGroupPresenceRows();
        // Refresh visible group online counts without changing group data.
        if (state.tab === "chats") {
          clearTimeout(window.__codexGroupPresenceTimer);
          window.__codexGroupPresenceTimer = setTimeout(function () {
            if (state.tab === "chats") refreshGroupPresenceRows();
          }, 15000);
        }
      } else if (state.tab === "requests") {
        var reqs = await CodexChat.listFriendRequests();
        try {
          if (window.CodexChat && CodexChat.markFriendRequestNotifsRead) {
            CodexChat.markFriendRequestNotifsRead();
          }
        } catch (eN) {}
        updateRequestsTabBadge((reqs && reqs.length) || 0);
        var gReqs = [];
        var invites = [];
        try { gReqs = await CodexChat.listIncomingGroupRequests(); } catch (e) {}
        try { invites = await CodexChat.listInvitesForMe(); } catch (e) {}
        var total = reqs.length + gReqs.length + invites.length;
        $("reqBadge").style.display = total ? "inline-grid" : "none";
        $("reqBadge").textContent = String(total);
        var html = "";
        if (reqs.length) {
          html += '<div style="padding:8px 12px;font-size:.7rem;font-weight:800;color:#64748B;letter-spacing:.06em">FRIEND REQUESTS</div>';
          html += reqs.map(function (r) {
            return (
              '<div class="row-item" style="cursor:default"><div class="av">' + avHtml(r.card) + '</div>' +
              '<div class="meta"><div class="top"><span class="name">' + escapeHtml(displayNameOf(r.card)) + '</span></div>' +
              '<div class="preview">' + escapeHtml([r.card.university, r.card.department].filter(Boolean).join(" · ") || "Codex student") +
              '</div></div><div class="person-actions">' +
              '<button type="button" class="pill-btn primary" data-accept="' + escapeAttr(r.id) + '">Accept</button>' +
              '<button type="button" class="pill-btn danger" data-decline="' + escapeAttr(r.id) + '">Decline</button></div></div>'
            );
          }).join("");
        }
        if (gReqs.length) {
          html += '<div style="padding:8px 12px;font-size:.7rem;font-weight:800;color:#64748B;letter-spacing:.06em">GROUP JOIN REQUESTS</div>';
          html += gReqs.map(function (r) {
            return (
              '<div class="row-item" style="cursor:default"><div class="av">' + avHtml(r.card) + '</div>' +
              '<div class="meta"><div class="top"><span class="name">' + escapeHtml(displayNameOf(r.card)) + '</span></div>' +
              '<div class="preview">Wants to join · ' + escapeHtml(r.groupName) + '</div></div>' +
              '<div class="person-actions">' +
              '<button type="button" class="pill-btn primary" data-accept-gjoin="' + escapeAttr(r.groupId) + '" data-from="' + escapeAttr(r.from) + '">Accept</button>' +
              '<button type="button" class="pill-btn danger" data-decline-gjoin="' + escapeAttr(r.groupId) + '" data-from="' + escapeAttr(r.from) + '">Decline</button></div></div>'
            );
          }).join("");
        }
        if (invites.length) {
          html += '<div style="padding:8px 12px;font-size:.7rem;font-weight:800;color:#64748B;letter-spacing:.06em">GROUP INVITES</div>';
          html += invites.map(function (r) {
            return (
              '<div class="row-item" style="cursor:default"><div class="av">G</div>' +
              '<div class="meta"><div class="top"><span class="name">' + escapeHtml(r.groupName) + '</span></div>' +
              '<div class="preview">' + escapeHtml(r.message || "You were invited") + '</div></div>' +
              '<div class="person-actions">' +
              '<button type="button" class="pill-btn primary" data-accept-ginvite="' + escapeAttr(r.groupId) + '">Join</button>' +
              '<button type="button" class="pill-btn danger" data-decline-ginvite="' + escapeAttr(r.groupId) + '">Not interested</button></div></div>'
            );
          }).join("");
        }
        if (!html) {
          pane.innerHTML = emptyHtml("No requests", "Friend requests and group invites appear here.");
          return;
        }
        pane.innerHTML = html;
      } else if (state.tab === "friends") {
        var friends = await CodexChat.listFriends();
        if (q) {
          friends = friends.filter(function (p) {
            return (p.fullName + p.university).toLowerCase().indexOf(q.toLowerCase()) !== -1;
          });
        }
        if (!friends.length) {
          pane.innerHTML = emptyHtml("No friends yet", "Use Find to add classmates.");
          return;
        }
        pane.innerHTML = friends.map(function (p) { return personRow(p, true); }).join("");
      } else if (state.tab === "groups") {
        var mine = await CodexChat.listMyGroups();
        var pub = await CodexChat.listPublicGroups();
        if (q) {
          var ql = q.toLowerCase();
          mine = mine.filter(function (g) { return (g.name + " " + g.description).toLowerCase().indexOf(ql) !== -1; });
          pub = pub.filter(function (g) { return (g.name + " " + g.description).toLowerCase().indexOf(ql) !== -1; });
        }
        var htmlG = "";
        if (mine.length) {
          htmlG += '<div style="padding:8px 12px;font-size:.72rem;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.06em">Your groups</div>';
          htmlG += mine.map(function (g) {
            return '<button type="button" class="row-item" data-open-group="' + escapeAttr(g.id) + '">' +
              '<div class="av">' + (g.photoURL ? '<img src="' + escapeAttr(g.photoURL) + '" alt="">' : "👥") + '</div>' +
              '<div class="meta"><div class="top"><span class="name">' + escapeHtml(g.name) + '</span></div>' +
              '<div class="preview">' + escapeHtml(g.description || ((g.members || []).length + " members · " + (g.visibility || "private"))) + '</div></div></button>';
          }).join("");
        }
        if (pub.length) {
          htmlG += '<div style="padding:8px 12px;font-size:.72rem;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.06em">Public groups</div>';
          htmlG += pub.map(function (g) {
            return '<div class="row-item" style="cursor:default">' +
              '<div class="av">' + (g.photoURL ? '<img src="' + escapeAttr(g.photoURL) + '" alt="">' : "🌐") + '</div>' +
              '<div class="meta"><div class="top"><span class="name">' + escapeHtml(g.name) + '</span></div>' +
              '<div class="preview">' + escapeHtml(g.description || ((g.members || []).length + " members")) + '</div></div>' +
              '<div class="person-actions"><button type="button" class="pill-btn primary" data-join-group="' + escapeAttr(g.id) + '">Request</button></div></div>';
          }).join("");
        }
        if (!htmlG) htmlG = emptyHtml("No groups yet", "Create a study group or request to join a public one.");
        pane.innerHTML = htmlG;
      } else {
        var people = await CodexChat.discoverPeople({ query: q, limit: 50 });
        if (!people.length) {
          pane.innerHTML = emptyHtml("No students found", "Legacy accounts still appear even without full profiles.");
          return;
        }
        pane.innerHTML = people.map(function (p) { return personRow(p, false); }).join("");
      }
    } catch (err) {
      console.error(err);
      pane.innerHTML = emptyHtml("Couldn’t load", err.message || "Check connection and Firestore rules.");
    }
  }

  function personRow(p, isFriend) {
    var sub = [p.university, p.department || p.faculty, p.level].filter(Boolean).join(" · ");
    if (!sub) sub = p.incomplete ? "Profile incomplete — still on Codex" : "Codex student";
    if (p.rank || p.xpPoints) sub += (sub ? " · " : "") + (p.rank ? p.rank + " " : "") + (p.xpPoints ? p.xpPoints + " XP" : "");
    var actions = "";
    if (isFriend || p.relation === "friends") {
      actions = '<button type="button" class="pill-btn primary" data-message="' + escapeAttr(p.uid) + '">Message</button>';
    } else if (p.relation === "outgoing") {
      actions = '<span class="pill-btn ghost">Requested</span>';
    } else if (p.relation === "incoming") {
      actions = '<button type="button" class="pill-btn primary" data-accept="' + escapeAttr(p.requestId) + '">Accept</button>';
    } else {
      actions = '<button type="button" class="pill-btn ghost" data-add="' + escapeAttr(p.uid) + '">Add</button>';
    }
    return (
      '<div class="row-item" style="cursor:default"><div class="av">' + avHtml(p) + '</div>' +
      '<div class="meta"><div class="top"><span class="name">' + escapeHtml(displayNameOf(p)) + '</span></div>' +
      '<div class="preview">' + escapeHtml(sub) + '</div>' +
      (p.incomplete ? '<span class="tag warn">Legacy profile</span>' : '') +
      '</div><div class="person-actions">' + actions + '</div></div>'
    );
  }

  function ticksHtml(m, me) {
    if (m.senderId !== me) return "";
    var read = (m.readBy || []).some(function (x) { return x !== me; });
    var del = (m.deliveredTo || []).some(function (x) { return x !== me; }) || read;
    if (read) return '<span class="ticks read">✓✓</span>';
    if (del) return '<span class="ticks">✓✓</span>';
    return '<span class="ticks">✓</span>';
  }

  function renderMsgs(msgs) {
    state.allMsgs = msgs;
    var me = String((state.me && state.me.uid) || (firebase.auth().currentUser && firebase.auth().currentUser.uid) || "");
    var box = $("threadMsgs");
    var q = (($("threadSearchInput") && $("threadSearchInput").value) || "").trim().toLowerCase();
    if (q) {
      msgs = msgs.filter(function (m) {
        return (m.text || "").toLowerCase().indexOf(q) !== -1 || (m.mediaName || "").toLowerCase().indexOf(q) !== -1;
      });
    }
    if (!msgs.length) {
      box.innerHTML = '<div class="empty"><p>No messages yet. Say hi 👋</p></div>';
      return;
    }
    var parts = [];
    var lastDay = null;
    msgs.forEach(function (m) {
      var dk = dayKey(m.createdAt);
      if (dk && dk !== lastDay) {
        lastDay = dk;
        var label = dayLabel(m.createdAt);
        if (label) {
          parts.push('<div class="day-sep" role="separator"><span>' + escapeHtml(label) + '</span></div>');
        }
      }
      var mine = String(m.senderId || "") === me;
      var body = "";
      if (m.deleted) {
        body = '<em>Message deleted</em>';
      } else {
        if (m.replyTo && m.replyText) {
          body += '<div class="quote">' + escapeHtml(m.replyText) + '</div>';
        }
        if ((m.type === "image" || m.type === "images") && (m.mediaUrl || (m.mediaUrls && m.mediaUrls.length))) {
          var urls = m.mediaUrls && m.mediaUrls.length ? m.mediaUrls : [m.mediaUrl];
          urls = urls.filter(Boolean);
          if (urls.length === 1) {
            body += '<div class="media"><img src="' + escapeAttr(urls[0]) + '" alt="" data-lb-src="' + escapeAttr(urls[0]) + '" data-mid="' + escapeAttr(m.id) + '" style="max-width:200px;max-height:200px;border-radius:10px;cursor:pointer"></div>';
          } else {
            var show = urls.slice(0, 4);
            var extra = urls.length - 4;
            var gclass = "g" + Math.min(show.length, 4);
            body += '<div class="img-grid ' + gclass + '" data-mid="' + escapeAttr(m.id) + '">';
            for (var ui = 0; ui < show.length; ui++) {
              body += '<div class="cell" data-lb-i="' + ui + '"><img src="' + escapeAttr(show[ui]) + '" alt="">';
              if (ui === show.length - 1 && extra > 0) body += '<div class="more">+' + extra + '</div>';
              body += '</div>';
            }
            body += '</div>';
            // stash full urls on message for lightbox
            m._allUrls = urls;
          }
        } else if (m.type === "video" && m.mediaUrl) {
          body += '<video controls playsinline preload="metadata" src="' + escapeAttr(m.mediaUrl) +
            '" style="max-width:100%;max-height:280px;border-radius:12px;background:#0f172a"></video>';
        } else if ((m.type === "file" || m.type === "audio") && m.mediaUrl) {
          body += '<div class="file-chip"><span>📎</span><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:.8rem">' +
            escapeHtml(m.mediaName || (m.type === "audio" ? "Voice note" : "File")) +
            '</div><a href="' + escapeAttr(m.mediaUrl) + '" download target="_blank" rel="noopener" style="font-size:.75rem;color:inherit;opacity:.85">Download</a></div></div>';
          if (m.type === "audio") body += '<audio controls src="' + escapeAttr(m.mediaUrl) + '" style="width:100%;margin-top:4px"></audio>';
        }
        if (m.text) body += escapeHtml(m.text);
        if (m.edited) body += ' <span style="font-size:.7rem;opacity:.7">(edited)</span>';
      }
      parts.push(
        '<div class="bubble-row ' + (mine ? "me" : "them") + '">' +
          '<div class="bubble' + (m.deleted ? " deleted" : "") + '" data-mid="' + escapeAttr(m.id) + '" data-mine="' + (mine ? "1" : "0") + '">' +
            body +
            '<div class="meta-line"><span>' + escapeHtml(clock(m.createdAt)) + '</span>' + ticksHtml(m, me) + '</div>' +
          '</div></div>'
      );
    });
    var html = parts.join("");
    box.innerHTML = html;

    // mark unread from others as read
    var toRead = msgs.filter(function (m) {
      return m.senderId !== me && !(m.readBy || []).includes(me);
    }).map(function (m) { return m.id; });
    if (toRead.length) CodexChat.markMessagesRead(state.convId, toRead);
    else if (state.convId && CodexChat.clearConversationUnread) CodexChat.clearConversationUnread(state.convId);

    box.scrollTop = box.scrollHeight;
  }

  async function openConv(convId, card) {
    state.convId = convId;
    try { if (CodexChat.setActiveConversation) await CodexChat.setActiveConversation(convId); } catch (ePresence) {}
    state.other = card;
    state.otherUid = card && !card.isGroup ? card.uid : null;
    state.replyTo = null;
    $("replyPreview").classList.remove("open");
    // Clear unread for this thread immediately (badge + list pill)
    try {
      if (window.CodexChat && CodexChat.clearConversationUnread) {
        await CodexChat.clearConversationUnread(convId);
      } else if (window.CodexChat && CodexChat.markMessagesRead) {
        await CodexChat.markMessagesRead(convId, []);
      }
    } catch (eClr) {}
    // Zero the list pill for this row if still visible
    try {
      document.querySelectorAll('[data-open-conv="' + convId + '"] .unread-pill').forEach(function (el) { el.remove(); });
    } catch (e2) {}
    // Refresh chats list + nav badge after a short delay so Firestore write lands
    setTimeout(function () {
      try {
        if (state.tab === "chats") loadPane();
        if (window.CodexShell && typeof window.refreshChatBadge === "function") window.refreshChatBadge();
        document.querySelectorAll(".chat-nav-badge").forEach(function (b) {
          // optimistic: if only this conv had unread, hide after clear
        });
      } catch (e3) {}
    }, 400);
    setTimeout(function () {
      try {
        if (firebase.auth().currentUser) {
          var me = firebase.auth().currentUser.uid;
          firebase.firestore().collection("conversations")
            .where("participants", "array-contains", me).limit(40).get()
            .then(function (snap) {
              var total = 0;
              snap.forEach(function (d) {
                if (d.id === convId) return; // skip active
                var x = d.data() || {};
                var u = x.unreadCount || x.unread || {};
                total += typeof u === "number" ? Number(u) || 0 : (Number(u[me]) || 0);
              });
              document.querySelectorAll(".chat-nav-badge").forEach(function (b) {
                if (total > 0) { b.hidden = false; b.textContent = total > 99 ? "99+" : String(total); }
                else { b.hidden = true; b.textContent = ""; }
              });
            });
        }
      } catch (e4) {}
    }, 600);

    if (state.unsubMsg) { try { state.unsubMsg(); } catch (e) {} state.unsubMsg = null; }
    if (state.unsubTyping) { try { state.unsubTyping(); } catch (e) {} state.unsubTyping = null; }
    if (state.unsubPresence) { try { state.unsubPresence(); } catch (e) {} state.unsubPresence = null; }

    $("threadName").textContent = displayNameOf(card) || "Chat";
    var subBits = [];
    if (card && card.isGroup) {
      $("threadSub").textContent = "Group · loading…";
      state.groupCreatedBy = null;
      (CodexChat.getGroupPresenceStats || function (id) {
        return CodexChat.getGroupMemberCount(id).then(function (n) {
          return { online: 0, total: n, createdBy: null };
        });
      })(convId).then(function (st) {
        if (state.convId !== convId) return;
        state.groupCreatedBy = st.createdBy || null;
        var n = st.total || 1;
        var on = st.online || 0;
        var label = on + " online · " + n + " member" + (n === 1 ? "" : "s");
        $("threadSub").textContent = label;
        $("threadSub").classList.toggle("presence-online", on > 0);
        $("threadSub").classList.toggle("presence-offline", on === 0);
        if (card) card.university = label;
      }).catch(function () {
        $("threadSub").textContent = card.university || "Group";
      });
    } else {
      // DM: keep subtitle short so thread width stays usable (long uni names were clipping own bubbles)
      $("threadSub").textContent = "Direct message";
      if (card && card.university) {
        $("threadSub").title = card.university;
      }
    }
    $("threadSub").classList.remove("online");
    $("threadAv").innerHTML = avHtml(card || {});
    $("threadAv").classList.remove("online-ring", "offline-ring");
    $("threadAv").classList.add(card && card.isGroup ? "offline-ring" : "offline-ring");

    var pref = await CodexChat.getChatPref(convId);
    state.clearBeforeMs = pref.clearBeforeMs || 0;
    state.muted = !!pref.muted;

    $("thread").classList.add("open");
    document.body.classList.add("thread-open");
    var ph = $("threadPlaceholder");
    if (ph) { ph.style.display = "none"; ph.classList.add("hidden"); }

    $("threadMsgs").innerHTML = '<div class="empty"><p>Loading…</p></div>';
    state.unsubMsg = CodexChat.listenMessages(convId, renderMsgs, { clearBeforeMs: state.clearBeforeMs });

    state.unsubTyping = CodexChat.listenTyping(convId, function (uids) {
      var box = $("threadMsgs");
      var existing = box.querySelector(".typing-row");
      if (existing) existing.remove();
      if (!uids.length) return;
      var el = document.createElement("div");
      el.className = "typing-row";
      el.innerHTML = '<div class="typing-bubble"><i></i><i></i><i></i></div>';
      box.appendChild(el);
      box.scrollTop = box.scrollHeight;
    });

    if (state.otherUid) {
      state.unsubPresence = CodexChat.listenPresence(state.otherUid, function (p) {
        var online = !!(p && (p.online === true || (p.state === "online" && CodexChat.isEffectivelyOnline && CodexChat.isEffectivelyOnline(p))));
        if (p && !online) p = { state: "offline", lastSeen: p.lastSeen };
        var label = lastSeenLabel(p);
        // Keep header compact: status only (university is long and was pushing layout)
        $("threadSub").textContent = label || "Direct message";
        $("threadSub").title = [(card && card.university) || "", label].filter(Boolean).join(" · ");
        $("threadSub").classList.toggle("presence-online", online);
        $("threadAv").classList.toggle("online-ring", online);
        $("threadAv").classList.toggle("offline-ring", !online);
        $("threadSub").classList.toggle("presence-offline", !online);
        $("threadSub").classList.toggle("online", online);
      });
    }
  }

  async function startDm(otherUid) {
    try {
      var card = await CodexChat.getUserCard(otherUid);
      var id = await CodexChat.ensureDm(otherUid);
      await openConv(id, card);
    } catch (e) {
      alert(e.message || "Could not open chat");
    }
  }

  function closeThread() {
    $("thread").classList.remove("open");
    document.body.classList.remove("thread-open");
    var ph = $("threadPlaceholder");
    if (ph) { ph.style.display = ""; ph.classList.remove("hidden"); }
    clearPending();
    if (state.unsubMsg) { try { state.unsubMsg(); } catch (e) {} state.unsubMsg = null; }
    if (state.unsubTyping) { try { state.unsubTyping(); } catch (e) {} state.unsubTyping = null; }
    if (state.unsubPresence) { try { state.unsubPresence(); } catch (e) {} state.unsubPresence = null; }
    CodexChat.setTyping(state.convId, false);
    try { if (CodexChat.setActiveConversation) CodexChat.setActiveConversation(null); } catch (ePresence) {}
    state.convId = null;
    loadPane();
  }

  // list clicks
  $("listPane").addEventListener("click", async function (e) {
    var t = e.target.closest("[data-open-conv]");
    if (t) {
      var id = t.getAttribute("data-open-conv");
      var isGroup = t.getAttribute("data-type") === "group";
      var card;
      if (isGroup) {
        card = {
          uid: id,
          fullName: t.getAttribute("data-name") || "Group",
          photoURL: t.getAttribute("data-photo") || "",
          university: t.getAttribute("data-sub") || "Group",
          isGroup: true
        };
      } else {
        var ou = t.getAttribute("data-uid");
        card = ou ? await CodexChat.getUserCard(ou) : { fullName: "Chat", uid: ou };
      }
      openConv(id, card);
      return;
    }
    var add = e.target.closest("[data-add]");
    if (add) {
      try {
        await CodexChat.sendFriendRequest(add.getAttribute("data-add"));
        add.textContent = "Requested";
        add.disabled = true;
      } catch (err) { alert(err.message || "Request failed"); }
      return;
    }
    var acc = e.target.closest("[data-accept]");
    if (acc) {
      try {
        await CodexChat.respondFriendRequest(acc.getAttribute("data-accept"), true);
        loadPane();
      } catch (err) { alert(err.message || "Accept failed"); }
      return;
    }
    var dec = e.target.closest("[data-decline]");
    if (dec) {
      try {
        await CodexChat.respondFriendRequest(dec.getAttribute("data-decline"), false);
        loadPane();
      } catch (err) { alert(err.message || "Decline failed"); }
      return;
    }
    var msg = e.target.closest("[data-message]");
    if (msg) startDm(msg.getAttribute("data-message"));
    var og = e.target.closest("[data-open-group]");
    if (og) {
      var gid = og.getAttribute("data-open-group");
      (function () {
        var gName = og.querySelector(".name") ? og.querySelector(".name").textContent : "Group";
        var gImg = og.querySelector(".av img");
        var gPhoto = gImg ? gImg.getAttribute("src") : "";
        openConv(gid, { fullName: gName, isGroup: true, uid: gid, photoURL: gPhoto || "" });
      })();
      return;
    }
    var jg = e.target.closest("[data-join-group]");
    if (jg) {
      try {
        await CodexChat.requestJoinGroup(jg.getAttribute("data-join-group"));
        jg.textContent = "Requested";
        jg.disabled = true;
      } catch (err) { alert(err.message || "Could not request"); }
      return;
    }
    var ag = e.target.closest("[data-accept-gjoin]");
    if (ag) {
      try {
        await CodexChat.acceptJoinGroup(ag.getAttribute("data-accept-gjoin"), ag.getAttribute("data-from"));
        loadPane();
      } catch (err) { alert(err.message || "Accept failed"); }
      return;
    }
    var agi = e.target.closest("[data-accept-ginvite]");
    if (agi) {
      try {
        var gid = agi.getAttribute("data-accept-ginvite");
        await CodexChat.acceptGroupInvite(gid);
        try { await CodexChat.clearInviteNotifications(gid); } catch (eC) {}
        loadPane();
        setTab("groups");
      } catch (err) { alert(err.message || "Join failed"); }
      return;
    }
    var dgi = e.target.closest("[data-decline-ginvite]");
    if (dgi) {
      try {
        await CodexChat.declineGroupInvite(dgi.getAttribute("data-decline-ginvite"));
        loadPane();
      } catch (err) { alert(err.message || "Could not decline"); }
      return;
    }
    var dgj = e.target.closest("[data-decline-gjoin]");
    if (dgj) {
      try {
        var gId = dgj.getAttribute("data-decline-gjoin");
        var from = dgj.getAttribute("data-from");
        await firebase.firestore().collection("groups").doc(gId).collection("join_requests").doc(from).set({
          status: "declined",
          resolvedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        loadPane();
      } catch (err) { alert(err.message || "Decline failed"); }
    }
  });

  document.querySelectorAll(".tab").forEach(function (el) {
    el.addEventListener("click", function () { setTab(el.getAttribute("data-tab")); });
  });
  $("btnFind").onclick = function () { setTab("find"); };
  $("searchInput").addEventListener("input", function () {
    clearTimeout(state._st);
    state._st = setTimeout(loadPane, 280);
  });
  $("threadBack").onclick = closeThread;

  // send
  async function sendCurrent() {
    if (typeof window.sendPendingAndText === "function") {
      return window.sendPendingAndText();
    }
    var text = $("msgInput").value.trim();
    if ((!text && !state.pendingFiles.length) || !state.convId) return;
    var extra = {};
    if (state.replyTo) {
      extra.replyTo = state.replyTo.id;
      extra.replyText = state.replyTo.text || state.replyTo.mediaName || "Message";
    }
    if (state.pendingMedia) {
      extra.type = state.pendingMedia.type;
      extra.mediaUrl = state.pendingMedia.url;
      extra.mediaName = state.pendingMedia.name;
    }
    $("msgInput").value = "";
    state.pendingMedia = null;
    state.replyTo = null;
    $("replyPreview").classList.remove("open");
    CodexChat.setTyping(state.convId, false);
    try {
      await CodexChat.sendMessage(state.convId, text, extra);
    } catch (e) {
      alert(e.message || "Send failed");
    }
  }
  $("sendMsg").onclick = function () {
    if (typeof sendPendingAndText === "function") sendPendingAndText();
    else if (typeof sendCurrent === "function") sendCurrent();
  };
  $("msgInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 960px)").matches) {
      e.preventDefault();
      if (typeof sendPendingAndText === "function") sendPendingAndText();
      else if (typeof sendCurrent === "function") sendCurrent();
    }
  });
  var typingTimer;
  $("msgInput").addEventListener("input", function () {
    if (!state.convId) return;
    CodexChat.setTyping(state.convId, true);
    clearTimeout(typingTimer);
    typingTimer = setTimeout(function () { CodexChat.setTyping(state.convId, false); }, 2000);
  });

  // reply clear
  $("replyClear").onclick = function () {
    state.replyTo = null;
    $("replyPreview").classList.remove("open");
  };

  // long-press message actions
  var pressTimer;
  $("threadMsgs").addEventListener("touchstart", function (e) {
    var b = e.target.closest(".bubble[data-mid]");
    if (!b) return;
    pressTimer = setTimeout(function () { openMsgMenu(b); }, 480);
  }, { passive: true });
  $("threadMsgs").addEventListener("touchend", function () { clearTimeout(pressTimer); });
  $("threadMsgs").addEventListener("touchmove", function () { clearTimeout(pressTimer); });
  $("threadMsgs").addEventListener("contextmenu", function (e) {
    var b = e.target.closest(".bubble[data-mid]");
    if (!b) return;
    e.preventDefault();
    openMsgMenu(b);
  });

  function openMsgMenu(bubbleEl) {
    var mid = bubbleEl.getAttribute("data-mid");
    var mine = bubbleEl.getAttribute("data-mine") === "1";
    var m = state.allMsgs.find(function (x) { return x.id === mid; });
    if (!m || m.deleted) return;
    state.selectedMsg = m;
    var body = $("msgSheetBody");
    var items = [];
    items.push('<button type="button" class="sheet-item" data-act="reply">Reply</button>');
    items.push('<button type="button" class="sheet-item" data-act="copy">Copy</button>');
    if (m.mediaUrl) items.push('<button type="button" class="sheet-item" data-act="download">Download</button>');
    if (mine) {
      if (m.type === "text" || m.text) items.push('<button type="button" class="sheet-item" data-act="edit">Edit</button>');
      items.push('<button type="button" class="sheet-item danger" data-act="delete">Delete for everyone</button>');
    }
    items.push('<button type="button" class="sheet-item" data-act="close">Close</button>');
    body.innerHTML = "<h3>Message</h3>" + items.join("");
    $("msgSheet").classList.add("open");
  }

  $("msgSheet").addEventListener("click", async function (e) {
    var act = e.target.getAttribute("data-act");
    if (!act) return;
    var m = state.selectedMsg;
    $("msgSheet").classList.remove("open");
    if (act === "close" || !m) return;
    if (act === "reply") {
      state.replyTo = m;
      $("replyLabel").textContent = "Reply";
      $("replySnippet").textContent = (m.text || m.mediaName || "Message").slice(0, 80);
      $("replyPreview").classList.add("open");
      $("msgInput").focus();
    } else if (act === "copy") {
      try { await navigator.clipboard.writeText(m.text || m.mediaUrl || ""); } catch (err) {}
    } else if (act === "download" && m.mediaUrl) {
      window.open(m.mediaUrl, "_blank");
    } else if (act === "edit") {
      $("editText").value = m.text || "";
      $("editModal").classList.add("open");
    } else if (act === "delete") {
      if (!confirm("Delete this message for everyone?")) return;
      try { await CodexChat.deleteMessage(state.convId, m.id, true); } catch (err) { alert(err.message); }
    }
  });

  $("editCancel").onclick = function () { $("editModal").classList.remove("open"); };
  $("editSave").onclick = async function () {
    try {
      await CodexChat.editMessage(state.convId, state.selectedMsg.id, $("editText").value);
      $("editModal").classList.remove("open");
    } catch (e) { alert(e.message); }
  };

  // thread menu
  $("btnThreadMenu").onclick = function () {
    var body = $("threadSheetBody");
    body.innerHTML =
      "<h3>Chat options</h3>" +
      '<button type="button" class="sheet-item" data-t="search">Search in chat</button>' +
      '<button type="button" class="sheet-item" data-t="mute">' + (state.muted ? "Unmute" : "Mute") + " chat</button>" +
      '<button type="button" class="sheet-item" data-t="theme">Chat colours</button>' +
      '<button type="button" class="sheet-item" data-t="clear">Clear chat for me</button>' +
      (state.other && state.other.isGroup ? '<button type="button" class="sheet-item" data-t="invite">Invite members</button>' : "") +
      (state.other && state.other.isGroup && state.groupCreatedBy && firebase.auth().currentUser && state.groupCreatedBy === firebase.auth().currentUser.uid
        ? '<button type="button" class="sheet-item danger" data-t="deletegroup">Delete group</button>' : "") +
      (state.otherUid ? '<button type="button" class="sheet-item" data-t="unfriend">Unfriend</button>' : "") +
      (state.otherUid ? '<button type="button" class="sheet-item danger" data-t="block">Block user</button>' : "") +
      '<button type="button" class="sheet-item" data-t="close">Close</button>';
    $("threadSheet").classList.add("open");
  };

  $("threadSheet").addEventListener("click", async function (e) {
    var t = e.target.getAttribute("data-t");
    if (!t) return;
    $("threadSheet").classList.remove("open");
    if (t === "close") return;
    if (t === "search") {
      $("threadSearchBar").classList.add("open");
      $("threadSearchInput").focus();
    } else if (t === "mute") {
      state.muted = !state.muted;
      await CodexChat.muteChat(state.convId, state.muted);
    } else if (t === "theme") {
      $("themeSheet").classList.add("open");
    } else if (t === "clear") {
      if (!confirm("Hide all current messages on your device only?")) return;
      await CodexChat.clearChatForMe(state.convId);
      state.clearBeforeMs = Date.now();
      if (state.unsubMsg) state.unsubMsg();
      state.unsubMsg = CodexChat.listenMessages(state.convId, renderMsgs, { clearBeforeMs: state.clearBeforeMs });
    } else if (t === "unfriend" && state.otherUid) {
      if (!confirm("Remove this friend?")) return;
      try {
        await CodexChat.unfriend(state.otherUid);
        closeThread();
      } catch (err) { alert(err.message); }
    } else if (t === "block" && state.otherUid) {
      if (!confirm("Block this user? They won’t be able to message you.")) return;
      try {
        await CodexChat.blockUser(state.otherUid);
        closeThread();
      } catch (err) { alert(err.message); }
    } else if (t === "deletegroup") {
        if (!confirm("Delete this group for everyone? Messages will no longer be available in the app list.")) return;
        try {
          await CodexChat.deleteGroup(state.convId);
          alert("Group deleted");
          closeThread();
          if (state.tab === "chats" || state.tab === "groups") loadPane();
        } catch (err) { alert(err.message || "Could not delete group"); }
        return;
      }
      if (t === "invite") {
      openInviteModal(state.convId);
    }
  });

  async function openInviteModal(groupId) {
    state.inviteGroupId = groupId;
    state.inviteSelected = {};
    var body = $("inviteList");
    body.innerHTML = '<div class="empty"><p>Loading friends…</p></div>';
    $("inviteModal").classList.add("open");
    try {
      var friends = await CodexChat.listFriends();
      if (!friends.length) {
        body.innerHTML = '<div class="empty"><p>No friends to invite yet.</p></div>';
        return;
      }
      body.innerHTML = friends.map(function (p) {
        return (
          '<label class="invite-row">' +
            '<div class="av" style="width:40px;height:40px">' + avHtml(p) + '</div>' +
            '<div class="meta"><div class="name">' + escapeHtml(displayNameOf(p)) + '</div>' +
            '<div class="preview">' + escapeHtml(p.university || "") + '</div></div>' +
            '<input type="checkbox" data-inv="' + escapeAttr(p.uid) + '">' +
          '</label>'
        );
      }).join("");
    } catch (e) {
      body.innerHTML = '<div class="empty"><p>Could not load friends.</p></div>';
    }
  }


  $("btnThreadSearch").onclick = function () {
    $("threadSearchBar").classList.toggle("open");
  };
  $("threadSearchInput").addEventListener("input", function () {
    renderMsgs(state.allMsgs);
  });

  document.querySelectorAll("#themeSheet [data-theme]").forEach(function (btn) {
    btn.onclick = function () {
      applyTheme(btn.getAttribute("data-theme"));
      $("themeSheet").classList.remove("open");
    };
  });
  $("themeClose").onclick = function () { $("themeSheet").classList.remove("open"); };

  // attach
  $("btnAttach").onclick = function () { $("attachSheet").classList.add("open"); };
  $("attClose").onclick = function () { $("attachSheet").classList.remove("open"); };
  $("attCamera").onclick = function () { $("fileCamera").click(); };
  $("attGallery").onclick = function () { $("fileGallery").click(); };
  $("attFile").onclick = function () { $("fileDoc").click(); };
  if ($("attVideo")) $("attVideo").onclick = function () { $("fileVideo").click(); };

  function getVideoDuration(file) {
    return new Promise(function (resolve, reject) {
      var v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = function () {
        URL.revokeObjectURL(v.src);
        resolve(v.duration || 0);
      };
      v.onerror = function () { reject(new Error("Could not read video")); };
      v.src = URL.createObjectURL(file);
    });
  }


  function revokePreview(item) {
    try {
      if (item && item.preview && String(item.preview).indexOf("blob:") === 0) URL.revokeObjectURL(item.preview);
    } catch (e) {}
  }

  function clearPending() {
    (state.pendingFiles || []).forEach(revokePreview);
    state.pendingFiles = [];
    var strip = $("pendingStrip");
    if (strip) { strip.innerHTML = ""; strip.classList.remove("open"); }
  }

  function renderPending() {
    var strip = $("pendingStrip");
    if (!strip) return;
    if (!state.pendingFiles.length) {
      strip.innerHTML = "";
      strip.classList.remove("open");
      return;
    }
    strip.classList.add("open");
    strip.innerHTML = state.pendingFiles.map(function (f, i) {
      var inner = "";
      if (f.type === "image" && f.preview) {
        inner = '<img src="' + escapeAttr(f.preview) + '" alt="">';
        inner += '<span class="edit-badge">Crop</span>';
      } else if (f.type === "video" && f.preview) {
        inner = '<video src="' + escapeAttr(f.preview) + '" muted preload="metadata"></video>';
        inner += '<div class="vid-badge"><span>▶</span></div>';
        inner += '<span class="edit-badge">Trim</span>';
      } else {
        inner = '<div class="fname">' + escapeHtml(f.name || "File") + '</div>';
      }
      return '<div class="pitem" data-edit="' + i + '">' + inner +
        '<button type="button" class="rm" data-rm="' + i + '" aria-label="Remove">×</button></div>';
    }).join("");
  }

  function queuePendingFile(file, typeHint) {
    if (!file) return;
    var type = typeHint || (
      file.type && file.type.indexOf("image/") === 0 ? "image" :
      file.type && file.type.indexOf("video/") === 0 ? "video" : "file"
    );
    if (type === "video" && file.size > 40 * 1024 * 1024) {
      alert("Video must be under 40MB");
      return;
    }
    var item = {
      file: file,
      name: file.name,
      type: type,
      preview: null,
      caption: "",
      trimStart: 0,
      trimEnd: null,
      editedBlob: null
    };
    if (type === "image" || type === "video") {
      item.preview = URL.createObjectURL(file);
    }
    state.pendingFiles.push(item);
    renderPending();
    return item;
  }

  async function handleFile(file, typeHint) {
    if (!file || !state.convId) return;
    $("attachSheet").classList.remove("open");
    queuePendingFile(file, typeHint);
  }

  // ---- Media editor (crop / trim) ----
  var meState = { index: -1, mode: null, dragging: null };

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    var m = Math.floor(s / 60);
    var ss = s % 60;
    return m + ":" + (ss < 10 ? "0" : "") + ss;
  }

  function openMediaEditor(index) {
    var item = state.pendingFiles[index];
    if (!item || (item.type !== "image" && item.type !== "video")) return;
    meState.index = index;
    meState.mode = item.type;
    var ed = $("mediaEditor");
    var stage = $("meStage");
    stage.innerHTML = "";
    $("meCaption").value = item.caption || "";
    $("meTrim").style.display = item.type === "video" ? "block" : "none";
    $("meHint").textContent = item.type === "video"
      ? "Drag start/end to trim · max 60s recommended · tap Use when ready"
      : "Drag the box to crop · resize from the corner · or tap Original to skip";

    if (item.type === "image") {
      $("meTitle").textContent = "Crop photo";
      var wrap = document.createElement("div");
      wrap.className = "me-crop-wrap";
      wrap.id = "meCropWrap";
      var img = document.createElement("img");
      img.id = "meImg";
      img.onload = function () {
        // Wait one frame so flex sizing has settled before measuring the image.
        requestAnimationFrame(function () {
          var w = img.clientWidth, h = img.clientHeight;
          if (!w || !h) {
            w = img.getBoundingClientRect().width;
            h = img.getBoundingClientRect().height;
          }
          if (!w || !h) return;
          var side = Math.min(w, h) * 0.85;
        var box = document.createElement("div");
        box.className = "me-crop-box";
        box.id = "meCropBox";
        box.style.width = side + "px";
        box.style.height = side + "px";
        box.style.left = ((w - side) / 2) + "px";
        box.style.top = ((h - side) / 2) + "px";
        var handle = document.createElement("div");
        handle.className = "me-handle";
        handle.id = "meCropHandle";
        box.appendChild(handle);
        wrap.appendChild(box);
          setupCropDrag(wrap, img, box, handle);
        });
      };
      img.onerror = function () {
        stage.innerHTML = '<div style="padding:24px;text-align:center;color:#fff">Could not preview this photo. You can cancel and choose it again.</div>';
      };
      wrap.appendChild(img);
      stage.appendChild(wrap);
      // Assign after the element is in the document so mobile browsers calculate
      // its dimensions correctly.
      img.src = item.preview;
    } else {
      $("meTitle").textContent = "Trim video";
      var vid = document.createElement("video");
      vid.id = "meVideo";
      vid.src = item.preview;
      vid.controls = true;
      vid.playsInline = true;
      vid.preload = "metadata";
      stage.appendChild(vid);
      vid.onloadedmetadata = function () {
        var dur = vid.duration || 0;
        $("meStart").min = 0;
        $("meStart").max = dur;
        $("meStart").step = 0.1;
        $("meEnd").min = 0;
        $("meEnd").max = dur;
        $("meEnd").step = 0.1;
        var start = item.trimStart || 0;
        var end = item.trimEnd != null ? item.trimEnd : Math.min(dur, 60);
        if (end - start > 60) end = start + 60;
        $("meStart").value = start;
        $("meEnd").value = end;
        $("meStartLbl").textContent = fmtTime(start);
        $("meEndLbl").textContent = fmtTime(end);
        vid.currentTime = start;
      };
    }
    ed.classList.add("open");
    ed.setAttribute("aria-hidden", "false");
  }

  function setupCropDrag(wrap, img, box, handle) {
    var mode = null; // move | resize
    var sx, sy, sl, st, sw, sh;
    function onStart(clientX, clientY, m) {
      mode = m;
      sx = clientX; sy = clientY;
      sl = box.offsetLeft; st = box.offsetTop;
      sw = box.offsetWidth; sh = box.offsetHeight;
    }
    function onMove(clientX, clientY) {
      if (!mode) return;
      var dx = clientX - sx, dy = clientY - sy;
      var maxW = img.clientWidth, maxH = img.clientHeight;
      if (mode === "move") {
        var nl = Math.max(0, Math.min(maxW - box.offsetWidth, sl + dx));
        var nt = Math.max(0, Math.min(maxH - box.offsetHeight, st + dy));
        box.style.left = nl + "px";
        box.style.top = nt + "px";
      } else {
        var nw = Math.max(60, Math.min(maxW - sl, sw + dx));
        var nh = Math.max(60, Math.min(maxH - st, sh + dy));
        // keep roughly free crop
        box.style.width = nw + "px";
        box.style.height = nh + "px";
      }
    }
    function onEnd() { mode = null; }
    box.addEventListener("touchstart", function (e) {
      if (e.target === handle) return;
      var t = e.touches[0];
      onStart(t.clientX, t.clientY, "move");
    }, { passive: true });
    handle.addEventListener("touchstart", function (e) {
      var t = e.touches[0];
      onStart(t.clientX, t.clientY, "resize");
      e.stopPropagation();
    }, { passive: true });
    window.addEventListener("touchmove", function (e) {
      if (!mode) return;
      var t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener("touchend", onEnd);
    box.addEventListener("mousedown", function (e) {
      if (e.target === handle) return;
      onStart(e.clientX, e.clientY, "move");
      e.preventDefault();
    });
    handle.addEventListener("mousedown", function (e) {
      onStart(e.clientX, e.clientY, "resize");
      e.preventDefault();
      e.stopPropagation();
    });
    window.addEventListener("mousemove", function (e) {
      if (!mode) return;
      onMove(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", onEnd);
  }

  function closeMediaEditor() {
    var ed = $("mediaEditor");
    if (ed) {
      ed.classList.remove("open");
      ed.setAttribute("aria-hidden", "true");
    }
    $("meStage").innerHTML = "";
    meState.index = -1;
  }

  function cropImageToBlob() {
    var img = $("meImg");
    var box = $("meCropBox");
    if (!img || !box) return null;
    var scaleX = img.naturalWidth / img.clientWidth;
    var scaleY = img.naturalHeight / img.clientHeight;
    var sx = box.offsetLeft * scaleX;
    var sy = box.offsetTop * scaleY;
    var sw = box.offsetWidth * scaleX;
    var sh = box.offsetHeight * scaleY;
    var canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, "image/jpeg", 0.92);
    });
  }

  function trimVideoToBlob(video, start, end) {
    return new Promise(function (resolve, reject) {
      if (!video || end <= start) {
        reject(new Error("Invalid trim"));
        return;
      }
      // Prefer captureStream when available
      var stream;
      try {
        if (video.captureStream) stream = video.captureStream();
        else if (video.mozCaptureStream) stream = video.mozCaptureStream();
      } catch (e) {}
      if (!stream || typeof MediaRecorder === "undefined") {
        reject(new Error("Trim not supported on this device — original will be used"));
        return;
      }
      var chunks = [];
      var mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
        ? "video/webm;codecs=vp8,opus"
        : (MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "");
      var rec;
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (e2) {
        reject(e2);
        return;
      }
      rec.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = function () {
        resolve(new Blob(chunks, { type: rec.mimeType || "video/webm" }));
      };
      rec.onerror = function () { reject(new Error("Record failed")); };
      video.pause();
      video.currentTime = start;
      var onSeek = function () {
        video.removeEventListener("seeked", onSeek);
        rec.start(200);
        video.play();
        var check = setInterval(function () {
          if (video.currentTime >= end - 0.05 || video.ended) {
            clearInterval(check);
            try { video.pause(); } catch (e) {}
            try { rec.stop(); } catch (e2) {}
          }
        }, 80);
        // safety timeout
        setTimeout(function () {
          clearInterval(check);
          try { if (rec.state === "recording") rec.stop(); } catch (e) {}
        }, Math.ceil((end - start) * 1000) + 3000);
      };
      video.addEventListener("seeked", onSeek);
    });
  }

  // Trim range inputs
  function bindTrimInputs() {
    var startEl = $("meStart"), endEl = $("meEnd");
    if (!startEl) return;
    function sync() {
      var a = parseFloat(startEl.value) || 0;
      var b = parseFloat(endEl.value) || 0;
      if (b <= a) {
        b = a + 0.5;
        endEl.value = b;
      }
      if (b - a > 60) {
        // clamp window to 60s from the side being moved
        if (meState._lastTrim === "start") {
          b = a + 60;
          endEl.value = b;
        } else {
          a = b - 60;
          if (a < 0) { a = 0; b = 60; }
          startEl.value = a;
          endEl.value = b;
        }
      }
      $("meStartLbl").textContent = fmtTime(a);
      $("meEndLbl").textContent = fmtTime(b);
      var vid = $("meVideo");
      if (vid) {
        try { vid.currentTime = a; } catch (e) {}
      }
    }
    startEl.oninput = function () { meState._lastTrim = "start"; sync(); };
    endEl.oninput = function () { meState._lastTrim = "end"; sync(); };
  }
  bindTrimInputs();

  if ($("meClose")) $("meClose").onclick = closeMediaEditor;
  if ($("meCancel")) $("meCancel").onclick = function () {
    // remove item from pending if cancel from first open? Keep in strip without edit
    closeMediaEditor();
  };
  if ($("meSkip")) $("meSkip").onclick = function () {
    // keep original file
    var item = state.pendingFiles[meState.index];
    if (item) {
      item.editedBlob = null;
      item.trimStart = 0;
      item.trimEnd = null;
      item.caption = $("meCaption").value.trim();
    }
    closeMediaEditor();
    renderPending();
  };
  if ($("meDone")) $("meDone").onclick = async function () {
    var idx = meState.index;
    var item = state.pendingFiles[idx];
    if (!item) { closeMediaEditor(); return; }
    item.caption = $("meCaption").value.trim();
    $("meDone").disabled = true;
    $("meDone").textContent = "Working…";
    try {
      if (item.type === "image") {
        var blob = await cropImageToBlob();
        if (blob) {
          item.editedBlob = blob;
          revokePreview(item);
          item.preview = URL.createObjectURL(blob);
          item.name = (item.name || "photo").replace(/\.\w+$/, "") + "-crop.jpg";
        }
      } else if (item.type === "video") {
        var start = parseFloat($("meStart").value) || 0;
        var end = parseFloat($("meEnd").value) || 0;
        item.trimStart = start;
        item.trimEnd = end;
        var vid = $("meVideo");
        try {
          var vblob = await trimVideoToBlob(vid, start, end);
          if (vblob && vblob.size > 1000) {
            item.editedBlob = vblob;
            revokePreview(item);
            item.preview = URL.createObjectURL(vblob);
            item.name = (item.name || "video").replace(/\.\w+$/, "") + "-trim.webm";
          }
        } catch (eTrim) {
          // keep original; still store trim markers for UI
          console.warn("trim fallback", eTrim);
          alert((eTrim && eTrim.message) || "Could not trim on this device. Original video will be sent.");
        }
      }
      closeMediaEditor();
      renderPending();
    } catch (e) {
      alert(e.message || "Edit failed");
    } finally {
      $("meDone").disabled = false;
      $("meDone").textContent = "Use";
    }
  };

  // pending strip clicks
  if ($("pendingStrip")) {
    $("pendingStrip").onclick = function (e) {
      var rm = e.target.closest("[data-rm]");
      if (rm) {
        var i = Number(rm.getAttribute("data-rm"));
        revokePreview(state.pendingFiles[i]);
        state.pendingFiles.splice(i, 1);
        renderPending();
        e.stopPropagation();
        return;
      }
      var ed = e.target.closest("[data-edit]");
      if (ed) {
        openMediaEditor(Number(ed.getAttribute("data-edit")));
      }
    };
  }

  function addPendingFiles(fileList, typeHint) {
    var arr = Array.prototype.slice.call(fileList || []);
    var firstEditable = -1;
    arr.forEach(function (file) {
      var detected = file.type && file.type.indexOf("image/") === 0 ? "image" :
        file.type && file.type.indexOf("video/") === 0 ? "video" : "file";
      // A hint is used only when it agrees with the input's intended media kind.
      // This prevents a video selected from an image-capable picker from being
      // treated as an image and sent into the crop pipeline.
      var t = typeHint || detected;
      if (typeHint === "image" && detected === "video") t = "video";
      if (typeHint === "video" && detected === "image") t = "image";
      queuePendingFile(file, t);
      if (firstEditable < 0 && (t === "image" || t === "video")) {
        firstEditable = state.pendingFiles.length - 1;
      }
    });
    // Open editor for first image/video so user can crop/trim (tap others in the strip to edit)
    if (firstEditable >= 0 && arr.length === 1) {
      openMediaEditor(firstEditable);
    }
  }

  window.sendPendingAndText = async function sendPendingAndText() {
    var text = $("msgInput").value.trim();
    if (!state.convId) return;
    if (!text && !state.pendingFiles.length) return;
    var replyExtra = {};
    if (state.replyTo) {
      replyExtra.replyTo = state.replyTo.id;
      replyExtra.replyText = state.replyTo.text || state.replyTo.mediaName || "Message";
    }
    $("msgInput").value = "";
    CodexChat.setTyping(state.convId, false);

    var pending = state.pendingFiles.slice();
    clearPending();

    try {
      for (var i = 0; i < pending.length; i++) {
        var item = pending[i];
        var fileToUpload = item.editedBlob
          ? new File([item.editedBlob], item.name || "media", { type: item.editedBlob.type || item.file.type })
          : item.file;
        if (!window.CodexMedia || !CodexMedia.uploadToCloudinary) throw new Error("Upload not available");
        var res = await CodexMedia.uploadToCloudinary(fileToUpload, { folder: "codex_hub/chat" });
        var url = res.secure_url || res.url;
        var caption = (item.caption || "").trim();
        // first item can carry the typed message as caption if no item caption
        var msgText = caption || (i === 0 ? text : "");
        if (i === 0) text = caption ? text : ""; // if caption used, still allow separate text after
        await CodexChat.sendMessage(state.convId, msgText, Object.assign({
          type: item.type || "file",
          mediaUrl: url,
          mediaName: item.name || fileToUpload.name
        }, replyExtra));
        replyExtra = {}; // only first message gets reply
      }
      if (text) {
        await CodexChat.sendMessage(state.convId, text, replyExtra);
      }
      state.replyTo = null;
      $("replyPreview").classList.remove("open");
    } catch (e) {
      alert(e.message || "Send failed");
    }
  };


  $("sendMsg").onclick = sendPendingAndText;

  // Attach / files
  $("fileCamera").onchange = function () {
    if (this.files[0]) addPendingFiles(this.files, "image");
    this.value = "";
    $("attachSheet").classList.remove("open");
  };
  $("fileGallery").onchange = function () {
    if (this.files && this.files.length) addPendingFiles(this.files);
    this.value = "";
    $("attachSheet").classList.remove("open");
  };
  $("fileVideo").onchange = function () {
    if (this.files && this.files.length) addPendingFiles(this.files, "video");
    this.value = "";
    $("attachSheet").classList.remove("open");
  };
  $("fileDoc").onchange = function () {
    if (this.files[0]) addPendingFiles(this.files, "file");
    this.value = "";
    $("attachSheet").classList.remove("open");
  };

  // Voice modal
  function formatSecs(s) {
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function stopVoiceTracks() {
    if (state._voiceStream) {
      state._voiceStream.getTracks().forEach(function (t) { t.stop(); });
      state._voiceStream = null;
    }
  }

  $("btnMic").onclick = async function () {
    if (state.recording) return;
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state._voiceStream = stream;
      state.recChunks = [];
      state.voiceSecs = 0;
      state.voicePaused = false;
      state.voiceBlob = null;
      var mr = new MediaRecorder(stream);
      state.mediaRecorder = mr;
      mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) state.recChunks.push(ev.data); };
      mr.onstop = function () {
        stopVoiceTracks();
        state.voiceBlob = new Blob(state.recChunks, { type: "audio/webm" });
        var url = URL.createObjectURL(state.voiceBlob);
        var aud = $("voicePreview");
        aud.src = url;
        aud.style.display = "block";
        $("voiceTitle").textContent = "Preview voice note";
        $("voiceWave").classList.add("paused");
        $("voicePause").textContent = "Play";
        clearInterval(state.voiceTick);
      };
      mr.start(200);
      state.recording = true;
      $("btnMic").classList.add("rec");
      $("voiceModal").classList.add("open");
      $("voiceTitle").textContent = "Recording…";
      $("voicePreview").style.display = "none";
      $("voiceWave").classList.remove("paused");
      $("voicePause").textContent = "Pause";
      $("voiceTimer").textContent = "0:00";
      state.voiceTick = setInterval(function () {
        if (!state.voicePaused && state.recording) {
          state.voiceSecs++;
          $("voiceTimer").textContent = formatSecs(state.voiceSecs);
        }
      }, 1000);
    } catch (e) {
      alert("Microphone permission is required for voice notes.");
    }
  };

  $("voiceCancel").onclick = function () {
    try { if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") state.mediaRecorder.stop(); } catch (e) {}
    stopVoiceTracks();
    clearInterval(state.voiceTick);
    state.recording = false;
    state.voiceBlob = null;
    $("btnMic").classList.remove("rec");
    $("voiceModal").classList.remove("open");
  };

  $("voicePause").onclick = function () {
    if (!state.recording && state.voiceBlob) {
      var aud = $("voicePreview");
      if (aud.paused) { aud.play(); $("voicePause").textContent = "Pause"; $("voiceWave").classList.remove("paused"); }
      else { aud.pause(); $("voicePause").textContent = "Play"; $("voiceWave").classList.add("paused"); }
      return;
    }
    if (!state.mediaRecorder) return;
    if (state.mediaRecorder.state === "recording") {
      state.mediaRecorder.pause();
      state.voicePaused = true;
      $("voicePause").textContent = "Resume";
      $("voiceWave").classList.add("paused");
      $("voiceTitle").textContent = "Paused";
    } else if (state.mediaRecorder.state === "paused") {
      state.mediaRecorder.resume();
      state.voicePaused = false;
      $("voicePause").textContent = "Pause";
      $("voiceWave").classList.remove("paused");
      $("voiceTitle").textContent = "Recording…";
    }
  };

  $("voiceSend").onclick = async function () {
    try {
      if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
        await new Promise(function (resolve) {
          state.mediaRecorder.onstop = function () {
            stopVoiceTracks();
            state.voiceBlob = new Blob(state.recChunks, { type: "audio/webm" });
            resolve();
          };
          state.mediaRecorder.stop();
        });
      }
      clearInterval(state.voiceTick);
      state.recording = false;
      $("btnMic").classList.remove("rec");
      $("voiceModal").classList.remove("open");
      if (!state.voiceBlob) return;
      var file = new File([state.voiceBlob], "voice-" + Date.now() + ".webm", { type: "audio/webm" });
      var res = await CodexMedia.uploadToCloudinary(file, { folder: "codex_hub/chat" });
      await CodexChat.sendMessage(state.convId, "", {
        type: "audio",
        mediaUrl: res.url || res.secure_url,
        mediaName: file.name
      });
      state.voiceBlob = null;
    } catch (e) {
      alert(e.message || "Could not send voice note");
    }
  };

  // Lightbox
  function openLightbox(urls, msg) {
    state.lightboxUrls = urls || [];
    state.lightboxMsg = msg;
    var body = $("lbBody");
    body.innerHTML = state.lightboxUrls.map(function (u) {
      return '<img src="' + escapeAttr(u) + '" alt="">';
    }).join("");
    $("lbCounter").textContent = state.lightboxUrls.length + " photo" + (state.lightboxUrls.length === 1 ? "" : "s");
    $("lightbox").classList.add("open");
  }
  function closeLightbox() { $("lightbox").classList.remove("open"); }
  $("lbClose").onclick = closeLightbox;
  $("lbClose2").onclick = closeLightbox;
  $("lbDownload").onclick = function () {
    if (state.lightboxUrls[0]) window.open(state.lightboxUrls[0], "_blank");
  };
  $("lbReply").onclick = function () {
    if (state.lightboxMsg) {
      state.replyTo = state.lightboxMsg;
      $("replyLabel").textContent = "Reply";
      $("replySnippet").textContent = "Photo";
      $("replyPreview").classList.add("open");
    }
    closeLightbox();
  };
  $("lbMenu").onclick = function () {
    // same as reply/download already shown
  };

  $("threadMsgs").addEventListener("click", function (e) {
    var cell = e.target.closest(".img-grid .cell, img[data-lb-src]");
    if (!cell) return;
    var grid = e.target.closest(".img-grid");
    var mid = (grid && grid.getAttribute("data-mid")) || cell.getAttribute("data-mid");
    var msg = state.allMsgs.find(function (m) { return m.id === mid; });
    var urls = [];
    if (msg && msg._allUrls) urls = msg._allUrls;
    else if (msg && msg.mediaUrls) urls = msg.mediaUrls;
    else if (cell.getAttribute("data-lb-src")) urls = [cell.getAttribute("data-lb-src")];
    else if (msg && msg.mediaUrl) urls = [msg.mediaUrl];
    if (urls.length) openLightbox(urls, msg);
  });

  // group create expanded
  if ($("groupName")) {
    $("groupName").addEventListener("focus", function () {
      setTimeout(function () {
        try { $("groupName").scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) {}
      }, 300);
    });
  }

  // Stickers (in-app pack — system keyboard stickers are blocked by the browser)
  var STICKERS = ["📚","🧠","✍️","🔥","💯","🎉","👏","🙏","💪","✨","🎯","✅","❤️","😂","😅","😎","🤝","📌","⏰","💡"];
  if ($("attSticker")) $("attSticker").onclick = function () {
    $("attachSheet").classList.remove("open");
    var sheet = $("stickerSheet");
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.id = "stickerSheet";
      sheet.className = "sheet-bg open";
      sheet.innerHTML = '<div class="sheet"><h3>Stickers</h3><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:8px 12px 16px">' +
        STICKERS.map(function (s) {
          return '<button type="button" class="sticker-btn" data-st="' + s + '" style="font-size:1.6rem;border:0;background:#F1F5F9;border-radius:12px;padding:12px;cursor:pointer">' + s + '</button>';
        }).join("") +
        '</div><button type="button" class="sheet-item" id="stickerClose">Close</button></div>';
      document.body.appendChild(sheet);
      sheet.addEventListener("click", function (e) {
        var st = e.target.closest("[data-st]");
        if (st && state.convId) {
          CodexChat.sendMessage(state.convId, st.getAttribute("data-st")).catch(function (err) { alert(err.message); });
          sheet.classList.remove("open");
        }
        if (e.target.id === "stickerClose" || e.target === sheet) sheet.classList.remove("open");
      });
    } else {
      sheet.classList.add("open");
    }
  };

  $("btnGroup").onclick = function () {
    state.groupPhotoURL = "";
    $("groupName").value = "";
    $("groupDesc").value = "";
    $("groupPublic").checked = false;
    $("groupPhotoPrev").innerHTML = "Photo";
    $("groupModal").classList.add("open");
  };
  $("groupCancel").onclick = function () { $("groupModal").classList.remove("open"); };
  $("groupPhotoBtn").onclick = function () { $("groupPhotoFile").click(); };
  $("groupPhotoFile").onchange = async function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    try {
      var res = await CodexMedia.uploadToCloudinary(file, { folder: "codex_hub/chat" });
      state.groupPhotoURL = res.url || res.secure_url;
      $("groupPhotoPrev").innerHTML = '<img src="' + escapeAttr(state.groupPhotoURL) + '" style="width:100%;height:100%;object-fit:cover">';
    } catch (e) { alert(e.message || "Upload failed"); }
  };
  $("groupCreate").onclick = async function () {
    var name = $("groupName").value.trim();
    try {
      var inviteUids = state.pendingInviteUids || [];
      var id = await CodexChat.createGroup(name, {
        description: $("groupDesc").value.trim(),
        visibility: $("groupPublic").checked ? "public" : "private",
        photoURL: state.groupPhotoURL || ""
      });
      if (inviteUids.length) {
        try { await CodexChat.inviteToGroup(id, inviteUids); } catch (eInv) { console.warn(eInv); }
      }
      state.pendingInviteUids = [];
      $("groupModal").classList.remove("open");
      setTab("groups");
      openConv(id, { fullName: name, isGroup: true, uid: id, photoURL: state.groupPhotoURL });
    } catch (e) {
      alert(e.message || "Could not create group");
    }
  };

  // boot
  try { if (window.refreshChatBadge) refreshChatBadge(); } catch (eB) {}
  CodexShell.mountShell({ page: "chats", title: "Chats", user: { fullName: "Student" } });
  CodexAuth.requireUser().then(async function (res) {
    state.me = res.user;
    state.profile = res.profile || {};
    var shellProfile = Object.assign({}, state.profile);
    try {
      var pubSnap = await firebase.firestore().collection("public_profiles").doc(res.user.uid).get();
      if (pubSnap.exists) {
        var pub = pubSnap.data() || {};
        if (pub.avatarKey) shellProfile.avatarKey = pub.avatarKey;
        if (pub.photoURL) shellProfile.photoURL = pub.photoURL;
      }
    } catch (ePub) { console.warn("Chat shell public profile", ePub); }
    try { if (window.CodexOnboarding) setTimeout(function () { CodexOnboarding.startChatsTour(); }, 700); } catch (eOb) {}
    CodexShell.mountShell({
      page: "chats",
      title: "Chats",
      user: { fullName: shellProfile.fullName || res.user.displayName || "Student" },
      profile: shellProfile
    });
    try { CodexChat.touchPresence(); } catch (e) {}
    setInterval(function () { try { CodexChat.touchPresence(); } catch (e) {} }, 60000);
    setTab("chats");
    // Keep group online counts current while the Chats page is open.
    setInterval(function () {
      if (state.tab === "chats" && !document.hidden) refreshGroupPresenceRows();
    }, 15000);
  });

  // Invite modal actions
  if ($("inviteCancel")) $("inviteCancel").onclick = function () { $("inviteModal").classList.remove("open"); };
  if ($("inviteSend")) $("inviteSend").onclick = async function () {
    var ids = [];
    document.querySelectorAll("#inviteList input[data-inv]:checked").forEach(function (el) {
      ids.push(el.getAttribute("data-inv"));
    });
    if (!ids.length) { alert("Select at least one friend"); return; }
    try {
      if (state.inviteGroupId === "__pending__") {
        state.pendingInviteUids = ids;
        $("inviteModal").classList.remove("open");
        if ($("groupInviteBtn")) $("groupInviteBtn").textContent = ids.length + " friend(s) selected";
        return;
      }
      var gid = state.inviteGroupId || state.convId;
      await CodexChat.inviteToGroup(gid, ids);
      $("inviteModal").classList.remove("open");
      alert("Invites sent");
    } catch (e) { alert(e.message || "Invite failed"); }
  };

  // Group create: optional invite friends before create
  if ($("groupInviteBtn")) $("groupInviteBtn").onclick = function () {
    state.inviteGroupId = null; // pre-create selection
    openInviteModal("__pending__");
  };
})();


  function updateChatNavBadge(n) {
    try {
      var nav = document.querySelector('.codex-bottom a[href*="chats"], .bottom-nav a[href*="chats"], [data-nav="chats"]');
      if (!nav) return;
      nav.style.position = "relative";
      var b = nav.querySelector(".codex-nav-badge");
      if (!b) {
        b = document.createElement("span");
        b.className = "codex-nav-badge";
        nav.appendChild(b);
      }
      if (n > 0) {
        b.style.display = "block";
        b.textContent = n > 9 ? "9+" : String(n);
      } else {
        b.style.display = "none";
        b.textContent = "";
      }
    } catch (e) {}
  }
