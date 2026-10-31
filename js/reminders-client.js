/**
 * CodexReminders (Phase 4) - daily study reminders for Codex Hub Prime.
 *
 * Data model: users/{uid}/reminders/{id}
 *   { type, time:"HH:MM", days:[0..6] (empty = every day), enabled,
 *     tz, nextAtMs, nextAtKey, lastFiredKey, lastSentAt, updatedAt }
 *
 * Time zone handling: the student's own device computes the absolute next
 * occurrence (nextAtMs) in their local time, so the server never has to guess a
 * timezone - it only compares numbers.
 *
 * FCM: enabling notifications reuses the existing CodexPush token registration
 * (token saved on users/{uid}.fcmTokens via push-client.js). Nothing here touches
 * Admin credentials or other users' documents.
 */
(function (w) {
  "use strict";

  var TYPES = [
    { id: "study", label: "Study session" },
    { id: "revision", label: "Revision session" },
    { id: "deadline", label: "Assignment deadline" },
    { id: "task", label: "Task reminder" }
  ];
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var state = { uid: null, list: [], timer: null, wired: false, syncNote: "" };

  function db() { return firebase.firestore(); }
  function col() { return db().collection("users").doc(state.uid).collection("reminders"); }
  function tz() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos"; }
    catch (e) { return "Africa/Lagos"; }
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function labelFor(type) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === type) return TYPES[i].label;
    return "Reminder";
  }
  function stamp(d) {
    return d ? d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "T" + pad(d.getHours()) + ":" + pad(d.getMinutes()) : "";
  }

  /** Next future occurrence of HH:MM on the allowed weekdays, local time. */
  function nextOccurrence(time, days) {
    var parts = String(time || "08:00").split(":");
    var h = parseInt(parts[0], 10) || 0;
    var m = parseInt(parts[1], 10) || 0;
    var now = new Date();
    var allowed = (days && days.length) ? days : [0, 1, 2, 3, 4, 5, 6];
    for (var i = 0; i < 8; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h, m, 0, 0);
      if (d.getTime() <= now.getTime() + 500) continue;
      if (allowed.indexOf(d.getDay()) > -1) return d;
    }
    return null;
  }

  function describeDays(days) {
    if (!days || !days.length || days.length === 7) return "Every day";
    return days.slice().sort().map(function (d) { return DAYS[d]; }).join(", ");
  }

  function hasPermission() {
    return typeof Notification !== "undefined" && Notification.permission === "granted";
  }

  async function load() {
    var snap = await col().get();
    state.list = [];
    snap.forEach(function (doc) {
      var d = doc.data() || {};
      state.list.push({
        id: doc.id,
        type: d.type || "study",
        time: d.time || "19:00",
        days: Array.isArray(d.days) ? d.days : [],
        enabled: d.enabled !== false,
        nextAtMs: d.nextAtMs || 0,
        nextAtKey: d.nextAtKey || "",
        lastFiredKey: d.lastFiredKey || ""
      });
    });
    state.list.sort(function (a, b) { return String(a.time).localeCompare(String(b.time)); });
    return state.list;
  }

  function scheduleFields(rem) {
    var next = nextOccurrence(rem.time, rem.days);
    return {
      nextAtMs: next ? next.getTime() : 0,
      nextAtKey: stamp(next)
    };
  }

  async function save(rem) {
    if (!state.uid) throw new Error("Not signed in");
    var payload = Object.assign({
      type: rem.type || "study",
      time: rem.time || "19:00",
      days: Array.isArray(rem.days) ? rem.days : [],
      enabled: rem.enabled !== false,
      tz: tz(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, scheduleFields(rem));
    payload.timezoneOffset = new Date().getTimezoneOffset();
    if (rem.id) {
      await col().doc(rem.id).set(payload, { merge: true });
      rem.id = rem.id;
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      payload.lastFiredKey = "";
      var ref = await col().add(payload);
      rem.id = ref.id;
    }
    Object.assign(rem, payload);
    await syncToBackend();
    return rem;
  }

  async function setEnabled(id, on) {
    await col().doc(id).set({ enabled: !!on, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await syncToBackend();
  }

  async function remove(id) {
    await col().doc(id).delete();
    await syncToBackend();
  }

  /** Optional: push the schedule to the reminder service if it is deployed. */
  async function syncToBackend() {
    var base = String(w.CODEX_API_BASE || "").replace(/\/$/, "");
    if (!base || !firebase.auth().currentUser) return;
    try {
      var idToken = await firebase.auth().currentUser.getIdToken();
      var res = await fetch(base + "/reminders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + idToken },
        body: JSON.stringify({ timezone: tz(), reminders: state.list.map(function (r) {
          return { id: r.id, type: r.type, time: r.time, days: r.days, enabled: r.enabled, nextAtMs: r.nextAtMs || 0 };
        }) })
      });
      if (res.status === 404) {
        state.syncNote = "Background delivery starts after the reminder service is deployed.";
      } else if (res.ok) {
        state.syncNote = "";
      }
    } catch (e) {
      state.syncNote = "Saved. Background delivery retries when you're back online.";
    }
    renderHint();
  }

  async function enableNotifications() {
    if (!w.CodexPush || !w.CodexPush.registerAndSaveToken) {
      throw new Error("Push client not loaded on this page.");
    }
    await w.CodexPush.registerAndSaveToken();
    return true;
  }

  async function disableNotifications() {
    if (w.CodexPush && w.CodexPush.disablePush) await w.CodexPush.disablePush();
  }

  /** While the app is open, fire due reminders locally through the service worker. */
  function fireLocal(rem) {
    var body = "It's " + rem.time + " - " + labelFor(rem.type).toLowerCase() + ". Open Codex Hub to start.";
    if (!hasPermission() || !navigator.serviceWorker) return Promise.resolve();
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.showNotification("Codex Hub | " + labelFor(rem.type), {
        body: body,
        icon: "/assets/icons/icon-192.png",
        badge: "/assets/icons/icon-192.png",
        tag: "reminder-" + rem.id,
        renotify: true,
        vibrate: [80, 40, 80],
        data: { url: "/settings" }
      });
    }).catch(function () {});
  }

  async function tick() {
    if (!state.uid || !state.list.length) return;
    var now = Date.now();
    var changed = false;
    for (var i = 0; i < state.list.length; i++) {
      var r = state.list[i];
      if (!r.enabled || !r.nextAtMs) continue;
      if (r.nextAtMs > now) continue;
      var dueKey = r.nextAtKey;
      if (r.lastFiredKey === dueKey) continue;

      await fireLocal(r);
      var next = nextOccurrence(r.time, r.days);
      var patch = {
        lastFiredKey: dueKey,
        lastSentAt: firebase.firestore.FieldValue.serverTimestamp(),
        nextAtMs: next ? next.getTime() : 0,
        nextAtKey: stamp(next)
      };
      try { await col().doc(r.id).set(patch, { merge: true }); } catch (e) {}
      r.lastFiredKey = dueKey;
      r.nextAtMs = patch.nextAtMs;
      r.nextAtKey = patch.nextAtKey;
      changed = true;
    }
    if (changed) render();
  }

  function startTicker() {
    if (state.timer) return;
    state.timer = setInterval(function () { tick().catch(function () {}); }, 30000);
  }

  /* ---------------- UI ---------------- */
  function el(id) { return document.getElementById(id); }

  function renderHint() {
    var hint = el("remHint");
    if (!hint) return;
    var msg = "";
    if (typeof Notification !== "undefined" && Notification.permission === "denied") {
      msg = "Notifications are blocked in this browser. Reminders stay saved but cannot be delivered until you allow notifications for Codex Hub in your browser settings.";
    } else if (!hasPermission()) {
      msg = "Notifications are off. Turn them on to receive reminders when Codex Hub is closed.";
    } else if (state.syncNote) {
      msg = state.syncNote;
    }
    hint.textContent = msg;
    hint.hidden = !msg;
  }

  function render() {
    var host = el("reminderList");
    if (!host) return;
    if (!state.list.length) {
      host.innerHTML = '<div class="rem-empty">No daily reminders yet. Pick a time and add one below.</div>';
      renderHint();
      return;
    }
    host.innerHTML = state.list.map(function (r) {
      var next = r.nextAtMs ? new Date(r.nextAtMs) : null;
      var when = next ? next.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "not scheduled";
      return '<div class="rem-row">' +
        '<div class="rem-main"><strong>' + r.time + " &middot; " + labelFor(r.type) + "</strong>" +
        "<span>" + describeDays(r.days) + " &middot; next: " + when + "</span></div>" +
        '<button type="button" class="rem-toggle' + (r.enabled ? " on" : "") + '" data-rem-toggle="' + r.id +
        '" aria-pressed="' + (r.enabled ? "true" : "false") + '" aria-label="Toggle reminder"><i></i></button>' +
        '<button type="button" class="rem-del" data-rem-del="' + r.id + '" aria-label="Delete reminder">&times;</button>' +
        "</div>";
    }).join("");
    renderHint();
  }

  function currentForm() {
    var type = el("remType") ? el("remType").value : "study";
    var time = el("remTime") && el("remTime").value ? el("remTime").value : "19:00";
    var days = [];
    if (el("remDays")) {
      el("remDays").querySelectorAll("[data-day]").forEach(function (b) {
        if (b.getAttribute("aria-pressed") === "true") days.push(parseInt(b.getAttribute("data-day"), 10));
      });
    }
    return { type: type, time: time, days: days, enabled: true };
  }

  function wire() {
    if (state.wired) return;
    state.wired = true;

    var add = el("remAdd");
    if (add) add.onclick = async function () {
      add.disabled = true;
      try {
        var rem = currentForm();
        await save(rem);
        await load();
        render();
        toastSafe("Reminder saved for " + rem.time);
      } catch (e) {
        toastSafe(e.message || "Could not save reminder");
      } finally {
        add.disabled = false;
      }
    };

    var daysBox = el("remDays");
    if (daysBox) daysBox.addEventListener("click", function (e) {
      var b = e.target.closest("[data-day]");
      if (!b) return;
      var on = b.getAttribute("aria-pressed") === "true";
      b.setAttribute("aria-pressed", on ? "false" : "true");
      b.classList.toggle("on", !on);
    });

    var master = el("remMaster");
    if (master) master.onclick = async function () {
      master.disabled = true;
      try {
        if (hasPermission()) {
          await disableNotifications();
          master.classList.remove("on");
          master.setAttribute("aria-pressed", "false");
          toastSafe("Reminders paused");
        } else {
          await enableNotifications();
          master.classList.add("on");
          master.setAttribute("aria-pressed", "true");
          toastSafe("Notifications on - reminders will arrive on this device");
        }
      } catch (e) {
        toastSafe(e.message || "Could not change notification setting");
      } finally {
        master.disabled = false;
        renderHint();
      }
    };

    var host = el("reminderList");
    if (host) host.addEventListener("click", async function (e) {
      var t = e.target.closest("[data-rem-toggle]");
      if (t) {
        var id = t.getAttribute("data-rem-toggle");
        var cur = state.list.filter(function (r) { return r.id === id; })[0];
        if (!cur) return;
        try {
          await setEnabled(id, !cur.enabled);
          await load();
          render();
        } catch (err) { toastSafe("Could not update reminder"); }
        return;
      }
      var d = e.target.closest("[data-rem-del]");
      if (d) {
        var rid = d.getAttribute("data-rem-del");
        try {
          await remove(rid);
          await load();
          render();
          toastSafe("Reminder removed");
        } catch (err) { toastSafe("Could not remove reminder"); }
      }
    });
  }

  function toastSafe(msg) {
    try { if (w.CodexShell && w.CodexShell.toast) return w.CodexShell.toast(msg); } catch (e) {}
    try { if (typeof w.toast === "function") return w.toast(msg); } catch (e) {}
    console.log("[reminders]", msg);
  }

  async function mountUI() {
    if (!el("reminderList")) return;
    wire();
    try {
      var res = await w.CodexAuth.requireUser();
      state.uid = res.user.uid;
      var master = el("remMaster");
      if (master && hasPermission()) {
        master.classList.add("on");
        master.setAttribute("aria-pressed", "true");
      }
      await load();
      if (!state.list.length) {
        // First run: a sensible default daily study reminder the student can edit or delete.
        await save({ type: "study", time: "19:00", days: [], enabled: true });
        await load();
      }
      render();
      startTicker();
      tick().catch(function () {});
    } catch (e) {
      var host = el("reminderList");
      if (host) host.innerHTML = '<div class="rem-empty">Could not load reminders. ' + (e.message || "") + "</div>";
    }
  }

  w.CodexReminders = {
    TYPES: TYPES,
    mountUI: mountUI,
    load: load,
    save: save,
    remove: remove,
    setEnabled: setEnabled,
    enableNotifications: enableNotifications,
    disableNotifications: disableNotifications,
    nextOccurrence: nextOccurrence,
    _state: state
  };
})(window);
