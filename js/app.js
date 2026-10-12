/* FairShare — router + boot. Hash routes, auth guard, view rendering. */
(function () {
  'use strict';
  var UI = window.UI, DB = window.DB;

  var S = { user: null, profile: null, groups: [] };
  var app = document.getElementById('app');

  function setHTML(html) {
    app.innerHTML = html;
    window.scrollTo(0, 0);
  }

  async function boot() {
    var session = await DB.getSession();
    if (session && session.user) {
      S.user = session.user;
      S.profile = await DB.ensureProfile(session.user);
      S.groups = await DB.myGroups(session.user.id);
    }
    // Refresh auth state on change (e.g. after OAuth redirect or form login)
    DB.client.auth.onAuthStateChange(async function (evt, session2) {
      if (evt === 'SIGNED_IN' && session2 && !S.user) {
        S.user = session2.user;
        S.profile = await DB.ensureProfile(session2.user);
        S.groups = await DB.myGroups(session2.user.id);
        // Return to where the user was headed (e.g. an invite link)
        var back = null;
        try {
          back = sessionStorage.getItem('fs_redirect');
          sessionStorage.removeItem('fs_redirect');
        } catch (e) {}
        location.hash = (back && back !== '#/login' && back !== '#/signup') ? back : '#/';
      } else if (evt === 'SIGNED_OUT') {
        S.user = null; S.profile = null; S.groups = [];
        if (!location.hash.startsWith('#/login')) location.hash = '#/login';
      }
    });
    window.addEventListener('hashchange', router);
    router();
  }

  async function requireAuth() {
    if (S.user && S.profile) return true;
    var session = await DB.getSession();
    if (session && session.user) {
      S.user = session.user;
      S.profile = await DB.ensureProfile(session.user);
      S.groups = await DB.myGroups(session.user.id);
      return true;
    }
    // Remember where they were going (invite links) for after login
    try { sessionStorage.setItem('fs_redirect', location.hash || '#/'); } catch (e) {}
    location.hash = '#/login';
    return false;
  }

  async function router() {
    var hash = location.hash || '#/';
    try {
      // Public routes
      if (hash === '#/login' || hash === '#/login/') {
        setHTML(await window.AuthViews.loginView());
        window.AuthViews.bindLogin();
        return;
      }
      if (hash === '#/signup') {
        setHTML(await window.AuthViews.signupView());
        window.AuthViews.bindSignup();
        return;
      }

      if (!await requireAuth()) return;

      var m;
      if (hash === '#/' || hash === '') {
        setHTML(UI.spinnerHTML('Loading groups…'));
        setHTML(await window.Groups.dashboardView(S));
        window.Groups.bindDashboard();
      } else if (hash === '#/groups/new') {
        setHTML(window.Groups.newGroupView());
        window.Groups.bindNewGroup(S);
      } else if ((m = hash.match(/^#\/join(?:\/([A-Za-z0-9]+))?$/))) {
        if (m[1]) {
          setHTML(UI.spinnerHTML('Joining group…'));
          window.Groups.bindJoin(S); // deep-link join, no form needed
        } else {
          setHTML(window.Groups.joinView());
          window.Groups.bindJoin(S);
        }
      } else if (hash === '#/profile') {
        setHTML(await window.AuthViews.profileView(S));
        window.AuthViews.bindProfile(S);
      } else if ((m = hash.match(/^#\/g\/([0-9a-f-]{36})\/expense\/new$/))) {
        setHTML(UI.spinnerHTML('Loading…'));
        setHTML(await window.Expenses.formView(S, m[1], null));
        window.Expenses.bindForm(S, m[1], null);
      } else if ((m = hash.match(/^#\/g\/([0-9a-f-]{36})\/expense\/([0-9a-f-]{36})\/edit$/))) {
        setHTML(UI.spinnerHTML('Loading…'));
        setHTML(await window.Expenses.formView(S, m[1], m[2]));
        window.Expenses.bindForm(S, m[1], m[2]);
      } else if ((m = hash.match(/^#\/g\/([0-9a-f-]{36})\/expense\/([0-9a-f-]{36})$/))) {
        setHTML(UI.spinnerHTML('Loading…'));
        setHTML(await window.Expenses.detailView(S, m[1], m[2]));
        window.Expenses.bindDetail(S, m[1], m[2]);
      } else if ((m = hash.match(/^#\/g\/([0-9a-f-]{36})\/settle/))) {
        setHTML(UI.spinnerHTML('Loading…'));
        setHTML(await window.Settle.settleView(S, m[1]));
        window.Settle.bindSettle(S, m[1]);
      } else if ((m = hash.match(/^#\/g\/([0-9a-f-]{36})(?:\?tab=(expenses|balances|activity))?$/))) {
        var tab = 'expenses';
        var qi = hash.indexOf('?tab=');
        if (qi !== -1) tab = hash.slice(qi + 5);
        setHTML(UI.spinnerHTML('Loading group…'));
        setHTML(await window.Groups.groupView(S, m[1], tab));
        window.Groups.bindGroup(S, m[1], tab);
      } else {
        location.hash = '#/';
      }
    } catch (err) {
      console.error(err);
      setHTML('<div class="page"><div class="card"><h3>Something went wrong</h3>' +
        '<p class="muted">' + UI.esc(err.message || 'Unknown error') + '</p>' +
        '<a class="btn block" href="#/">Back home</a></div></div>');
    }
  }

  window.FS = { state: S, boot: boot, router: router };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
