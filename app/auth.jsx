/* global React, Icon */

/* ============================================================
   Auth — local account system, tiers, rate limits, login screen,
   and the entrance/splash animation.

   This is a LOCAL desktop app, so "accounts" live in localStorage.
   Passwords are salted + hashed (djb2-xor) so they aren't stored in
   plain text — this is obfuscation, not bank-grade security. When you
   add the cloud backend (see README §4) swap LoginScreen's handlers to
   call Firebase Auth / Supabase instead.
   ============================================================ */

const Auth = (() => {
  const { createContext, useContext, useState, useEffect, useCallback, useRef } = React;

  /* ---- accounts with unlimited access ---- */
  const UNLIMITED_EMAILS = ["isaak.simpson@gmail.com", "6simpsis@nudgee.qld.edu.au"];

  /* ---- free-tier caps (per term profile) ---- */
  const FREE_LIMITS = {
    assignments: 20,
    notes: 15,
    courses: 8,
    calendars: 3,
    events: 40,
    library: 12,
    googleSyncsPerDay: 5,
  };
  const UNLIMITED_LIMITS = {
    assignments: Infinity, notes: Infinity, courses: Infinity,
    calendars: Infinity, events: Infinity, library: Infinity,
    googleSyncsPerDay: Infinity,
  };

  /* ---- account-level notification preferences ---- */
  const DEFAULT_PREFS = {
    inApp: true,          // show toasts + bell badge
    calendarSync: false,
    leadTimeHours: 24,    // "due soon" window for the notifications bell
    digest: "morning",    // morning | evening | off — controls the in-app digest
  };

  const LS = {
    accounts: "schoolwork:accounts",
    session:  "schoolwork:session",
  };

  const readJSON = (k, fallback) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  /* tiny salted hash — NOT cryptographically strong, just avoids plaintext */
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16);
  }
  function makeSalt() { return Math.random().toString(36).slice(2, 10); }

  const normalizeEmail = (e) => (e || "").trim().toLowerCase();
  const tierFor = (email) => UNLIMITED_EMAILS.includes(normalizeEmail(email)) ? "unlimited" : "free";
  const limitsFor = (tier) => (tier === "unlimited" ? UNLIMITED_LIMITS : FREE_LIMITS);

  const AuthCtx = createContext(null);

  const AuthProvider = ({ children }) => {
    const [accounts, setAccounts] = useState(() => readJSON(LS.accounts, []));
    const [session, setSession]   = useState(() => readJSON(LS.session, null));

    useEffect(() => writeJSON(LS.accounts, accounts), [accounts]);
    useEffect(() => writeJSON(LS.session, session), [session]);

    const account = session ? accounts.find(a => a.id === session.accountId) || null : null;

    const signup = useCallback(({ name, email, password, school }) => {
      const em = normalizeEmail(email);
      if (!em || !password) return { ok: false, error: "Email and password are required." };
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { ok: false, error: "Enter a valid email address." };
      if (password.length < 4) return { ok: false, error: "Password must be at least 4 characters." };
      if (accounts.some(a => a.email === em)) return { ok: false, error: "An account with that email already exists." };
      const salt = makeSalt();
      const acc = {
        id: "U-" + Date.now().toString(36),
        name: (name || em.split("@")[0]).trim(),
        email: em,
        salt,
        passHash: hash(salt + password),
        tier: tierFor(em),
        school: school || "generic",   // pre-fills term dates for the new account
        createdAt: new Date().toISOString(),
      };
      setAccounts(list => [...list, acc]);
      setSession({ accountId: acc.id });
      return { ok: true, account: acc };
    }, [accounts]);

    const login = useCallback(({ email, password }) => {
      const em = normalizeEmail(email);
      const acc = accounts.find(a => a.email === em);
      if (!acc) return { ok: false, error: "No account found for that email. Create one below." };
      if (acc.passHash !== hash(acc.salt + password)) return { ok: false, error: "Incorrect password." };
      // keep tier in sync in case the unlimited list changed
      const tier = tierFor(em);
      if (tier !== acc.tier) setAccounts(list => list.map(a => a.id === acc.id ? { ...a, tier } : a));
      setSession({ accountId: acc.id });
      return { ok: true, account: { ...acc, tier } };
    }, [accounts]);

    const logout = useCallback(() => setSession(null), []);

    const updateAccount = useCallback((patch) => {
      if (!account) return;
      setAccounts(list => list.map(a => a.id === account.id ? { ...a, ...patch } : a));
    }, [account]);

    const tier = account?.tier || "free";
    const prefs = { ...DEFAULT_PREFS, ...(account?.prefs || {}) };
    const setPrefs = (patch) => updateAccount({ prefs: { ...prefs, ...patch } });
    const value = {
      account, accounts, signup, login, logout, updateAccount,
      tier, isUnlimited: tier === "unlimited",
      limits: limitsFor(tier),
      FREE_LIMITS,
      prefs, setPrefs, DEFAULT_PREFS,
    };
    return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
  };

  const useAuth = () => useContext(AuthCtx);

  /* ============================================================
     Splash — entrance animation. Plays once, then reveals children.
     ============================================================ */
  const Splash = ({ children }) => {
    const [phase, setPhase] = useState("intro"); // intro -> done
    useEffect(() => {
      const t = setTimeout(() => setPhase("done"), 2100);
      return () => clearTimeout(t);
    }, []);
    return (
      <>
        {phase !== "done" && (
          <div className="splash" aria-hidden="true">
            <div className="splash-mark">
              <span className="splash-ring" />
              <img className="splash-logo" src="logo.svg" width="104" height="104" alt="" />
            </div>
            <div className="splash-word">Schoolwork</div>
            <div className="splash-sub">Year 12 study planner</div>
            <div className="splash-bar"><span /></div>
          </div>
        )}
        <div className={"splash-reveal" + (phase === "done" ? " in" : "")}>
          {children}
        </div>
      </>
    );
  };

  /* ============================================================
     Login / signup screen
     ============================================================ */
  const LoginScreen = () => {
    const { login, signup } = useAuth();
    const [mode, setMode] = useState("login"); // login | signup
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [show, setShow] = useState(false);
    const [legal, setLegal] = useState(null);
    const [school, setSchool] = useState("generic");
    const SCHOOLS = (window.SchoolworkData && window.SchoolworkData.SCHOOLS) || [];

    const submit = (e) => {
      e.preventDefault();
      setError("");
      const res = mode === "login" ? login({ email, password }) : signup({ name, email, password, school });
      if (!res.ok) setError(res.error);
    };

    const isUnlimitedPreview = ["isaak.simpson@gmail.com", "6simpsis@nudgee.qld.edu.au"].includes(email.trim().toLowerCase());

    return (
      <div className="auth-screen">
        <div className="auth-aside" aria-hidden="true">
          <div className="auth-brand">
            <img className="brand-img lg" src="logo.svg" width="36" height="36" alt="" aria-hidden="true" />
            <span>Schoolwork</span>
          </div>
          <h2 className="auth-tag">Every deadline, draft, and grade — in one place.</h2>
          <ul className="auth-points">
            <li><Icon name="check" size={14} /> Per-term workspaces that never bleed together</li>
            <li><Icon name="check" size={14} /> Editable classes, notes, and a real file library</li>
            <li><Icon name="check" size={14} /> Push deadlines straight to Google Calendar</li>
          </ul>
          <div className="auth-foot">Local-first · your data stays on this device</div>
        </div>

        <div className="auth-main">
          <form className="auth-card" onSubmit={submit}>
            <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="auth-card-sub">
              {mode === "login" ? "Sign in to your study workspace." : "Set up a local profile to get started."}
            </p>

            {mode === "signup" && (
              <label className="auth-field">
                <span>Name</span>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Isaak Simpson" autoFocus />
              </label>
            )}
            {mode === "signup" && SCHOOLS.length > 0 && (
              <label className="auth-field">
                <span>School</span>
                <select className="select" value={school} onChange={e => setSchool(e.target.value)}>
                  {SCHOOLS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <span style={{ fontSize: 11, color: "var(--fg-tertiary)", fontWeight: 400 }}>Pre-fills your term dates — you can edit them later in Settings.</span>
              </label>
            )}
            <label className="auth-field">
              <span>Email</span>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@school.edu.au" autoFocus={mode === "login"} />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <div className="auth-pass">
                <input className="input" type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                <button type="button" className="btn btn-tertiary btn-sm" onClick={() => setShow(s => !s)}>{show ? "Hide" : "Show"}</button>
              </div>
            </label>

            {isUnlimitedPreview && (
              <div className="auth-badge-row"><span className="badge accent">Unlimited access account</span></div>
            )}
            {error && <div className="auth-error" role="alert"><Icon name="circle-warn" size={14} /> {error}</div>}

            <button className="btn btn-primary auth-submit" type="submit">
              {mode === "login" ? "Sign in" : "Create account"}
            </button>

            <div className="auth-switch">
              {mode === "login" ? (
                <>New here? <button type="button" onClick={() => { setMode("signup"); setError(""); }}>Create an account</button></>
              ) : (
                <>Already have an account? <button type="button" onClick={() => { setMode("login"); setError(""); }}>Sign in</button></>
              )}
            </div>
            <div className="auth-legal">
              By continuing you agree to our{" "}
              <button type="button" onClick={() => setLegal("terms")}>Terms</button> and{" "}
              <button type="button" onClick={() => setLegal("privacy")}>Privacy Policy</button>.
            </div>
          </form>
        </div>
        {legal && window.Legal && <window.Legal.LegalModal doc={legal} onClose={() => setLegal(null)} />}
      </div>
    );
  };

  return { AuthProvider, useAuth, Splash, LoginScreen, UNLIMITED_EMAILS, FREE_LIMITS };
})();

window.Auth = Auth;
