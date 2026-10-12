/* Groups: dashboard, create, join, detail view with tabs. */
(function () {
  'use strict';
  var UI = window.UI, DB = window.DB, Bal = window.Bal;

  var GROUP_TYPES = [
    ['trip', '✈️ Trip'], ['home', '🏠 Home'], ['couple', '💑 Couple'],
    ['event', '🎉 Event'], ['other', '📦 Other']
  ];

  // ---------------- Dashboard ----------------
  async function dashboardView(S) {
    var groups = S.groups;
    var html = '<div class="page"><div class="appbar"><h2>FairShare</h2>' +
      '<a href="#/profile" class="avatar-link">' + UI.avatar(S.profile, 36) + '</a></div>';

    if (!groups.length) {
      return html + UI.emptyHTML('No groups yet',
        'Create a group for your trip, flat, or dinner — then add expenses.',
        '<button class="btn primary" id="empty-new">Create group</button>' +
        '<p class="muted" style="margin-top:12px">Have an invite code? <a href="#/join">Join a group</a></p>') + '</div>';
    }

    // overall totals across groups
    var owe = 0, owed = 0;
    var cards = '';
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      var data = await groupLedger(g.id);
      var bal = Bal.computeBalances(data.memberIds, data.expenses, data.splits, data.settlements);
      var mine = bal[S.user.id] || 0;
      if (mine < 0) owe += -mine; else owed += mine;
      var cls = mine < 0 ? 'neg' : (mine > 0 ? 'pos' : 'zero');
      cards += '<a class="group-card" href="#/g/' + g.id + '">' +
        '<div><div class="group-name">' + UI.esc(g.name) + '</div>' +
        '<div class="muted small">' + data.memberIds.length + ' members · ' +
        UI.timeAgo(g.created_at) + '</div></div>' +
        '<div class="group-bal ' + cls + '">' + balanceLabel(mine, S.user.id, S.user.id) + '</div></a>';
    }

    html += '<div class="totals"><div class="total neg"><span>You owe</span><b>' + UI.fmtINR(owe) +
      '</b></div><div class="total pos"><span>You are owed</span><b>' + UI.fmtINR(owed) +
      '</b></div></div>' +
      '<h3 class="section-title">Your groups</h3><div class="group-list">' + cards + '</div></div>';
    return html;
  }

  function balanceLabel(minor, viewerId, memberId) {
    if (minor === 0) return 'settled';
    var abs = UI.fmtINR(Math.abs(minor));
    if (memberId === viewerId) return minor < 0 ? 'you owe ' + abs : 'you are owed ' + abs;
    return minor < 0 ? 'owes ' + abs : 'is owed ' + abs;
  }

  function bindDashboard() {
    var b = document.getElementById('empty-new');
    if (b) b.addEventListener('click', function () { location.hash = '#/groups/new'; });
  }

  // ---------------- Create / join ----------------
  function newGroupView() {
    var opts = GROUP_TYPES.map(function (t) {
      return '<option value="' + t[0] + '">' + t[1] + '</option>';
    }).join('');
    return '<div class="page"><div class="appbar"><a href="#/" class="back">‹</a><h2>New group</h2></div>' +
      '<form id="ng-form" class="card">' +
      '<label>Group name<input id="ng-name" maxlength="80" required placeholder="Goa Trip 🏖️"></label>' +
      '<label>Type<select id="ng-type">' + opts + '</select></label>' +
      '<button class="btn primary block" type="submit">Create group</button></form></div>';
  }

  function bindNewGroup(S) {
    document.getElementById('ng-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var name = document.getElementById('ng-name').value.trim();
      var type = document.getElementById('ng-type').value;
      if (!name) return;
      try {
        var g = await DB.createGroup(name, type, S.user.id, S.profile.display_name);
        S.groups = await DB.myGroups(S.user.id);
        UI.toast('Group created');
        location.hash = '#/g/' + g.id;
      } catch (err) { UI.toast(err.message); }
    });
  }

  function joinView() {
    return '<div class="page"><div class="appbar"><a href="#/" class="back">‹</a><h2>Join group</h2></div>' +
      '<form id="join-form" class="card">' +
      '<p class="muted">Ask a group member for the 6-letter invite code.</p>' +
      '<label>Invite code<input id="join-code" maxlength="6" required placeholder="ABC123" ' +
      'style="text-transform:uppercase;letter-spacing:2px"></label>' +
      '<button class="btn primary block" type="submit">Join group</button></form></div>';
  }

  function bindJoin(S) {
    async function doJoin(code) {
      code = (code || '').trim().toUpperCase();
      if (!code) return;
      try {
        var gid = await DB.joinGroup(code);
        S.groups = await DB.myGroups(S.user.id);
        UI.toast('Joined group');
        location.hash = '#/g/' + gid;
      } catch (err) { UI.toast(err.message || 'Could not join group'); }
    }
    var form = document.getElementById('join-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        doJoin(document.getElementById('join-code').value);
      });
    }
    // support #/join/ABC123 deep links (no form rendered)
    var m = (location.hash || '').match(/^#\/join\/([A-Za-z0-9]{4,10})$/);
    if (m) doJoin(m[1]);
  }

  // ---------------- Group detail ----------------
  async function groupData(groupId) {
    var g = await DB.getGroup(groupId);
    var members = await DB.getMembers(groupId);
    var expenses = await DB.getExpenses(groupId);
    var splits = await DB.getSplits(expenses.map(function (e) { return e.id; }));
    var settlements = await DB.getSettlements(groupId);
    var activity = await DB.getActivity(groupId, 40);
    var memberIds = members.map(function (m) { return m.user_id; });
    return { group: g, members: members, expenses: expenses, splits: splits,
             settlements: settlements, activity: activity, memberIds: memberIds };
  }

  async function groupLedger(groupId) {
    var d = await groupData(groupId);
    return { memberIds: d.memberIds, expenses: d.expenses, splits: d.splits, settlements: d.settlements };
  }

  function memberById(members, id) {
    for (var i = 0; i < members.length; i++) if (members[i].user_id === id) return members[i];
    return null;
  }

  function profileOf(members, id) {
    var m = memberById(members, id);
    return (m && m.profiles) || { display_name: 'Unknown', avatar_color: '#999' };
  }

  var CATS = { food: '🍔 Food', travel: '🚕 Travel', stay: '🏨 Stay', shopping: '🛍️ Shopping',
               utilities: '💡 Utilities', entertainment: '🎬 Fun', health: '💊 Health', other: '📦 Other' };

  async function groupView(S, groupId, tab) {
    tab = tab || 'expenses';
    var d = await groupData(groupId);
    var g = d.group;
    var bal = Bal.computeBalances(d.memberIds, d.expenses, d.splits, d.settlements);

    var tabs = ['expenses', 'balances', 'activity'].map(function (t) {
      return '<button class="tab' + (t === tab ? ' sel' : '') + '" data-tab="' + t + '">' +
        t[0].toUpperCase() + t.slice(1) + '</button>';
    }).join('');

    var body = '';
    if (tab === 'expenses') body = expensesTab(S, d);
    else if (tab === 'balances') body = balancesTab(S, d, bal);
    else body = activityTab(d);

    return '<div class="page"><div class="appbar"><a href="#/" class="back">‹</a>' +
      '<h2>' + UI.esc(g.name) + '</h2>' +
      '<button class="icon-btn" id="grp-menu" aria-label="Group options">⋯</button></div>' +
      '<div class="tabs">' + tabs + '</div><div id="tab-body">' + body + '</div>' +
      (tab === 'expenses'
        ? '<a class="fab" href="#/g/' + groupId + '/expense/new" aria-label="Add expense">+</a>'
        : '') + '</div>';
  }

  function expensesTab(S, d) {
    if (!d.expenses.length) {
      return UI.emptyHTML('No expenses yet', 'Add the first shared expense for this group.');
    }
    return '<div class="exp-list">' + d.expenses.map(function (e) {
      var payer = profileOf(d.members, e.paid_by);
      return '<a class="exp-row" href="#/g/' + d.group.id + '/expense/' + e.id + '">' +
        '<div class="exp-cat">' + (CATS[e.category] || CATS.other).split(' ')[0] + '</div>' +
        '<div class="exp-main"><div class="exp-desc">' + UI.esc(e.description) + '</div>' +
        '<div class="muted small">' + UI.esc(payer.display_name) + ' paid · ' +
        UI.fmtDate(e.expense_date) + '</div></div>' +
        '<div class="exp-amt">' + UI.fmtINR(e.amount_minor) + '</div></a>';
    }).join('') + '</div>';
  }

  function balancesTab(S, d, bal) {
    var rows = d.members.map(function (m) {
      var b = bal[m.user_id] || 0;
      var cls = b < 0 ? 'neg' : (b > 0 ? 'pos' : 'zero');
      return '<div class="bal-row">' + UI.avatar(m.profiles, 36) +
        '<div class="bal-name">' + UI.esc(m.profiles.display_name) +
        (m.user_id === S.user.id ? ' <span class="muted">(you)</span>' : '') + '</div>' +
        '<div class="bal-amt ' + cls + '">' + balanceLabel(b, S.user.id, m.user_id) + '</div></div>';
    }).join('');

    var debts = Bal.simplifyDebts(bal);
    var sug = debts.length
      ? '<h3 class="section-title">Suggested settlements</h3>' + debts.map(function (t) {
          var f = profileOf(d.members, t.from), to = profileOf(d.members, t.to);
          return '<div class="settle-row"><div><b>' + UI.esc(f.display_name) + '</b> pays <b>' +
            UI.esc(to.display_name) + '</b><div class="muted small">' + UI.fmtINR(t.amount_minor) + '</div></div>' +
            '<a class="btn small" href="#/g/' + d.group.id + '/settle?from=' + t.from +
            '&to=' + t.to + '&amount=' + t.amount_minor + '">Settle up</a></div>';
        }).join('')
      : '<p class="muted center" style="margin-top:16px">🎉 All settled up!</p>';

    return '<div class="card"><h3 class="section-title">Balances</h3>' + rows + '</div>' + sug;
  }

  function activityTab(d) {
    if (!d.activity.length) return UI.emptyHTML('No activity yet', 'Actions in this group will show up here.');
    var icons = { 'group.created': '👥', 'member.joined': '👋', 'member.left': '🚪',
                  'expense.created': '🧾', 'expense.updated': '✏️', 'expense.deleted': '🗑️',
                  'settlement.recorded': '💸' };
    return '<div class="act-list">' + d.activity.map(function (a) {
      return '<div class="act-row"><div class="act-icon">' + (icons[a.kind] || '•') + '</div>' +
        '<div><div>' + UI.esc(a.summary) + '</div>' +
        '<div class="muted small">' + UI.timeAgo(a.created_at) + '</div></div></div>';
    }).join('') + '</div>';
  }

  function bindGroup(S, groupId, tab) {
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () {
        location.hash = '#/g/' + groupId + '?tab=' + b.dataset.tab;
      });
    });
    var menu = document.getElementById('grp-menu');
    if (menu) menu.addEventListener('click', function () { groupMenu(S, groupId); });
  }

  function groupMenu(S, groupId) {
    UI.openModal('<h3>Group options</h3>' +
      '<button class="btn block" id="m-invite">📨 Invite members</button>' +
      '<button class="btn block" id="m-settle">💸 Settle up</button>' +
      '<button class="btn danger-outline block" id="m-leave">Leave group</button>' +
      '<button class="btn ghost block" id="m-close">Cancel</button>');
    document.getElementById('m-close').onclick = UI.closeModal;
    document.getElementById('m-invite').onclick = async function () {
      UI.closeModal(); showInvite(groupId);
    };
    document.getElementById('m-settle').onclick = function () {
      location.hash = '#/g/' + groupId + '/settle';
    };
    document.getElementById('m-leave').onclick = async function () {
      if (!confirm('Leave this group? You can rejoin with the invite code.')) return;
      UI.closeModal();
      try {
        var g = S.groups.find(function (x) { return x.id === groupId; });
        await DB.leaveGroup(groupId, S.user.id, S.profile.display_name, g ? g.name : 'the group');
        S.groups = await DB.myGroups(S.user.id);
        location.hash = '#/';
      } catch (err) { UI.toast(err.message); }
    };
  }

  async function showInvite(groupId) {
    var g = await DB.getGroup(groupId);
    var link = location.origin + location.pathname + '#/join/' + g.invite_code;
    UI.openModal('<h3>Invite to ' + UI.esc(g.name) + '</h3>' +
      '<p class="muted">Share this code or link — anyone with it can join.</p>' +
      '<div class="code-box">' + UI.esc(g.invite_code) + '</div>' +
      '<button class="btn primary block" id="copy-link">Copy invite link</button>' +
      '<button class="btn ghost block" id="m-close2">Close</button>');
    document.getElementById('m-close2').onclick = UI.closeModal;
    document.getElementById('copy-link').onclick = function () {
      copyText(link);
    };
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { UI.toast('Invite link copied'); },
        function () { UI.toast('Copy failed — long-press the link'); });
    } else { UI.toast('Copy this link: ' + t); }
  }

  window.Groups = {
    dashboardView: dashboardView, bindDashboard: bindDashboard,
    newGroupView: newGroupView, bindNewGroup: bindNewGroup,
    joinView: joinView, bindJoin: bindJoin,
    groupView: groupView, bindGroup: bindGroup,
    groupData: groupData, memberById: memberById, profileOf: profileOf,
    balanceLabel: balanceLabel, CATS: CATS
  };
})();
