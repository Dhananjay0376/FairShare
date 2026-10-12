/* Supabase client singleton + tiny data-access helpers. */
(function () {
  'use strict';
  var cfg = window.FAIRSHARE_CONFIG;
  var client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  // ---- Auth -------------------------------------------------
  async function getSession() {
    var r = await client.auth.getSession();
    return r.data.session || null;
  }

  async function getUser() {
    var r = await client.auth.getUser();
    return r.data.user || null;
  }

  // Ensure a profiles row exists for the signed-in user.
  async function ensureProfile(user) {
    var sel = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (sel.data) return sel.data;
    var meta = user.user_metadata || {};
    var name = meta.display_name || meta.full_name ||
               (user.email ? user.email.split('@')[0] : 'Member');
    var ins = await client.from('profiles').insert({
      id: user.id,
      display_name: String(name).slice(0, 60),
      avatar_color: pickColor(user.id)
    }).select().single();
    if (ins.error) throw ins.error;
    return ins.data;
  }

  function pickColor(seed) {
    var colors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
    var h = 0;
    for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return colors[h % colors.length];
  }

  // ---- Groups ------------------------------------------------
  async function myGroups(userId) {
    // Groups where I am an active member, with member counts.
    var r = await client
      .from('group_members')
      .select('group_id, groups(id, name, type, currency, invite_code, archived, created_at)')
      .eq('user_id', userId)
      .is('left_at', null)
      .eq('groups.archived', false)
      .order('joined_at', { ascending: false });
    if (r.error) throw r.error;
    return r.data.map(function (m) { return m.groups; }).filter(Boolean);
  }

  async function getGroup(groupId) {
    var r = await client.from('groups').select('*').eq('id', groupId).single();
    if (r.error) throw r.error;
    return r.data;
  }

  async function getMembers(groupId) {
    var r = await client
      .from('group_members')
      .select('id, user_id, role, joined_at, profiles(id, display_name, upi_id, avatar_color)')
      .eq('group_id', groupId)
      .is('left_at', null)
      .order('joined_at', { ascending: true });
    if (r.error) throw r.error;
    return r.data;
  }

  async function createGroup(name, type, userId, displayName) {
    var g = await client.from('groups').insert({
      name: name, type: type || 'other', currency: 'INR', owner_id: userId
    }).select().single();
    if (g.error) throw g.error;
    var m = await client.from('group_members').insert({
      group_id: g.data.id, user_id: userId, role: 'owner'
    });
    if (m.error) throw m.error;
    await logActivity(g.data.id, userId, 'group.created', displayName + ' created group ' + name);
    return g.data;
  }

  async function joinGroup(code) {
    var r = await client.rpc('join_group_by_code', { p_code: code });
    if (r.error) throw r.error;
    return r.data; // group id
  }

  async function leaveGroup(groupId, userId, displayName, groupName) {
    var r = await client.from('group_members')
      .update({ left_at: new Date().toISOString() })
      .eq('group_id', groupId).eq('user_id', userId);
    if (r.error) throw r.error;
    await logActivity(groupId, userId, 'member.left', displayName + ' left ' + groupName);
  }

  // ---- Expenses ------------------------------------------------
  async function getExpenses(groupId) {
    var r = await client
      .from('expenses')
      .select('*')
      .eq('group_id', groupId)
      .is('deleted_at', null)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (r.error) throw r.error;
    return r.data;
  }

  async function getSplits(expenseIds) {
    if (!expenseIds.length) return [];
    var r = await client.from('expense_splits').select('*').in('expense_id', expenseIds);
    if (r.error) throw r.error;
    return r.data;
  }

  async function addExpense(expense, splits, userId, actorName) {
    var e = await client.from('expenses').insert(expense).select().single();
    if (e.error) throw e.error;
    var rows = splits.map(function (s) {
      return { expense_id: e.data.id, user_id: s.user_id, amount_minor: s.amount_minor };
    });
    var sp = await client.from('expense_splits').insert(rows);
    if (sp.error) {
      await client.from('expenses').delete().eq('id', e.data.id); // rollback
      throw sp.error;
    }
    await logActivity(expense.group_id, userId, 'expense.created',
      actorName + ' added "' + expense.description + '" (' + fmtMinor(expense.amount_minor) + ')', e.data.id);
    return e.data;
  }

  async function updateExpense(expenseId, groupId, patch, splits, userId, actorName) {
    patch.updated_at = new Date().toISOString();
    var e = await client.from('expenses').update(patch).eq('id', expenseId).select().single();
    if (e.error) throw e.error;
    await client.from('expense_splits').delete().eq('expense_id', expenseId);
    var rows = splits.map(function (s) {
      return { expense_id: expenseId, user_id: s.user_id, amount_minor: s.amount_minor };
    });
    var sp = await client.from('expense_splits').insert(rows);
    if (sp.error) throw sp.error;
    await logActivity(groupId, userId, 'expense.updated',
      actorName + ' updated "' + e.data.description + '"', expenseId);
    return e.data;
  }

  async function deleteExpense(expenseId, groupId, userId, actorName, description) {
    var r = await client.from('expenses')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', expenseId);
    if (r.error) throw r.error;
    await logActivity(groupId, userId, 'expense.deleted',
      actorName + ' deleted "' + description + '"', expenseId);
  }

  // ---- Settlements ----------------------------------------------
  async function getSettlements(groupId) {
    var r = await client.from('settlements').select('*')
      .eq('group_id', groupId).order('created_at', { ascending: false });
    if (r.error) throw r.error;
    return r.data;
  }

  async function recordSettlement(row, actorName) {
    var r = await client.from('settlements').insert(row).select().single();
    if (r.error) throw r.error;
    await logActivity(row.group_id, row.created_by, 'settlement.recorded',
      actorName + ' recorded a settlement of ' + fmtMinor(row.amount_minor), r.data.id);
    return r.data;
  }

  // ---- Activity --------------------------------------------------
  async function getActivity(groupId, limit) {
    var r = await client.from('activities').select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(limit || 50);
    if (r.error) throw r.error;
    return r.data;
  }

  async function logActivity(groupId, actorId, kind, summary, refId) {
    await client.from('activities').insert({
      group_id: groupId, actor_id: actorId, kind: kind, summary: summary,
      ref_id: refId || null
    });
  }

  function fmtMinor(minor) {
    return '₹' + (minor / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  window.DB = {
    client: client,
    getSession: getSession, getUser: getUser, ensureProfile: ensureProfile,
    myGroups: myGroups, getGroup: getGroup, getMembers: getMembers,
    createGroup: createGroup, joinGroup: joinGroup, leaveGroup: leaveGroup,
    getExpenses: getExpenses, getSplits: getSplits,
    addExpense: addExpense, updateExpense: updateExpense, deleteExpense: deleteExpense,
    getSettlements: getSettlements, recordSettlement: recordSettlement,
    getActivity: getActivity, logActivity: logActivity, fmtMinor: fmtMinor
  };
})();
