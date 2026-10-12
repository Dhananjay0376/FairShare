/* Settle up: record payments + UPI pay links / QR codes. */
(function () {
  'use strict';
  var UI = window.UI, DB = window.DB, Groups = window.Groups;

  // upi://pay?pa=<id>&pn=<name>&am=<rupees>&cu=INR&tn=<note>
  function upiLink(upiId, name, paise, note) {
    var rupees = (paise / 100).toFixed(2);
    return 'upi://pay?pa=' + encodeURIComponent(upiId) +
      '&pn=' + encodeURIComponent(name) +
      '&am=' + rupees +
      '&cu=INR' +
      '&tn=' + encodeURIComponent(note || 'FairShare settlement');
  }

  function parseQuery() {
    var q = {};
    var h = location.hash || '';
    var i = h.indexOf('?');
    if (i === -1) return q;
    h.slice(i + 1).split('&').forEach(function (p) {
      var kv = p.split('=');
      q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
    });
    return q;
  }

  async function settleView(S, groupId) {
    var q = parseQuery();
    var d = await Groups.groupData(groupId);
    var opts = function (sel) {
      return d.members.map(function (m) {
        return '<option value="' + m.user_id + '"' + (m.user_id === sel ? ' selected' : '') + '>' +
          UI.esc(m.profiles.display_name) + '</option>';
      }).join('');
    };
    var amtRupees = q.amount ? (parseInt(q.amount, 10) / 100).toFixed(2) : '';
    return '<div class="page"><div class="appbar"><a href="#/g/' + groupId + '?tab=balances" class="back">‹</a>' +
      '<h2>Settle up</h2></div>' +
      '<form id="settle-form" class="card">' +
      '<div class="row2"><label>From (payer)<select id="st-from">' + opts(q.from || S.user.id) + '</select></label>' +
      '<label>To (receiver)<select id="st-to">' + opts(q.to || '') + '</select></label></div>' +
      '<div class="row2"><label>Amount (₹)<input id="st-amt" required inputmode="decimal" placeholder="0.00" value="' +
      amtRupees + '"></label>' +
      '<label>Method<select id="st-method"><option value="upi">UPI</option><option value="cash">Cash</option>' +
      '<option value="bank">Bank transfer</option><option value="other">Other</option></select></label></div>' +
      '<label>Note (optional)<input id="st-note" maxlength="120" placeholder="Dinner settlement"></label>' +
      '<div id="upi-panel"></div>' +
      '<button class="btn primary block" type="submit">Record settlement</button>' +
      '<p class="hint">Record only after the money is actually paid. The UPI button opens your UPI app — payment happens there, FairShare just records it.</p>' +
      '</form></div>';
  }

  function bindSettle(S, groupId) {
    var d = null;
    Groups.groupData(groupId).then(function (gd) { d = gd; renderUpiPanel(S, d); });

    ['st-from', 'st-to', 'st-amt', 'st-method'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () { renderUpiPanel(S, d); });
      document.getElementById(id).addEventListener('input', function () { renderUpiPanel(S, d); });
    });

    document.getElementById('settle-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var from = document.getElementById('st-from').value;
      var to = document.getElementById('st-to').value;
      var paise = UI.toPaise(document.getElementById('st-amt').value);
      var method = document.getElementById('st-method').value;
      var note = document.getElementById('st-note').value.trim();
      if (from === to) { UI.toast('Payer and receiver must be different'); return; }
      if (!paise) { UI.toast('Enter a valid amount'); return; }
      try {
        await DB.recordSettlement({
          group_id: groupId, from_user_id: from, to_user_id: to,
          amount_minor: paise, method: method, note: note || null, created_by: S.user.id
        }, S.profile.display_name);
        UI.toast('Settlement recorded');
        location.hash = '#/g/' + groupId + '?tab=balances';
      } catch (err) { UI.toast(err.message); }
    });
  }

  function renderUpiPanel(S, d) {
    var panel = document.getElementById('upi-panel');
    if (!panel || !d) return;
    var to = document.getElementById('st-to').value;
    var method = document.getElementById('st-method').value;
    var paise = UI.toPaise(document.getElementById('st-amt').value);
    panel.innerHTML = '';
    if (method !== 'upi' || !paise) return;
    var m = Groups.memberById(d.members, to);
    var upiId = m && m.profiles && m.profiles.upi_id;
    if (!upiId) {
      panel.innerHTML = '<p class="hint">⚠️ ' + UI.esc(m ? m.profiles.display_name : 'Receiver') +
        ' has not added a UPI ID in their profile. Ask them to add it, or pay by cash and record here.</p>';
      return;
    }
    var link = upiLink(upiId, m.profiles.display_name, paise, 'FairShare settlement');
    panel.innerHTML = '<div class="upi-box">' +
      '<p><b>Pay ' + UI.esc(m.profiles.display_name) + '</b> ' + UI.fmtINR(paise) +
      ' <span class="muted small">(' + UI.esc(upiId) + ')</span></p>' +
      '<a class="btn primary block" href="' + UI.esc(link) + '">Pay ' + UI.fmtINR(paise) + ' via UPI</a>' +
      '<div id="upi-qr" class="qr"></div>' +
      '<p class="muted small center">Scan with GPay / PhonePe / Paytm</p></div>';
    // QR code (qrcodejs via CDN). Degrades gracefully offline.
    var qrEl = document.getElementById('upi-qr');
    if (window.QRCode && qrEl) {
      try {
        new window.QRCode(qrEl, { text: link, width: 180, height: 180, correctLevel: 1 });
      } catch (err) { qrEl.innerHTML = '<p class="hint">QR unavailable — use the Pay button above.</p>'; }
    } else if (qrEl) {
      qrEl.innerHTML = '<p class="hint">QR unavailable offline — use the Pay button above.</p>';
    }
  }

  window.Settle = {
    settleView: settleView, bindSettle: bindSettle, upiLink: upiLink, parseQuery: parseQuery
  };
})();
