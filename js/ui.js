/* UI helpers: escaping, formatting, toast, modal, avatars. */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // paise (integer) -> "₹1,234.56"
  function fmtINR(minor) {
    var n = (Number(minor) || 0) / 100;
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // "1,234.56" / "1234" rupees string -> integer paise, or null if invalid
  function toPaise(str) {
    if (str == null) return null;
    var t = String(str).trim().replace(/,/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    var p = Math.round(parseFloat(t) * 100);
    return p > 0 ? p : null;
  }

  function timeAgo(ts) {
    var s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'just now';
    var m = Math.floor(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    var d = Math.floor(h / 24);
    if (d < 30) return d + 'd ago';
    return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function avatar(profile, size) {
    size = size || 40;
    var color = (profile && profile.avatar_color) || '#6366f1';
    var name = (profile && profile.display_name) || '?';
    return '<span class="avatar" style="width:' + size + 'px;height:' + size +
      'px;background:' + esc(color) + ';font-size:' + Math.round(size * 0.38) +
      'px">' + esc(initials(name)) + '</span>';
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2600);
  }

  function openModal(html) {
    var ov = document.getElementById('modal-overlay');
    ov.innerHTML = '<div class="modal">' + html + '</div>';
    ov.classList.add('show');
    ov.onclick = function (e) { if (e.target === ov) closeModal(); };
  }

  function closeModal() {
    var ov = document.getElementById('modal-overlay');
    ov.classList.remove('show');
    ov.innerHTML = '';
  }

  function spinnerHTML(label) {
    return '<div class="center"><div class="spinner"></div><p class="muted">' +
      esc(label || 'Loading…') + '</p></div>';
  }

  function emptyHTML(title, sub, actionHTML) {
    return '<div class="empty">' +
      '<div class="empty-icon">🧾</div>' +
      '<h3>' + esc(title) + '</h3>' +
      '<p class="muted">' + esc(sub) + '</p>' +
      (actionHTML || '') + '</div>';
  }

  window.UI = {
    esc: esc, fmtINR: fmtINR, toPaise: toPaise,
    timeAgo: timeAgo, fmtDate: fmtDate, initials: initials, avatar: avatar,
    toast: toast, openModal: openModal, closeModal: closeModal,
    spinnerHTML: spinnerHTML, emptyHTML: emptyHTML
  };
})();
