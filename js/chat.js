/**
 * Codex Hub — Social / Chat module (production)
 * Collections: users, public_profiles, friend_requests, friendships,
 *   conversations/{id}/messages, groups, presence, notifications,
 *   blocks/{uid}/blocked/{other}, chat_prefs/{uid}/convs/{convId},
 *   typing/{convId}/uids/{uid}
 */
(function (global) {
  "use strict";

  function db() { return firebase.firestore(); }
  function auth() { return firebase.auth(); }
  function uid() { var u = auth().currentUser; return u ? u.uid : null; }
  function nowTs() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function dmId(a, b) { return a < b ? a + "_" + b : b + "_" + a; }

  function displayFromUser(data, id) {
    data = data || {};
    var name =
      data.fullName || data.displayName || data.username || data.name ||
      (data.email ? String(data.email).split("@")[0] : null) || "Student";
    return {
      uid: id,
      fullName: name,
      username: data.username || "",
      university: data.university || data.school || "",
      faculty: data.faculty || "",
      department: data.department || "",
      level: data.level || data.currentLevel || "",
      photoURL: data.photoURL || data.avatarUrl || data.profileImage || data.photo || "",
      avatarKey: data.avatarKey || "",
      bio: data.bio || "",
      xpPoints: typeof data.xpPoints === "number" ? data.xpPoints : (data.xp || 0),
      rank: data.rank || data.rankLabel || "",
      incomplete: !(data.university || data.department || data.username)
    };
  }

  async function getUserCard(userId) {
    if (!userId) return null;
    try {
      var pub = await db().collection("public_profiles").doc(userId).get();
      if (pub.exists) {
        var p = pub.data() || {};
        var base = displayFromUser({
          fullName: p.displayName,
          displayName: p.displayName,
          photoURL: p.photoURL,
          avatarKey: p.avatarKey || "",
          university: p.university,
          faculty: p.faculty,
          department: p.department,
          level: p.level,
          bio: p.bio,
          username: p.username
        }, userId);
        try {
          var u = await db().collection("users").doc(userId).get();
          if (u.exists) {
            var ud = u.data() || {};
            base.xpPoints = typeof ud.xpPoints === "number" ? ud.xpPoints : base.xpPoints;
            base.rank = ud.rank || ud.rankLabel || base.rank;
            // Prefer live profile avatar over stale public mirror
            if (ud.avatarKey) base.avatarKey = ud.avatarKey;
            if (ud.photoURL) base.photoURL = ud.photoURL;
            else if (ud.avatarKey) base.photoURL = ""; // character only
            if (ud.fullName || ud.displayName) base.fullName = ud.fullName || ud.displayName;
            if (ud.username) base.username = ud.username;
          }
        } catch (e) {}
        return base;
      }
    } catch (e) {}
    try {
      var u2 = await db().collection("users").doc(userId).get();
      if (u2.exists) return displayFromUser(u2.data(), userId);
    } catch (e2) {}
    return displayFromUser({}, userId);
  }

  async function discoverPeople(opts) {
    opts = opts || {};
    var limit = opts.limit || 40;
    var q = (opts.query || "").trim().toLowerCase();
    var me = uid();
    var map = {};
    try {
      var pubSnap = await db().collection("public_profiles").limit(200).get();
      pubSnap.forEach(function (doc) {
        if (doc.id === me) return;
        map[doc.id] = displayFromUser({
          fullName: doc.data().displayName, photoURL: doc.data().photoURL,
          university: doc.data().university, faculty: doc.data().faculty,
          department: doc.data().department, level: doc.data().level, bio: doc.data().bio
        }, doc.id);
      });
    } catch (e) {}
    try {
      var userSnap = await db().collection("users").limit(200).get();
      userSnap.forEach(function (doc) {
        if (doc.id === me) return;
        var leg = displayFromUser(doc.data(), doc.id);
        if (map[doc.id]) {
          var cur = map[doc.id];
          map[doc.id] = {
            uid: doc.id,
            fullName: cur.fullName !== "Student" ? cur.fullName : leg.fullName,
            username: cur.username || leg.username,
            university: cur.university || leg.university,
            faculty: cur.faculty || leg.faculty,
            department: cur.department || leg.department,
            level: cur.level || leg.level,
            photoURL: cur.photoURL || leg.photoURL,
            bio: cur.bio || leg.bio,
            xpPoints: leg.xpPoints || cur.xpPoints,
            rank: leg.rank || cur.rank,
            incomplete: !(cur.university || leg.university)
          };
        } else map[doc.id] = leg;
      });
    } catch (e2) {}

    var blocked = await listBlockedIds();
    var list = Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (p) { return !blocked[p.uid]; });

    if (q) {
      list = list.filter(function (p) {
        return (p.fullName + " " + p.username + " " + p.university + " " + p.department + " " + p.faculty)
          .toLowerCase().indexOf(q) !== -1;
      });
    }

    var friendIds = {}, pendingOut = {}, pendingIn = {};
    try {
      if (me) {
        var fs = await db().collection("friendships").doc(me).collection("friends").get();
        fs.forEach(function (d) { friendIds[d.id] = true; });
        var out = await db().collection("friend_requests").where("from", "==", me).where("status", "==", "pending").limit(50).get();
        out.forEach(function (d) { pendingOut[d.data().to] = d.id; });
        var inn = await db().collection("friend_requests").where("to", "==", me).where("status", "==", "pending").limit(50).get();
        inn.forEach(function (d) { pendingIn[d.data().from] = d.id; });
      }
    } catch (e3) {}

    list.forEach(function (p) {
      if (friendIds[p.uid]) p.relation = "friends";
      else if (pendingOut[p.uid]) p.relation = "outgoing";
      else if (pendingIn[p.uid]) p.relation = "incoming";
      else p.relation = "none";
      p.requestId = pendingOut[p.uid] || pendingIn[p.uid] || null;
    });
    return list.slice(0, limit);
  }

  async function sendFriendRequest(toUid) {
    var me = uid();
    if (!me) throw new Error("Not signed in");
    if (!toUid || toUid === me) throw new Error("Invalid user");
    if (await isBlockedEither(toUid)) throw new Error("Cannot message this user");
    var id = me + "_" + toUid;
    var ref = db().collection("friend_requests").doc(id);
    try {
      var fr = await db().collection("friendships").doc(me).collection("friends").doc(toUid).get();
      if (fr.exists) throw new Error("Already friends");
    } catch (e) { if (e && e.message === "Already friends") throw e; }
    try {
      await ref.set({ from: me, to: toUid, status: "pending", createdAt: nowTs() });
    } catch (err) {
      if (err && err.code === "permission-denied") throw new Error("Request already sent or not allowed");
      throw err;
    }
    try {
      var myCard = null;
      try { myCard = await getUserCard(me); } catch (e0) {}
      var fromName = (myCard && (myCard.fullName || myCard.displayName || myCard.username)) || "Someone";
      await db().collection("notifications").doc(toUid).collection("items").add({
        type: "friend_request",
        from: me,
        message: fromName + " sent you a friend request. Open Chats → Requests to respond.",
        createdAt: nowTs(),
        read: false
      });
    } catch (e) {}
    return id;
  }

  
  async function markFriendRequestNotifsRead() {
    var me = uid();
    if (!me) return;
    try {
      var snap = await db().collection("notifications").doc(me).collection("items")
        .where("type", "==", "friend_request").limit(30).get();
      var batch = db().batch();
      var n = 0;
      snap.forEach(function (d) {
        var x = d.data() || {};
        if (!x.read) {
          batch.set(d.ref, { read: true, readAt: nowTs() }, { merge: true });
          n++;
        }
      });
      if (n) await batch.commit();
      try { if (window.refreshChatBadge) window.refreshChatBadge(); } catch (e) {}
    } catch (e) {}
  }

  async function respondFriendRequest(requestId, accept) {
    var me = uid();
    if (!me) throw new Error("Not signed in");
    var ref = db().collection("friend_requests").doc(requestId);
    var snap = await ref.get();
    if (!snap.exists) throw new Error("Request not found");
    var data = snap.data();
    if (data.to !== me) throw new Error("Not your request");
    if (data.status !== "pending") throw new Error("Already handled");
    if (!accept) {
      await ref.update({ status: "declined", resolvedAt: nowTs() });
      return;
    }
    var batch = db().batch();
    batch.update(ref, { status: "accepted", resolvedAt: nowTs() });
    batch.set(db().collection("friendships").doc(data.from).collection("friends").doc(data.to), { since: nowTs(), uid: data.to });
    batch.set(db().collection("friendships").doc(data.to).collection("friends").doc(data.from), { since: nowTs(), uid: data.from });
    await batch.commit();
    try {
      var myCard2 = null;
      try { myCard2 = await getUserCard(me); } catch (e1) {}
      var accName = (myCard2 && (myCard2.fullName || myCard2.displayName || myCard2.username)) || "Someone";
      await db().collection("notifications").doc(data.from).collection("items").add({
        type: "friend_accepted",
        from: me,
        createdAt: nowTs(),
        read: false,
        message: accName + " accepted your friend request."
      });
    } catch (e) {}
  }

  async function listFriendRequests() {
    var me = uid();
    if (!me) return [];
    var snap = await db().collection("friend_requests").where("to", "==", me).where("status", "==", "pending").limit(40).get();
    var out = [];
    for (var i = 0; i < snap.docs.length; i++) {
      var d = snap.docs[i];
      out.push({ id: d.id, from: d.data().from, card: await getUserCard(d.data().from), createdAt: d.data().createdAt });
    }
    return out;
  }

  async function listFriends() {
    var me = uid();
    if (!me) return [];
    var snap = await db().collection("friendships").doc(me).collection("friends").limit(100).get();
    var out = [];
    for (var i = 0; i < snap.docs.length; i++) out.push(await getUserCard(snap.docs[i].id));
    return out;
  }

  async function unfriend(otherUid) {
    var me = uid();
    if (!me || !otherUid) throw new Error("Invalid");
    var batch = db().batch();
    batch.delete(db().collection("friendships").doc(me).collection("friends").doc(otherUid));
    batch.delete(db().collection("friendships").doc(otherUid).collection("friends").doc(me));
    await batch.commit();
  }

  async function blockUser(otherUid) {
    var me = uid();
    if (!me || !otherUid || otherUid === me) throw new Error("Invalid");
    await db().collection("blocks").doc(me).collection("blocked").doc(otherUid).set({
      uid: otherUid, createdAt: nowTs()
    });
    try { await unfriend(otherUid); } catch (e) {}
  }

  async function unblockUser(otherUid) {
    var me = uid();
    if (!me || !otherUid) return;
    await db().collection("blocks").doc(me).collection("blocked").doc(otherUid).delete();
  }

  async function listBlockedIds() {
    var me = uid();
    var map = {};
    if (!me) return map;
    try {
      var snap = await db().collection("blocks").doc(me).collection("blocked").limit(200).get();
      snap.forEach(function (d) { map[d.id] = true; });
    } catch (e) {}
    return map;
  }

  async function isBlockedEither(otherUid) {
    var me = uid();
    if (!me || !otherUid) return false;
    try {
      var a = await db().collection("blocks").doc(me).collection("blocked").doc(otherUid).get();
      if (a.exists) return true;
      var b = await db().collection("blocks").doc(otherUid).collection("blocked").doc(me).get();
      if (b.exists) return true;
    } catch (e) {}
    return false;
  }

  async function ensureDm(otherUid) {
    var me = uid();
    if (!me || !otherUid) throw new Error("Invalid");
    if (await isBlockedEither(otherUid)) throw new Error("You cannot message this user");
    var id = dmId(me, otherUid);
    var ref = db().collection("conversations").doc(id);
    var parts = [me, otherUid].sort();
    try {
      await ref.set({
        type: "dm",
        participants: parts,
        createdAt: nowTs(),
        updatedAt: nowTs(),
        lastMessage: "",
        lastSender: ""
      }, { merge: true });
    } catch (err) {
      if (!(err && err.code === "permission-denied")) throw err;
      throw new Error("Could not open chat. Check conversations rules.");
    }
    return id;
  }

  async function listConversations() {
    var me = uid();
    if (!me) return [];
    var prefs = await getAllChatPrefs();
    var snap;
    try {
      snap = await db().collection("conversations").where("participants", "array-contains", me).orderBy("updatedAt", "desc").limit(50).get();
    } catch (err1) {
      try {
        snap = await db().collection("conversations").where("participants", "array-contains", me).limit(50).get();
      } catch (err2) {
        if (err2 && err2.code === "permission-denied") throw err2;
        return [];
      }
    }
    var out = [];
    for (var i = 0; i < snap.docs.length; i++) {
      var d = snap.docs[i];
      var data = d.data() || {};
      var pref = prefs[d.id] || {};
      if (pref.hidden) continue;
      var other = (data.participants || []).filter(function (x) { return x !== me; })[0];
      var card;
      if (data.type === "group") {
        var mc = (data.members || data.participants || []).length;
        var gName = data.name || "Group";
        var gPhoto = data.photoURL || "";
        try {
          var gdoc = await db().collection("groups").doc(d.id).get();
          if (gdoc.exists) {
            var gd = gdoc.data() || {};
            mc = (gd.members || []).length || mc;
            gName = gd.name || gName;
            gPhoto = gd.photoURL || gPhoto;
          }
        } catch (eG) {}
        card = { uid: d.id, fullName: gName, photoURL: gPhoto, university: mc + " members", isGroup: true };
      } else {
        card = await getUserCard(other);
      }
      out.push({
        id: d.id, type: data.type || "dm", card: card,
        lastMessage: data.lastMessage || "",
        lastSender: data.lastSender || "",
        lastSenderName: data.lastSenderName || "",
        updatedAt: data.updatedAt,
        unread: (function () {
          var u = data.unreadCount || data.unread || {};
          if (typeof u === "number") return Number(u) || 0;
          return Number(u[me] || 0) || 0;
        })(),
        muted: !!pref.muted
      });
    }
    // Ensure every group membership appears in Chats (even if conversation query lagged)
    try {
      var myGroups = await listMyGroups();
      var have = {};
      out.forEach(function (x) { have[x.id] = true; });
      for (var gi = 0; gi < myGroups.length; gi++) {
        var g = myGroups[gi];
        if (have[g.id]) continue;
        out.push({
          id: g.id,
          type: "group",
          card: {
            uid: g.id,
            fullName: g.name || "Group",
            photoURL: g.photoURL || "",
            university: ((g.members || []).length || 1) + " members",
            isGroup: true
          },
          lastMessage: "Open group",
          updatedAt: null,
          unread: 0,
          muted: false
        });
      }
    } catch (eMerge) {}
    out.sort(function (a, b) {
      var ta = a.updatedAt && a.updatedAt.toMillis ? a.updatedAt.toMillis() : 0;
      var tb = b.updatedAt && b.updatedAt.toMillis ? b.updatedAt.toMillis() : 0;
      return tb - ta;
    });
    return out;
  }

  function listenMessages(convId, onUpdate, opts) {
    opts = opts || {};
    var me = uid();
    return db().collection("conversations").doc(convId).collection("messages")
      .orderBy("createdAt", "asc").limitToLast(120)
      .onSnapshot(function (snap) {
        var msgs = [];
        var clearBefore = opts.clearBeforeMs || 0;
        snap.forEach(function (doc) {
          var m = doc.data() || {};
          if (m.deletedFor && m.deletedFor[me]) return;
          if (m.deleted === true && m.senderId !== me && !m.text) return;
          var t = m.createdAt && m.createdAt.toMillis ? m.createdAt.toMillis() : 0;
          if (clearBefore && t && t < clearBefore) return;
          msgs.push({
            id: doc.id,
            text: m.deleted ? "" : (m.text || ""),
            senderId: m.senderId,
            type: m.type || "text",
            mediaUrl: m.deleted ? null : (m.mediaUrl || null),
            mediaUrls: m.deleted ? null : (m.mediaUrls || null),
            mediaName: m.mediaName || null,
            replyTo: m.replyTo || null,
            replyText: m.replyText || null,
            edited: !!m.edited,
            deleted: !!m.deleted,
            pinned: !!m.pinned,
            createdAt: m.createdAt,
            readBy: m.readBy || [],
            deliveredTo: m.deliveredTo || []
          });
        });
        onUpdate(msgs);
      }, function (err) {
        console.warn("messages listen", err);
        onUpdate([]);
      });
  }

  async function sendMessage(convId, text, extra) {
    var me = uid();
    if (!me) throw new Error("Not signed in");
    extra = extra || {};
    text = String(text || "").trim();
    if (!text && !extra.mediaUrl && !(extra.mediaUrls && extra.mediaUrls.length)) throw new Error("Empty message");

    // block check for DM
    try {
      var conv = await db().collection("conversations").doc(convId).get();
      if (conv.exists) {
        var parts = conv.data().participants || [];
        var other = parts.filter(function (x) { return x !== me; })[0];
        if (other && await isBlockedEither(other)) throw new Error("You cannot message this user");
      }
    } catch (e) {
      if (e && e.message && e.message.indexOf("cannot message") !== -1) throw e;
    }

    var payload = {
      text: text,
      senderId: me,
      type: extra.type || "text",
      mediaUrl: extra.mediaUrl || null,
      mediaName: extra.mediaName || null,
      mediaUrls: extra.mediaUrls || null,
      replyTo: extra.replyTo || null,
      replyText: extra.replyText ? String(extra.replyText).slice(0, 200) : null,
      createdAt: nowTs(),
      readBy: [me],
      deliveredTo: [me],
      deleted: false,
      edited: false,
      pinned: false
    };
    await db().collection("conversations").doc(convId).collection("messages").add(payload);
    var preview = text;
    if (!preview) {
      if (extra.type === "images" && extra.mediaUrls) preview = extra.mediaUrls.length + " photos";
      else if (extra.type === "image") preview = "Photo";
      else if (extra.type === "video") preview = "Video";
      else if (extra.type === "audio") preview = "Voice note";
      else if (extra.type === "file") preview = "File";
      else preview = "Attachment";
    }
    var myName = "Someone";
    try {
      var meCard = await getUserCard(me);
      if (meCard && meCard.fullName) myName = meCard.fullName;
    } catch (eN) {}
    var convUpdate = {
      lastMessage: preview.slice(0, 120),
      lastSender: me,
      lastSenderName: myName,
      updatedAt: nowTs()
    };
    // WhatsApp-style missed-message state:
    // - DM: no unread badge when the recipient is online AND inside this exact chat.
    // - DM: otherwise increment that recipient's unread count.
    // - Groups: increment each other member's unread count.
    // Use a transaction so older conversations that stored unreadCount as a number
    // are safely upgraded to the per-user map instead of failing a nested-field write.
    var unreadTargets = [];
    try {
      var convSnap2 = await db().collection("conversations").doc(convId).get();
      var convData2 = convSnap2.exists ? (convSnap2.data() || {}) : {};
      var parts2 = convData2.participants || convData2.members || [];
      if (convData2.type === "dm" && parts2.length) {
        var recipient = parts2.filter(function (x) { return x && x !== me; })[0];
        if (recipient) {
          var ps = await db().collection("presence").doc(recipient).get();
          var pd = ps.exists ? (ps.data() || {}) : {};
          var recipientInThisChat = isEffectivelyOnline(pd) && pd.activeConversationId === convId;
          if (!recipientInThisChat) unreadTargets.push(recipient);
        }
      } else {
        parts2.forEach(function (p) { if (p && p !== me) unreadTargets.push(p); });
      }
    } catch (ePresence) {
      console.warn("unread presence check", ePresence);
    }

    var convRef = db().collection("conversations").doc(convId);
    await db().runTransaction(async function (tx) {
      var snap = await tx.get(convRef);
      var d = snap.exists ? (snap.data() || {}) : {};
      var rawUnread = d.unreadCount != null ? d.unreadCount : d.unread;
      var map = {};
      if (rawUnread && typeof rawUnread === "object" && !Array.isArray(rawUnread)) {
        Object.keys(rawUnread).forEach(function (k) { map[k] = Math.max(0, Number(rawUnread[k]) || 0); });
      } else if (typeof rawUnread === "number" && unreadTargets.length === 1) {
        // Legacy DM counter belongs to the only recipient we are updating.
        map[unreadTargets[0]] = Math.max(0, Number(rawUnread) || 0);
      }
      unreadTargets.forEach(function (target) { map[target] = (Number(map[target]) || 0) + 1; });
      var update = Object.assign({}, convUpdate, { unreadCount: map });
      tx.set(convRef, update, { merge: true });
    });
  }

  async function editMessage(convId, messageId, newText) {
    var me = uid();
    newText = String(newText || "").trim();
    if (!newText) throw new Error("Empty");
    var ref = db().collection("conversations").doc(convId).collection("messages").doc(messageId);
    var snap = await ref.get();
    if (!snap.exists) throw new Error("Not found");
    if (snap.data().senderId !== me) throw new Error("Not your message");
    await ref.update({ text: newText.slice(0, 4000), edited: true, editedAt: nowTs() });
  }

  async function deleteMessage(convId, messageId, forEveryone) {
    var me = uid();
    var ref = db().collection("conversations").doc(convId).collection("messages").doc(messageId);
    var snap = await ref.get();
    if (!snap.exists) return;
    var m = snap.data();
    if (forEveryone) {
      if (m.senderId !== me) throw new Error("Not your message");
      await ref.update({ deleted: true, text: "", mediaUrl: null, deletedAt: nowTs() });
    } else {
      var key = "deletedFor." + me;
      var o = {}; o[key] = true;
      await ref.update(o);
    }
  }

  async function clearConversationUnread(convId) {
    var me = uid();
    if (!me || !convId) return;
    try {
      var ref = db().collection("conversations").doc(convId);
      var snap = await ref.get();
      var data = snap.exists ? (snap.data() || {}) : {};
      var raw = data.unreadCount != null ? data.unreadCount : data.unread;
      var map = {};
      // Old builds stored a plain number — convert to per-uid map
      if (typeof raw === "number") {
        map[me] = 0;
      } else if (raw && typeof raw === "object") {
        Object.keys(raw).forEach(function (k) { map[k] = Number(raw[k]) || 0; });
        map[me] = 0;
      } else {
        map[me] = 0;
      }
      await ref.set({ unreadCount: map }, { merge: true });
    } catch (e) { console.warn("clear unread", e); }
  }

  async function markMessagesRead(convId, messageIds) {
    var me = uid();
    if (!me) return;
    // Always zero this user's unread for this thread when they open/read it
    await clearConversationUnread(convId);
    if (!messageIds || !messageIds.length) return;
    var col = db().collection("conversations").doc(convId).collection("messages");
    var batch = db().batch();
    var n = 0;
    for (var i = 0; i < messageIds.length && n < 40; i++) {
      batch.update(col.doc(messageIds[i]), {
        readBy: firebase.firestore.FieldValue.arrayUnion(me),
        deliveredTo: firebase.firestore.FieldValue.arrayUnion(me)
      });
      n++;
    }
    try { await batch.commit(); } catch (e) { console.warn("read receipts", e); }
  }

  async function setTyping(convId, isTyping) {
    var me = uid();
    if (!me || !convId) return;
    var ref = db().collection("typing").doc(convId).collection("uids").doc(me);
    try {
      if (isTyping) await ref.set({ uid: me, at: nowTs() }, { merge: true });
      else await ref.delete();
    } catch (e) {}
  }

  function listenTyping(convId, onUpdate) {
    var me = uid();
    return db().collection("typing").doc(convId).collection("uids")
      .onSnapshot(function (snap) {
        var names = [];
        snap.forEach(function (d) {
          if (d.id !== me) names.push(d.id);
        });
        onUpdate(names);
      }, function () { onUpdate([]); });
  }

  async function getChatPref(convId) {
    var me = uid();
    if (!me) return {};
    try {
      var s = await db().collection("chat_prefs").doc(me).collection("convs").doc(convId).get();
      return s.exists ? s.data() : {};
    } catch (e) { return {}; }
  }

  async function getAllChatPrefs() {
    var me = uid();
    var map = {};
    if (!me) return map;
    try {
      var s = await db().collection("chat_prefs").doc(me).collection("convs").limit(100).get();
      s.forEach(function (d) { map[d.id] = d.data(); });
    } catch (e) {}
    return map;
  }

  async function setChatPref(convId, patch) {
    var me = uid();
    if (!me) return;
    await db().collection("chat_prefs").doc(me).collection("convs").doc(convId).set(
      Object.assign({ updatedAt: nowTs() }, patch),
      { merge: true }
    );
  }

  async function muteChat(convId, muted) {
    await setChatPref(convId, { muted: !!muted });
  }

  async function clearChatForMe(convId) {
    await setChatPref(convId, { clearBeforeMs: Date.now(), hidden: false });
  }

  async function hideChatForMe(convId) {
    await setChatPref(convId, { hidden: true });
  }

  async function createGroup(name, opts) {
    var me = uid();
    if (!me) throw new Error("Not signed in");
    opts = opts || {};
    name = String(name || "").trim().slice(0, 60);
    if (!name) throw new Error("Group name required");
    var memberUids = opts.memberUids || [];
    var members = [me].concat(memberUids.filter(function (x) { return x && x !== me; }));
    members = members.filter(function (v, i, a) { return a.indexOf(v) === i; });
    var visibility = opts.visibility === "public" ? "public" : "private";
    var description = String(opts.description || "").trim().slice(0, 500);
    var photoURL = opts.photoURL || "";
    var ref = db().collection("groups").doc();
    var payload = {
      name: name,
      members: members,
      createdBy: me,
      visibility: visibility,
      description: description,
      photoURL: photoURL,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      lastMessage: "",
      type: "group"
    };
    try {
      await ref.set(payload);
    } catch (err) {
      console.error("groups.set", err);
      throw new Error((err && err.message) || "Could not create group (rules). Publish latest Firestore rules.");
    }
    try {
      await db().collection("conversations").doc(ref.id).set({
        type: "group",
        name: name,
        participants: members,
        members: members,
        visibility: visibility,
        description: description,
        photoURL: photoURL,
        createdAt: nowTs(),
        updatedAt: nowTs(),
        lastMessage: "Group created",
        lastSender: me
      });
    } catch (err2) {
      console.error("conversations.set group", err2);
      // Group doc exists; still open it — conversation mirror can be fixed later
      throw new Error((err2 && err2.message) || "Group saved but chat thread failed. Check conversations rules.");
    }
    return ref.id;
  }

  async function listMyGroups() {
    var me = uid();
    if (!me) return [];
    var out = [];
    try {
      var snap = await db().collection("groups").where("members", "array-contains", me).limit(40).get();
      snap.forEach(function (d) {
        var data = d.data() || {};
        out.push({
          id: d.id,
          name: data.name || "Group",
          photoURL: data.photoURL || "",
          description: data.description || "",
          visibility: data.visibility || "private",
          members: data.members || [],
          createdBy: data.createdBy,
          joined: true
        });
      });
    } catch (e) { console.warn("listMyGroups", e); }
    return out;
  }

  async function listPublicGroups() {
    var me = uid();
    var out = [];
    try {
      var snap = await db().collection("groups").where("visibility", "==", "public").limit(40).get();
      snap.forEach(function (d) {
        var data = d.data() || {};
        var members = data.members || [];
        if (me && members.indexOf(me) !== -1) return;
        out.push({
          id: d.id,
          name: data.name || "Group",
          photoURL: data.photoURL || "",
          description: data.description || "",
          visibility: "public",
          members: members,
          createdBy: data.createdBy,
          joined: false
        });
      });
    } catch (e) { console.warn("listPublicGroups", e); }
    return out;
  }

  async function requestJoinGroup(groupId) {
    var me = uid();
    if (!me || !groupId) throw new Error("Invalid");
    var gref = db().collection("groups").doc(groupId);
    var g = await gref.get();
    if (!g.exists) throw new Error("Group not found");
    var gd = g.data() || {};
    if (gd.visibility !== "public") throw new Error("This group is private");
    if ((gd.members || []).indexOf(me) !== -1) throw new Error("Already a member");
    var reqRef = gref.collection("join_requests").doc(me);
    var existing = await reqRef.get();
    if (existing.exists && existing.data().status === "pending") {
      return; // already requested — no error
    }
    await reqRef.set({
      from: me,
      status: "pending",
      groupId: groupId,
      groupName: gd.name || "Group",
      createdAt: nowTs()
    }, { merge: true });
    // Notify group creator + members (admins)
    var notifyUids = {};
    if (gd.createdBy) notifyUids[gd.createdBy] = true;
    (gd.members || []).forEach(function (m) { notifyUids[m] = true; });
    delete notifyUids[me];
    var myCard = await getUserCard(me);
    var who = (myCard && myCard.fullName) || "A student";
    Object.keys(notifyUids).forEach(function (to) {
      db().collection("notifications").doc(to).collection("items").add({
        type: "group_join_request",
        from: me,
        groupId: groupId,
        groupName: gd.name || "Group",
        message: who + " requested to join " + (gd.name || "your group"),
        createdAt: nowTs(),
        read: false
      }).catch(function () {});
    });
  }

  async function inviteToGroup(groupId, friendUids) {
    var me = uid();
    if (!me || !groupId) throw new Error("Invalid");
    friendUids = (friendUids || []).filter(function (x) { return x && x !== me; });
    if (!friendUids.length) return;
    var g = await db().collection("groups").doc(groupId).get();
    if (!g.exists) throw new Error("Group not found");
    var gd = g.data() || {};
    if ((gd.members || []).indexOf(me) === -1) throw new Error("Only members can invite");
    var myCard = await getUserCard(me);
    var who = (myCard && myCard.fullName) || "A friend";
    for (var i = 0; i < friendUids.length; i++) {
      var fid = friendUids[i];
      if ((gd.members || []).indexOf(fid) !== -1) continue;
      await db().collection("groups").doc(groupId).collection("join_requests").doc(fid).set({
        from: fid,
        invitedBy: me,
        status: "invited",
        groupId: groupId,
        groupName: gd.name || "Group",
        createdAt: nowTs()
      }, { merge: true });
      try {
        await db().collection("notifications").doc(fid).collection("items").add({
          type: "group_invite",
          from: me,
          groupId: groupId,
          groupName: gd.name || "Group",
          message: who + " invited you to join " + (gd.name || "a group"),
          createdAt: nowTs(),
          read: false
        });
      } catch (e) {}
    }
  }

  async function listMyGroupInvites() {
    var me = uid();
    if (!me) return [];
    // Invitations / pending join where from==me and status invited|pending is inverse —
    // invites are stored under join_requests/{inviteeUid}
    // Query across groups is expensive; use notifications type group_invite instead for UI.
    // Also list join_requests on groups where user is member for admin review.
    return [];
  }

  async function listIncomingGroupRequests() {
    // For groups I admin: pending join requests
    var me = uid();
    if (!me) return [];
    var out = [];
    try {
      var mine = await db().collection("groups").where("members", "array-contains", me).limit(20).get();
      for (var i = 0; i < mine.docs.length; i++) {
        var g = mine.docs[i];
        var reqs = await g.ref.collection("join_requests").where("status", "==", "pending").limit(20).get();
        for (var j = 0; j < reqs.docs.length; j++) {
          var r = reqs.docs[j];
          var rd = r.data() || {};
          var fromUid = rd.from || r.id;
          // Never show my own join request to myself
          if (fromUid === me) continue;
          out.push({
            id: r.id,
            groupId: g.id,
            groupName: (g.data() || {}).name || "Group",
            from: fromUid,
            card: await getUserCard(fromUid),
            createdAt: rd.createdAt
          });
        }
      }
    } catch (e) { console.warn("listIncomingGroupRequests", e); }
    // Invites sent TO me
    try {
      var pub = await db().collection("groups").where("visibility", "==", "public").limit(40).get();
      // also scan my groups invites - better: notifications
    } catch (e2) {}
    return out;
  }

  async function listInvitesForMe() {
    var me = uid();
    if (!me) return [];
    var out = [];
    var seen = {};
    try {
      var snap;
      try {
        snap = await db().collection("notifications").doc(me).collection("items")
          .where("type", "==", "group_invite").limit(40).get();
      } catch (eIdx) {
        snap = await db().collection("notifications").doc(me).collection("items").limit(50).get();
      }
      for (var i = 0; i < snap.docs.length; i++) {
        var d = snap.docs[i];
        var x = d.data() || {};
        if (x.type && x.type !== "group_invite") continue;
        if (!x.groupId) continue;
        if (x.read === true || x.resolved === true || x.status === "accepted" || x.status === "declined") continue;
        if (seen[x.groupId]) continue;
        // Skip if already a member or invite no longer active
        try {
          var g = await db().collection("groups").doc(x.groupId).get();
          if (g.exists) {
            var members = (g.data() || {}).members || [];
            if (members.indexOf(me) !== -1) {
              // already joined — mark notif resolved quietly
              try {
                await d.ref.set({ read: true, resolved: true, status: "accepted" }, { merge: true });
              } catch (eM) {}
              continue;
            }
          }
          var req = await db().collection("groups").doc(x.groupId).collection("join_requests").doc(me).get();
          if (req.exists) {
            var st = (req.data() || {}).status || "";
            if (st === "accepted" || st === "declined") {
              try {
                await d.ref.set({ read: true, resolved: true, status: st }, { merge: true });
              } catch (eR) {}
              continue;
            }
            if (st && st !== "invited" && st !== "pending") continue;
          } else {
            // no join_request left — invite is gone
            try {
              await d.ref.set({ read: true, resolved: true, status: "expired" }, { merge: true });
            } catch (eE) {}
            continue;
          }
        } catch (eCheck) {
          // keep showing if check fails
        }
        seen[x.groupId] = true;
        out.push({
          id: d.id,
          groupId: x.groupId,
          groupName: x.groupName || "Group",
          from: x.from,
          type: "group_invite",
          message: x.message
        });
      }
    } catch (e) {
      console.warn("listInvitesForMe", e);
    }
    return out;
  }

  async function declineGroupInvite(groupId) {
    var me = uid();
    if (!me || !groupId) throw new Error("Invalid");
    try {
      await db().collection("groups").doc(groupId).collection("join_requests").doc(me).set({
        status: "declined",
        resolvedAt: nowTs()
      }, { merge: true });
    } catch (e) {
      console.warn("decline join_request", e);
    }
    // Mark related notifications resolved
    try {
      var snap = await db().collection("notifications").doc(me).collection("items")
        .where("type", "==", "group_invite").limit(30).get();
      var batch = db().batch();
      var n = 0;
      snap.forEach(function (d) {
        var x = d.data() || {};
        if (x.groupId === groupId) {
          batch.set(d.ref, { read: true, resolved: true, status: "declined" }, { merge: true });
          n++;
        }
      });
      if (n) await batch.commit();
    } catch (e2) {
      // fallback: scan recent
      try {
        var all = await db().collection("notifications").doc(me).collection("items").limit(40).get();
        for (var i = 0; i < all.docs.length; i++) {
          var dd = all.docs[i];
          var xx = dd.data() || {};
          if (xx.type === "group_invite" && xx.groupId === groupId) {
            await dd.ref.set({ read: true, resolved: true, status: "declined" }, { merge: true });
          }
        }
      } catch (e3) {}
    }
  }

  async function clearInviteNotifications(groupId) {
    var me = uid();
    if (!me || !groupId) return;
    try {
      var snap = await db().collection("notifications").doc(me).collection("items").limit(50).get();
      for (var i = 0; i < snap.docs.length; i++) {
        var d = snap.docs[i];
        var x = d.data() || {};
        if (x.type === "group_invite" && x.groupId === groupId) {
          await d.ref.set({ read: true, resolved: true, status: "accepted" }, { merge: true });
        }
      }
    } catch (e) {}
  }

  async function getGroupMemberCount(groupId) {
    try {
      var g = await db().collection("groups").doc(groupId).get();
      if (!g.exists) return 0;
      return ((g.data() || {}).members || []).length;
    } catch (e) {
      return 0;
    }
  }

  /** { online, total, createdBy } using presence TTL */
  async function getGroupPresenceStats(groupId) {
    var out = { online: 0, total: 0, createdBy: null, members: [] };
    try {
      var g = await db().collection("groups").doc(groupId).get();
      if (!g.exists) return out;
      var gd = g.data() || {};
      var members = gd.members || [];
      out.total = members.length;
      out.createdBy = gd.createdBy || null;
      out.members = members;
      var checks = members.map(function (mid) {
        return db().collection("presence").doc(mid).get().then(function (ps) {
          if (!ps.exists) return false;
          return isEffectivelyOnline(ps.data() || {});
        }).catch(function () { return false; });
      });
      var flags = await Promise.all(checks);
      out.online = flags.filter(Boolean).length;
    } catch (e) { console.warn("group presence", e); }
    return out;
  }

  /** Creator-only hard delete of group + conversation mirror */
  async function deleteGroup(groupId) {
    var me = uid();
    if (!me || !groupId) throw new Error("Invalid");
    var gref = db().collection("groups").doc(groupId);
    var g = await gref.get();
    if (!g.exists) throw new Error("Group not found");
    var gd = g.data() || {};
    if (gd.createdBy !== me) throw new Error("Only the group creator can delete this group");
    try {
      await db().collection("conversations").doc(groupId).delete();
    } catch (e1) {
      console.warn("conv delete", e1);
      // still remove group so it disappears from lists
    }
    await gref.delete();
    return true;
  }


  async function acceptGroupInvite(groupId) {
    var me = uid();
    if (!me || !groupId) throw new Error("Invalid invite");
    var gref = db().collection("groups").doc(groupId);
    var gd = {};
    try {
      var g = await gref.get();
      if (!g.exists) throw new Error("Group not found");
      gd = g.data() || {};
    } catch (e) {
      console.error("acceptGroupInvite read group", e);
      throw new Error(
        "Cannot open this group yet. Publish the latest Firestore rules (group read for invitees), then try Join again."
      );
    }
    if ((gd.members || []).indexOf(me) !== -1) {
      try { await clearInviteNotifications(groupId); } catch (e0) {}
      return groupId;
    }

    var st = "";
    try {
      var req = await gref.collection("join_requests").doc(me).get();
      if (!req.exists) throw new Error("No invite found for you");
      st = (req.data() || {}).status || "";
    } catch (e2) {
      console.error("acceptGroupInvite read request", e2);
      throw new Error("Cannot read invite. Publish latest Firestore rules, then try again.");
    }
    if (st !== "invited") {
      throw new Error(
        st === "pending"
          ? "This is a join request — a group member must Accept it (you cannot Join yourself)."
          : "This invite is no longer active (" + st + ")."
      );
    }

    try {
      await gref.update({
        members: firebase.firestore.FieldValue.arrayUnion(me),
        updatedAt: nowTs()
      });
    } catch (e3) {
      console.error("acceptGroupInvite update group", e3);
      throw new Error(
        "Join blocked by group rules. In Firebase → Firestore → Rules, paste firestore-rules-PASTE-THIS.txt and click Publish, then hard-refresh."
      );
    }

    try {
      await ensureGroupConversation(groupId, gd, me);
    } catch (e4) {
      console.warn("acceptGroupInvite conv (non-fatal)", e4);
    }

    try {
      await gref.collection("join_requests").doc(me).set({
        status: "accepted",
        resolvedAt: nowTs()
      }, { merge: true });
    } catch (e5) {
      console.warn("acceptGroupInvite resolve", e5);
    }
    try { await clearInviteNotifications(groupId); } catch (e6) {}
    return groupId;
  }

  async function ensureGroupConversation(groupId, gd, newUid) {
    // Always re-read group so members list includes the new joiner
    var fresh = gd || {};
    try {
      var g2 = await db().collection("groups").doc(groupId).get();
      if (g2.exists) fresh = g2.data() || fresh;
    } catch (e) {}
    var members = (fresh.members || []).slice();
    if (newUid && members.indexOf(newUid) === -1) members.push(newUid);

    var cref = db().collection("conversations").doc(groupId);
    var payload = {
      type: "group",
      name: fresh.name || (gd && gd.name) || "Group",
      participants: members,
      members: members,
      createdBy: fresh.createdBy || (gd && gd.createdBy) || newUid,
      photoURL: fresh.photoURL || (gd && gd.photoURL) || "",
      updatedAt: nowTs(),
      lastMessage: fresh.lastMessage || ""
    };
    // set+merge avoids update-only permission traps and keeps participants in sync
    await cref.set(payload, { merge: true });
  }

  async function acceptJoinGroup(groupId, fromUid) {
    var me = uid();
    if (!me) throw new Error("Not signed in");
    if (!fromUid) throw new Error("Missing requester id");
    var gref = db().collection("groups").doc(groupId);
    var data = {};
    try {
      var g = await gref.get();
      if (!g.exists) throw new Error("Group not found");
      data = g.data() || {};
    } catch (e) {
      console.error("acceptJoinGroup read", e);
      throw new Error("Cannot read group. Publish latest Firestore rules.");
    }
    if (data.createdBy !== me && (data.members || []).indexOf(me) === -1) {
      throw new Error("Only group members can accept join requests");
    }
    try {
      await gref.update({
        members: firebase.firestore.FieldValue.arrayUnion(fromUid),
        updatedAt: nowTs()
      });
    } catch (e2) {
      console.error("acceptJoinGroup update", e2);
      throw new Error(
        "Accept blocked by group rules. Publish firestore-rules-PASTE-THIS.txt in Firebase, then hard-refresh."
      );
    }
    try {
      await ensureGroupConversation(groupId, data, fromUid);
    } catch (e3) {
      console.warn("acceptJoinGroup conv", e3);
    }
    try {
      await gref.collection("join_requests").doc(fromUid).set({
        status: "accepted",
        resolvedAt: nowTs(),
        resolvedBy: me
      }, { merge: true });
    } catch (e4) {
      console.warn("acceptJoinGroup resolve", e4);
    }
    try {
      await db().collection("notifications").doc(fromUid).collection("items").add({
        type: "group_join_accepted",
        groupId: groupId,
        groupName: data.name || "Group",
        from: me,
        message: "Your request to join " + (data.name || "the group") + " was accepted",
        createdAt: nowTs(),
        read: false
      });
    } catch (e5) {}
    return groupId;
  }

  async function countFriends() {
    var me = uid();
    if (!me) return 0;
    try {
      var snap = await db().collection("friendships").doc(me).collection("friends").limit(500).get();
      return snap.size;
    } catch (e) {
      console.warn("countFriends", e);
      return 0;
    }
  }

    var PRESENCE_TTL_MS = 70 * 1000; // 70s without heartbeat = offline
  var activeConversationId = null; // set only while the user is inside a conversation

  function presenceMillis(lastSeen) {
    if (!lastSeen) return 0;
    if (typeof lastSeen.toMillis === "function") return lastSeen.toMillis();
    if (typeof lastSeen.seconds === "number") return lastSeen.seconds * 1000;
    var n = Number(lastSeen);
    return isNaN(n) ? 0 : n;
  }

  function isEffectivelyOnline(p) {
    if (!p || p.state === "offline") return false;
    if (p.state !== "online") return false;
    var ms = presenceMillis(p.lastSeen);
    if (!ms) return false;
    return (Date.now() - ms) < PRESENCE_TTL_MS;
  }

  async function touchPresence() {
    var me = uid();
    if (!me) return;
    try {
      await db().collection("presence").doc(me).set({
        state: "online",
        lastSeen: nowTs(),
        uid: me,
        activeConversationId: activeConversationId || null
      }, { merge: true });
    } catch (e) {}
  }

  async function setPresenceOffline() {
    var me = uid();
    if (!me) return;
    try {
      await db().collection("presence").doc(me).set({
        state: "offline",
        lastSeen: nowTs(),
        uid: me,
        activeConversationId: null
      }, { merge: true });
    } catch (e) {}
  }

  async function setActiveConversation(convId) {
    activeConversationId = convId || null;
    try { await touchPresence(); } catch (e) {}
  }

  function getActiveConversation() { return activeConversationId; }

  function listenPresence(userId, onUpdate) {
    if (!userId) return function () {};
    var unsub = db().collection("presence").doc(userId).onSnapshot(function (s) {
      if (!s.exists) { onUpdate({ state: "offline", lastSeen: null, online: false }); return; }
      var d = s.data() || {};
      var p = { state: d.state || "offline", lastSeen: d.lastSeen || null };
      p.online = isEffectivelyOnline(p);
      if (!p.online) p.state = "offline";
      onUpdate(p);
    }, function () { onUpdate({ state: "offline", lastSeen: null, online: false }); });
    // Re-check TTL every 20s so green ring drops without a new snapshot
    var timer = setInterval(function () {
      db().collection("presence").doc(userId).get().then(function (s) {
        if (!s.exists) { onUpdate({ state: "offline", lastSeen: null, online: false }); return; }
        var d = s.data() || {};
        var p = { state: d.state || "offline", lastSeen: d.lastSeen || null };
        p.online = isEffectivelyOnline(p);
        if (!p.online) p.state = "offline";
        onUpdate(p);
      }).catch(function () {});
    }, 20000);
    return function () {
      try { unsub(); } catch (e) {}
      clearInterval(timer);
    };
  }

  /** Upload via CodexMedia / Cloudinary if available */
  async function uploadChatFile(file) {
    if (global.CodexMedia && typeof global.CodexMedia.uploadToCloudinary === "function") {
      return global.CodexMedia.uploadToCloudinary(file, { folder: "codex_hub/chat" });
    }
    if (typeof global.uploadToCloudinary === "function") {
      return global.uploadToCloudinary(file, { folder: "codex_hub/chat" });
    }
    // media.js attaches on window via IIFE — try CodexMedia patterns
    throw new Error("Upload helper not loaded");
  }

  global.CodexChat = {
    dmId: dmId,
    getUserCard: getUserCard,
    discoverPeople: discoverPeople,
    sendFriendRequest: sendFriendRequest,
    respondFriendRequest: respondFriendRequest,
    markFriendRequestNotifsRead: markFriendRequestNotifsRead,
    listFriendRequests: listFriendRequests,
    listFriends: listFriends,
    unfriend: unfriend,
    blockUser: blockUser,
    unblockUser: unblockUser,
    listBlockedIds: listBlockedIds,
    isBlockedEither: isBlockedEither,
    ensureDm: ensureDm,
    listConversations: listConversations,
    listenMessages: listenMessages,
    sendMessage: sendMessage,
    editMessage: editMessage,
    deleteMessage: deleteMessage,
    markMessagesRead: markMessagesRead,
    clearConversationUnread: clearConversationUnread,
    setTyping: setTyping,
    listenTyping: listenTyping,
    getChatPref: getChatPref,
    muteChat: muteChat,
    clearChatForMe: clearChatForMe,
    hideChatForMe: hideChatForMe,
    createGroup: createGroup,
    listMyGroups: listMyGroups,
    listPublicGroups: listPublicGroups,
    requestJoinGroup: requestJoinGroup,
    inviteToGroup: inviteToGroup,
    listIncomingGroupRequests: listIncomingGroupRequests,
    listInvitesForMe: listInvitesForMe,
    acceptGroupInvite: acceptGroupInvite,
    declineGroupInvite: declineGroupInvite,
    clearInviteNotifications: clearInviteNotifications,
    getGroupMemberCount: getGroupMemberCount,
    getGroupPresenceStats: getGroupPresenceStats,
    deleteGroup: deleteGroup,
    acceptJoinGroup: acceptJoinGroup,
    countFriends: countFriends,
    touchPresence: touchPresence,
    setPresenceOffline: setPresenceOffline,
    setActiveConversation: setActiveConversation,
    getActiveConversation: getActiveConversation,
    isEffectivelyOnline: isEffectivelyOnline,
    listenPresence: listenPresence,
    uploadChatFile: uploadChatFile
  };
})(window);
