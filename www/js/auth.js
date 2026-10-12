/* Auth views: login, signup, profile. */
(function () {
  'use strict';
  var UI = window.UI, DB = window.DB;

  function shell(inner) {
    return '<div class="auth-wrap"><div class="auth-card">' +
      '<div class="brand"><span class="brand-mark">₹</span><h1>FairShare</h1>' +
      '<p class="muted">Split bills fairly. Settle with UPI.</p></div>' +
      inner + '</div></div>';
  }

  async function loginView() {
    return shell(
      '<h2>Welcome back</h2>' +
      '<form id="login-form">' +
      '<label>Email<input type="email" id="li-email" required autocomplete="email" placeholder="you@example.com"></label>' +
      '<label>Password<input type="password" id="li-pass" required autocomplete="current-password" placeholder="••••••••"></label>' +
      '<button class="btn primary block" type="submit">Log in</button>' +
      '</form>' +
      '<button class="btn oauth block" id="google-btn">' +
      '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.6-5 3.6-8.9z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.3 7.4 24 12 24z"/><path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.5 0 10.1 0 12s.5 3.5 1.4 5.1l3.8-2.7z"/><path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.4 0 3.5 2.7 1.4 6.9l3.8 2.8c1-2.9 3.7-5 6.8-5z"/></svg>' +
      'Continue with Google</button>' +
      '<p class="muted center">No account? <a href="#/signup">Sign up</a></p>' +
      '<p class="hint" id="auth-msg"></p>'
    );
  }

  function bindLogin() {
    document.getElementById('login-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = document.getElementById('li-email').value.trim();
      var pass = document.getElementById('li-pass').value;
      var msg = document.getElementById('auth-msg');
      msg.textContent = 'Logging in…';
      var r = await DB.client.auth.signInWithPassword({ email: email, password: pass });
      if (r.error) { msg.textContent = r.error.message; return; }
      // Navigation is handled by the SIGNED_IN listener in app.js
      // (it also restores invite deep-links).
    });
    var g = document.getElementById('google-btn');
    if (g) g.addEventListener('click', googleSignIn);
  }

  async function googleSignIn() {
    var redirect = location.origin + location.pathname;
    var r = await DB.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirect }
    });
    if (r.error) UI.toast(r.error.message);
    // On success Supabase redirects the browser; nothing else to do here.
  }

  async function signupView() {
    return shell(
      '<h2>Create account</h2>' +
      '<form id="su-form">' +
      '<label>Your name<input id="su-name" required maxlength="60" placeholder="Asha Sharma" autocomplete="name"></label>' +
      '<label>Email<input type="email" id="su-email" required autocomplete="email" placeholder="you@example.com"></label>' +
      '<label>Password<input type="password" id="su-pass" required minlength="6" autocomplete="new-password" placeholder="Min 6 characters"></label>' +
      '<button class="btn primary block" type="submit">Sign up</button>' +
      '</form>' +
      '<button class="btn oauth block" id="google-btn2">' +
      'Continue with Google</button>' +
      '<p class="muted center">Have an account? <a href="#/login">Log in</a></p>' +
      '<p class="hint" id="auth-msg"></p>'
    );
  }

  function bindSignup() {
    document.getElementById('su-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var name = document.getElementById('su-name').value.trim();
      var email = document.getElementById('su-email').value.trim();
      var pass = document.getElementById('su-pass').value;
      var msg = document.getElementById('auth-msg');
      msg.textContent = 'Creating account…';
      var r = await DB.client.auth.signUp({
        email: email, password: pass,
        options: { data: { display_name: name } }
      });
      if (r.error) { msg.textContent = r.error.message; return; }
      // If email confirmation is off, SIGNED_IN fires and app.js navigates.
      if (!r.data.session) { msg.textContent = 'Account created! Check your email to confirm, then log in.'; }
    });
    var g = document.getElementById('google-btn2');
    if (g) g.addEventListener('click', googleSignIn);
  }

  // ---- Profile -------------------------------------------------
  var SWATCHES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

  function hasEmailIdentity(user) {
    // Returns true if user has a local email+password identity set up
    return user.identities && user.identities.some(function (id) { return id.provider === 'email'; });
  }

  async function profileView(S) {
    var p = S.profile;
    var sw = SWATCHES.map(function (c) {
      return '<button class="swatch' + (p.avatar_color === c ? ' sel' : '') + '" data-c="' + c +
        '" style="background:' + c + '" aria-label="color"></button>';
    }).join('');

    // session.user may lack identities; fetch fresh user to get full data
    var freshUser = S.user;
    try {
      var gu = await DB.client.auth.getUser();
      if (gu.data && gu.data.user) { freshUser = gu.data.user; S.user = freshUser; }
    } catch (e) {}
    var hasPass = hasEmailIdentity(freshUser);
    var passSection = '<div class="card" id="pass-card">' +
      '<h3 style="margin:0 0 12px">' + (hasPass ? '🔑 Change Password' : '🔐 Set a Password') + '</h3>' +
      (hasPass ? '<label>Current password<input type="password" id="pf-curr-pass" autocomplete="current-password" placeholder="••••••••"></label>' : '') +
      '<label>New password<input type="password" id="pf-new-pass" minlength="6" autocomplete="new-password" placeholder="Min 6 characters"></label>' +
      '<label>Confirm password<input type="password" id="pf-confirm-pass" autocomplete="new-password" placeholder="Re-enter new password"></label>' +
      '<p class="hint" id="pass-msg"></p>' +
      '<button class="btn primary block" id="pass-btn">' + (hasPass ? 'Update Password' : 'Set Password') + '</button>' +
      '</div>';

    return '<div class="page"><div class="appbar"><h2>Profile</h2></div>' +
      '<div class="card center">' + UI.avatar(p, 72) +
      '<h3 style="margin:8px 0 2px">' + UI.esc(p.display_name) + '</h3>' +
      '<p class="muted">' + UI.esc(S.user.email || '') + '</p></div>' +
      '<form id="profile-form" class="card">' +
      '<label>Display name<input id="pf-name" maxlength="60" value="' + UI.esc(p.display_name) + '"></label>' +
      '<label>UPI ID <span class="muted">(for receiving settlements)</span>' +
      '<input id="pf-upi" placeholder="name@upi" value="' + UI.esc(p.upi_id || '') + '"></label>' +
      '<label>Avatar color</label><div class="swatches">' + sw + '</div>' +
      '<button class="btn primary block" type="submit">Save profile</button>' +
      '</form>' +
      passSection +
      '<button class="btn danger-outline block" id="logout-btn">Log out</button></div>';
  }

  function bindProfile(S) {
    var color = S.profile.avatar_color;
    document.querySelectorAll('.swatch').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        color = b.dataset.c;
        document.querySelectorAll('.swatch').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
      });
    });
    document.getElementById('profile-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var name = document.getElementById('pf-name').value.trim();
      var upi = document.getElementById('pf-upi').value.trim();
      if (!name) { UI.toast('Name cannot be empty'); return; }
      if (upi && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upi)) { UI.toast('That UPI ID looks invalid'); return; }
      var r = await DB.client.from('profiles')
        .update({ display_name: name, upi_id: upi || null, avatar_color: color })
        .eq('id', S.user.id).select().single();
      if (r.error) { UI.toast(r.error.message); return; }
      S.profile = r.data;
      UI.toast('Profile saved');
      location.hash = '#/';
    });

    // Password section
    var hasPass = hasEmailIdentity(S.user);
    document.getElementById('pass-btn').addEventListener('click', async function () {
      var newPass = document.getElementById('pf-new-pass').value;
      var confirmPass = document.getElementById('pf-confirm-pass').value;
      var msg = document.getElementById('pass-msg');

      if (newPass.length < 6) { msg.textContent = 'Password must be at least 6 characters.'; return; }
      if (newPass !== confirmPass) { msg.textContent = 'Passwords do not match.'; return; }

      if (hasPass) {
        // Re-authenticate first with current password
        var currPass = document.getElementById('pf-curr-pass').value;
        if (!currPass) { msg.textContent = 'Enter your current password.'; return; }
        var reauth = await DB.client.auth.signInWithPassword({ email: S.user.email, password: currPass });
        if (reauth.error) { msg.textContent = 'Current password is incorrect.'; return; }
      }

      msg.textContent = 'Updating…';
      var r = await DB.client.auth.updateUser({ password: newPass });
      if (r.error) { msg.textContent = r.error.message; return; }
      msg.textContent = '';
      UI.toast(hasPass ? 'Password updated!' : 'Password set! You can now log in with email & password.');
      // Re-render profile so section updates to "Change Password"
      setTimeout(function () { location.hash = '#/profile'; }, 1500);
    });

    document.getElementById('logout-btn').addEventListener('click', async function () {
      await DB.client.auth.signOut();
      location.hash = '#/login';
    });
  }

  window.AuthViews = {
    loginView: loginView, bindLogin: bindLogin,
    signupView: signupView, bindSignup: bindSignup,
    profileView: profileView, bindProfile: bindProfile
  };
})();
