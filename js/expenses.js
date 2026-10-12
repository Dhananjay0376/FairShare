/* Expenses: add/edit form with 4 split types + detail view. */
(function () {
  'use strict';
  var UI = window.UI, DB = window.DB, Bal = window.Bal, Groups = window.Groups;

  var METHODS = [
    ['equal', 'Equal'], ['exact', 'Exact ₹'], ['percent', 'Percent %'], ['shares', 'Shares']
  ];

  // ---------------- Form ----------------
  async function formView(S, groupId, expenseId) {
    var d = await Groups.groupData(groupId);
    var existing = null, existingSplits = [];
    if (expenseId) {
      existing = d.expenses.find(function (e) { return e.id === expenseId; });
      if (!existing) throw new Error('Expense not found');
      var all = await DB.getSplits([expenseId]);
      existingSplits = all;
    }
    var st = {
      d: d, existing: existing,
      method: existing ? 'exact' : 'equal',   // edits reopen as exact — always faithful
      participants: existing
        ? existingSplits.map(function (s) { return s.user_id; })
        : d.memberIds.slice(),
      values: {}  // user_id -> raw input string for exact/percent/shares
    };
    if (existing) {
      existingSplits.forEach(function (s) {
        st.values[s.user_id] = (s.amount_minor / 100).toFixed(2);
      });
    }
    S._expenseForm = st;

    var payerOpts = d.members.map(function (m) {
      var sel = (existing ? existing.paid_by : S.user.id) === m.user_id ? ' selected' : '';
      return '<option value="' + m.user_id + '"' + sel + '>' +
        UI.esc(m.profiles.display_name) + '</option>';
    }).join('');
    var catOpts = Object.keys(Groups.CATS).map(function (c) {
      var sel = existing && existing.category === c ? ' selected' : '';
      return '<option value="' + c + '"' + sel + '>' + Groups.CATS[c] + '</option>';
    }).join('');
    var tabs = METHODS.map(function (m) {
      return '<button type="button" class="tab' + (st.method === m[0] ? ' sel' : '') +
        '" data-m="' + m[0] + '">' + m[1] + '</button>';
    }).join('');

    return '<div class="page"><div class="appbar"><a href="#/g/' + groupId +
      (existing ? '/expense/' + expenseId : '') + '" class="back">‹</a>' +
      '<h2>' + (existing ? 'Edit expense' : 'Add expense') + '</h2></div>' +
      '<form id="exp-form" class="card">' +
      '<label>Description<input id="ex-desc" required maxlength="120" placeholder="Dinner at Sharma Dhaba" value="' +
      UI.esc(existing ? existing.description : '') + '"></label>' +
      '<div class="row2"><label>Amount (₹)<input id="ex-amt" required inputmode="decimal" placeholder="0.00" value="' +
      (existing ? (existing.amount_minor / 100).toFixed(2) : '') + '"></label>' +
      '<label>Date<input type="date" id="ex-date" value="' +
      (existing ? existing.expense_date : new Date().toISOString().slice(0, 10)) + '"></label></div>' +
      '<div class="row2"><label>Paid by<select id="ex-payer">' + payerOpts + '</select></label>' +
      '<label>Category<select id="ex-cat">' + catOpts + '</select></label></div>' +
      '<label>Split method</label><div class="tabs" id="method-tabs">' + tabs + '</div>' +
      '<div id="split-people"></div>' +
      '<div id="split-preview" class="preview"></div>' +
      '<p class="hint" id="ex-err"></p>' +
      '<button class="btn primary block" type="submit">' +
      (existing ? 'Save changes' : 'Add expense') + '</button></form></div>';
  }

  function renderPeople(S) {
    var st = S._expenseForm, d = st.d;
    var box = document.getElementById('split-people');
    box.innerHTML = d.members.map(function (m) {
      var on = st.participants.indexOf(m.user_id) !== -1;
      var input = '';
      if (st.method !== 'equal' && on) {
        var ph = st.method === 'exact' ? '₹' : (st.method === 'percent' ? '%' : 'shares');
        input = '<input class="split-in" data-u="' + m.user_id + '" inputmode="decimal" placeholder="' + ph + '" value="' +
          UI.esc(st.values[m.user_id] || '') + '">';
      }
      return '<label class="person-row"><input type="checkbox" data-u="' + m.user_id + '"' +
        (on ? ' checked' : '') + '>' + UI.avatar(m.profiles, 32) +
        '<span class="pname">' + UI.esc(m.profiles.display_name) + '</span>' + input + '</label>';
    }).join('');

    box.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = cb.dataset.u;
        if (cb.checked) st.participants.push(id);
        else st.participants = st.participants.filter(function (x) { return x !== id; });
        renderPeople(S); renderPreview(S);
      });
    });
    box.querySelectorAll('.split-in').forEach(function (inp) {
      inp.addEventListener('input', function () {
        st.values[inp.dataset.u] = inp.value;
        renderPreview(S);
      });
    });
  }

  function currentTotal() {
    var p = UI.toPaise(document.getElementById('ex-amt').value);
    return p;
  }

  function renderPreview(S) {
    var st = S._expenseForm, prev = document.getElementById('split-preview');
    var total = currentTotal();
    if (!total || !st.participants.length) { prev.innerHTML = ''; return; }
    try {
      var splits = computeSplits(st, total);
      prev.innerHTML = splits.map(function (s) {
        var m = Groups.memberById(st.d.members, s.user_id);
        var name = m ? m.profiles.display_name : '?';
        return '<div class="prev-row"><span>' + UI.esc(name) + '</span><b>' +
          UI.fmtINR(s.amount_minor) + '</b></div>';
      }).join('');
    } catch (err) {
      prev.innerHTML = '<p class="hint">' + UI.esc(err.message) + '</p>';
    }
  }

  function computeSplits(st, total) {
    var ids = st.participants;
    if (!ids.length) throw new Error('Select at least one participant');
    if (st.method === 'equal') return Bal.splitEqual(total, ids);
    var inputs = ids.map(function (id) {
      var raw = (st.values[id] || '').trim();
      var v = parseFloat(raw);
      if (!(v > 0)) throw new Error('Enter a valid value for every participant');
      return { user_id: id, value: st.method === 'exact' ? Math.round(v * 100) : v };
    });
    if (st.method === 'exact') return Bal.splitExact(total, inputs);
    if (st.method === 'percent') return Bal.splitPercent(total, inputs);
    return Bal.splitShares(total, inputs);
  }

  function bindForm(S, groupId, expenseId) {
    var st = S._expenseForm;
    document.querySelectorAll('#method-tabs .tab').forEach(function (b) {
      b.addEventListener('click', function () {
        st.method = b.dataset.m;
        document.querySelectorAll('#method-tabs .tab').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        renderPeople(S); renderPreview(S);
      });
    });
    document.getElementById('ex-amt').addEventListener('input', function () { renderPreview(S); });
    renderPeople(S); renderPreview(S);

    document.getElementById('exp-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var err = document.getElementById('ex-err');
      try {
        var desc = document.getElementById('ex-desc').value.trim();
        var total = currentTotal();
        if (!desc) throw new Error('Add a description');
        if (!total) throw new Error('Enter a valid amount');
        var splits = computeSplits(st, total);
        var row = {
          group_id: groupId,
          description: desc,
          amount_minor: total,
          currency: 'INR',
          category: document.getElementById('ex-cat').value,
          expense_date: document.getElementById('ex-date').value || new Date().toISOString().slice(0, 10),
          paid_by: document.getElementById('ex-payer').value,
          created_by: S.user.id
        };
        if (expenseId) {
          await DB.updateExpense(expenseId, groupId, row, splits, S.user.id, S.profile.display_name);
          UI.toast('Expense updated');
          location.hash = '#/g/' + groupId + '/expense/' + expenseId;
        } else {
          await DB.addExpense(row, splits, S.user.id, S.profile.display_name);
          UI.toast('Expense added');
          location.hash = '#/g/' + groupId;
        }
      } catch (ex) {
        err.textContent = ex.message;
      }
    });
  }

  // ---------------- Detail ----------------
  async function detailView(S, groupId, expenseId) {
    var d = await Groups.groupData(groupId);
    var e = d.expenses.find(function (x) { return x.id === expenseId; });
    if (!e) return '<div class="page"><p class="muted center">Expense not found.</p></div>';
    var splits = await DB.getSplits([expenseId]);
    var payer = Groups.profileOf(d.members, e.paid_by);
    var creator = Groups.profileOf(d.members, e.created_by);
    var canEdit = e.created_by === S.user.id ||
      d.members.some(function (m) { return m.user_id === S.user.id && m.role === 'owner'; });

    var rows = splits.map(function (s) {
      var p = Groups.profileOf(d.members, s.user_id);
      return '<div class="prev-row"><span>' + UI.avatar(p, 28) + ' ' + UI.esc(p.display_name) + '</span><b>' +
        UI.fmtINR(s.amount_minor) + '</b></div>';
    }).join('');

    return '<div class="page"><div class="appbar"><a href="#/g/' + groupId + '" class="back">‹</a>' +
      '<h2>Expense</h2></div>' +
      '<div class="card"><div class="exp-head"><div>' +
      '<h3 style="margin:0">' + UI.esc(e.description) + '</h3>' +
      '<p class="muted small">' + (Groups.CATS[e.category] || '') + ' · ' + UI.fmtDate(e.expense_date) + '</p></div>' +
      '<div class="exp-total">' + UI.fmtINR(e.amount_minor) + '</div></div>' +
      '<div class="prev-row"><span>Paid by</span><b>' + UI.esc(payer.display_name) + '</b></div>' +
      '<div class="prev-row"><span>Added by</span><b>' + UI.esc(creator.display_name) + '</b></div>' +
      '<h4 class="section-title">Split between</h4>' + rows + '</div>' +
      (canEdit
        ? '<div class="row2"><a class="btn block" href="#/g/' + groupId + '/expense/' + expenseId + '/edit">Edit</a>' +
          '<button class="btn danger-outline block" id="del-exp">Delete</button></div>'
        : '') + '</div>';
  }

  function bindDetail(S, groupId, expenseId) {
    var b = document.getElementById('del-exp');
    if (b) b.addEventListener('click', async function () {
      if (!confirm('Delete this expense? This keeps a record in the activity feed.')) return;
      try {
        var d = await Groups.groupData(groupId);
        var e = d.expenses.find(function (x) { return x.id === expenseId; });
        await DB.deleteExpense(expenseId, groupId, S.user.id, S.profile.display_name,
          e ? e.description : 'expense');
        UI.toast('Expense deleted');
        location.hash = '#/g/' + groupId;
      } catch (err) { UI.toast(err.message); }
    });
  }

  window.Expenses = {
    formView: formView, bindForm: bindForm,
    detailView: detailView, bindDetail: bindDetail
  };
})();
