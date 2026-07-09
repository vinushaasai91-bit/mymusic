// ============================================================
// Lyrics Vault — Auth
// ============================================================
const Auth = (() => {
  let currentUser = null;

  async function init(onChange) {
    const { data } = await supabaseClient.auth.getSession();
    currentUser = data.session ? data.session.user : null;
    onChange(currentUser);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      currentUser = session ? session.user : null;
      onChange(currentUser);
    });
  }

  async function signIn(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  async function signOut() {
    await supabaseClient.auth.signOut();
  }

  async function sendPasswordReset(email) {
    const redirectTo = window.location.origin + window.location.pathname + "?reset=1";
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async function updatePassword(newPassword) {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  function getUser() {
    return currentUser;
  }

  return { init, signIn, signOut, sendPasswordReset, updatePassword, getUser };
})();
