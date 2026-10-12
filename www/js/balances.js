/* Balance computation + debt simplification. Pure functions.
   All money is integer paise. Positive net = others owe you. */
(function () {
  'use strict';

  // expenses: [{id, paid_by, amount_minor, deleted_at}]
  // splits:   [{expense_id, user_id, amount_minor}]
  // settlements: [{from_user_id, to_user_id, amount_minor}]
  function computeBalances(memberIds, expenses, splits, settlements) {
    var bal = {};
    memberIds.forEach(function (id) { bal[id] = 0; });

    var live = {};
    expenses.forEach(function (e) {
      if (e.deleted_at) return;
      live[e.id] = true;
      if (bal[e.paid_by] !== undefined) bal[e.paid_by] += e.amount_minor;
    });
    splits.forEach(function (s) {
      if (!live[s.expense_id]) return;
      if (bal[s.user_id] !== undefined) bal[s.user_id] -= s.amount_minor;
    });
    (settlements || []).forEach(function (st) {
      if (bal[st.from_user_id] !== undefined) bal[st.from_user_id] += st.amount_minor;
      if (bal[st.to_user_id] !== undefined) bal[st.to_user_id] -= st.amount_minor;
    });
    return bal;
  }

  // Greedy min-transfer simplification. Never changes anyone's net.
  // Returns [{from, to, amount_minor}]
  function simplifyDebts(balances) {
    var debtors = [], creditors = [];
    Object.keys(balances).forEach(function (id) {
      var amt = balances[id];
      if (amt < 0) debtors.push({ id: id, amt: -amt });
      else if (amt > 0) creditors.push({ id: id, amt: amt });
    });
    debtors.sort(function (a, b) { return b.amt - a.amt; });
    creditors.sort(function (a, b) { return b.amt - a.amt; });
    var out = [], i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      var d = debtors[i], c = creditors[j];
      var x = Math.min(d.amt, c.amt);
      out.push({ from: d.id, to: c.id, amount_minor: x });
      d.amt -= x; c.amt -= x;
      if (d.amt === 0) i++;
      if (c.amt === 0) j++;
    }
    return out;
  }

  // Split calculators. All return [{user_id, amount_minor}] summing exactly to total.
  function splitEqual(total, userIds) {
    var n = userIds.length;
    var base = Math.floor(total / n);
    var rem = total - base * n;
    return userIds.map(function (id, i) {
      return { user_id: id, amount_minor: base + (i < rem ? 1 : 0) };
    });
  }

  // inputs: [{user_id, value}] value = paise. Must sum to total.
  function splitExact(total, inputs) {
    var sum = inputs.reduce(function (a, x) { return a + x.value; }, 0);
    if (sum !== total) throw new Error('Exact amounts must add up to ' + fmt(total));
    return inputs.map(function (x) { return { user_id: x.user_id, amount_minor: x.value }; });
  }

  // inputs: [{user_id, value}] value = percent. Must sum to 100.
  function splitPercent(total, inputs) {
    var sum = inputs.reduce(function (a, x) { return a + x.value; }, 0);
    if (Math.abs(sum - 100) > 0.001) throw new Error('Percentages must add up to 100%');
    var rows = inputs.map(function (x, i) {
      var exact = total * x.value / 100;
      return { user_id: x.user_id, fl: Math.floor(exact), frac: exact - Math.floor(exact), i: i };
    });
    var assigned = rows.reduce(function (a, r) { return a + r.fl; }, 0);
    var rem = total - assigned;
    rows.sort(function (a, b) { return b.frac - a.frac || a.i - b.i; });
    for (var k = 0; k < rem; k++) rows[k].fl += 1;
    return rows.map(function (r) { return { user_id: r.user_id, amount_minor: r.fl }; });
  }

  // inputs: [{user_id, value}] value = shares. Must be positive.
  function splitShares(total, inputs) {
    var s = inputs.reduce(function (a, x) { return a + x.value; }, 0);
    if (!(s > 0)) throw new Error('Shares must be positive numbers');
    var rows = inputs.map(function (x, i) {
      var exact = total * x.value / s;
      return { user_id: x.user_id, fl: Math.floor(exact), frac: exact - Math.floor(exact), i: i };
    });
    var assigned = rows.reduce(function (a, r) { return a + r.fl; }, 0);
    var rem = total - assigned;
    rows.sort(function (a, b) { return b.frac - a.frac || a.i - b.i; });
    for (var k = 0; k < rem; k++) rows[k].fl += 1;
    return rows.map(function (r) { return { user_id: r.user_id, amount_minor: r.fl }; });
  }

  function fmt(total) {
    return '₹' + (total / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  window.Bal = {
    computeBalances: computeBalances,
    simplifyDebts: simplifyDebts,
    splitEqual: splitEqual, splitExact: splitExact,
    splitPercent: splitPercent, splitShares: splitShares
  };
})();
