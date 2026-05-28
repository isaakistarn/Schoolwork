/* global React, Icon */

/* ============================================================
   Auth — Supabase-backed account system, tiers, login screen,
   and the entrance/splash animation.

   Credentials are validated against Supabase (bcrypt server-side,
   UNIQUE email constraint on auth.users). The local accounts list
   in localStorage is now just a per-device index that maps a
   stable local id → Supabase user id, so all the existing
   account-scoped data keys (schoolwork:data:<id>:…) keep working.
   ============================================================ */

const Auth = (() => {
  const { createContext, useContext, useState, useEffect, useCallback, useRef } = React;

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
    inApp: true,
    calendarSync: false,
    leadTimeHours: 24,
    digest: "morning",
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

  const normalizeEmail = (e) => (e || "").trim().toLowerCase();
  const limitsFor = (tier) => (tier === "unlimited" ? UNLIMITED_LIMITS : FREE_LIMITS);

  /* ---- Supabase client (singleton) ---- */
  const supabaseConfig = (typeof window !== "undefined" && window.schoolworkAPI && window.schoolworkAPI.supabaseConfig) || null;
  const supabaseClient = (() => {
    if (!supabaseConfig || !window.supabase) return null;
    try {
      return window.supabase.createClient(supabaseConfig.url, supabaseConfig.key, {
        auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage },
      });
    } catch { return null; }
  })();

  async function fetchTier(userId) {
    if (!supabaseClient) return "free";
    try {
      const { data } = await supabaseClient
        .from("profiles")
        .select("tier")
        .eq("id", userId)
        .maybeSingle();
      return (data && data.tier === "unlimited") ? "unlimited" : "free";
    } catch { return "free"; }
  }

  const AuthCtx = createContext(null);

  const AuthProvider = ({ children }) => {
    const [accounts, setAccounts] = useState(() => readJSON(LS.accounts, []));
    const [session, setSession]   = useState(() => readJSON(LS.session, null));
    const [bootstrapped, setBootstrapped] = useState(false);

    useEffect(() => writeJSON(LS.accounts, accounts), [accounts]);
    useEffect(() => writeJSON(LS.session, session), [session]);

    /* On first paint, reconcile the local session with Supabase. If Supabase
       has no session, we drop any stale local session — there's no offline
       sign-in path. If Supabase has one, we find or create the matching
       local account record and point the session at it. */
    useEffect(() => {
      let cancelled = false;
      (async () => {
        if (!supabaseClient) { setBootstrapped(true); return; }
        const { data } = await supabaseClient.auth.getSession();
        const sbSession = data && data.session;
        if (cancelled) return;
        if (!sbSession) {
          if (session) setSession(null);
        } else {
          const user = sbSession.user;
          const tier = await fetchTier(user.id);
          if (cancelled) return;
          linkOrCreateLocalAccount(user, tier);
        }
        setBootstrapped(true);
      })();
      return () => { cancelled = true; };
      // run once
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Given a Supabase user, find the matching local account (by
       supabaseUserId first, then by email — that's how isaak.simpson's
       pre-existing local data gets linked on his first cloud login).
       Falls through to creating a fresh local account record. */
    function linkOrCreateLocalAccount(user, tier, signupExtras) {
      const email = normalizeEmail(user.email);
      setAccounts(list => {
        let next = list;
        let match = list.find(a => a.supabaseUserId === user.id)
                 || list.find(a => normalizeEmail(a.email) === email);
        if (match) {
          next = list.map(a => a.id === match.id
            ? { ...a, email, supabaseUserId: user.id, tier, ...(signupExtras || {}) }
            : a);
        } else {
          match = {
            id: "U-" + Date.now().toString(36),
            name: (signupExtras && signupExtras.name) || email.split("@")[0],
            email,
            school: (signupExtras && signupExtras.school) || "generic",
            supabaseUserId: user.id,
            tier,
            createdAt: new Date().toISOString(),
          };
          next = [...list, match];
        }
        setSession({ accountId: match.id });
        return next;
      });
    }

    const signup = useCallback(async ({ name, email, password, school }) => {
      if (!supabaseClient) return { ok: false, error: "Cloud auth isn't configured on this build." };
      const em = normalizeEmail(email);
      if (!em || !password) return { ok: false, error: "Email and password are required." };
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { ok: false, error: "Enter a valid email address." };
      if (password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };

      const { data, error } = await supabaseClient.auth.signUp({ email: em, password });
      if (error) {
        // Supabase returns a generic message on duplicate email; normalise it.
        const msg = /already registered|already exists/i.test(error.message)
          ? "An account with that email already exists. Sign in instead."
          : error.message;
        return { ok: false, error: msg };
      }
      if (!data.user) return { ok: false, error: "Check your email to confirm your account, then sign in." };

      const tier = await fetchTier(data.user.id);
      linkOrCreateLocalAccount(data.user, tier, { name: (name || "").trim() || undefined, school });
      return { ok: true };
    }, []);

    const login = useCallback(async ({ email, password }) => {
      if (!supabaseClient) return { ok: false, error: "Cloud auth isn't configured on this build." };
      const em = normalizeEmail(email);
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email: em, password });
      if (error) {
        // Common case after the cloud-auth upgrade: a local-only account for
        // this email exists but the user hasn't signed up to Supabase yet.
        const hasLocalLegacy = accounts.some(a => normalizeEmail(a.email) === em && !a.supabaseUserId);
        if (hasLocalLegacy && /invalid login/i.test(error.message)) {
          return { ok: false, error: "This account hasn't been moved to the cloud yet. Use “Create an account” below with the same email to link your existing data." };
        }
        return { ok: false, error: /invalid login/i.test(error.message) ? "Incorrect email or password." : error.message };
      }
      const tier = await fetchTier(data.user.id);
      linkOrCreateLocalAccount(data.user, tier);
      return { ok: true };
    }, [accounts]);

    const logout = useCallback(async () => {
      try { if (supabaseClient) await supabaseClient.auth.signOut(); } catch {}
      setSession(null);
    }, []);

    const account = session ? accounts.find(a => a.id === session.accountId) || null : null;

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
      bootstrapped,
      cloudConfigured: !!supabaseClient,
    };
    return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
  };

  const useAuth = () => useContext(AuthCtx);

  /* ============================================================
     Splash — entrance animation. Plays once, then reveals children.
     ============================================================ */
  const Splash = ({ children }) => {
    const [phase, setPhase] = useState("intro");
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
    const { login, signup, cloudConfigured } = useAuth();
    const [mode, setMode] = useState("login");
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [show, setShow] = useState(false);
    const [legal, setLegal] = useState(null);
    const [school, setSchool] = useState("generic");
    const SCHOOLS = (window.SchoolworkData && window.SchoolworkData.SCHOOLS) || [];

    const submit = async (e) => {
      e.preventDefault();
      if (busy) return;
      setError("");
      setBusy(true);
      try {
        const res = mode === "login"
          ? await login({ email, password })
          : await signup({ name, email, password, school });
        if (!res.ok) setError(res.error);
      } finally {
        setBusy(false);
      }
    };

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
          <div className="auth-foot">Cloud-backed sign-in · your work stays on this device</div>
        </div>

        <div className="auth-main">
          <form className="auth-card" onSubmit={submit}>
            <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="auth-card-sub">
              {mode === "login" ? "Sign in to your study workspace." : "Set up a cloud account to get started."}
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

            {!cloudConfigured && (
              <div className="auth-error" role="alert"><Icon name="circle-warn" size={14} /> Cloud auth isn't configured on this build. Contact the developer.</div>
            )}
            {error && <div className="auth-error" role="alert"><Icon name="circle-warn" size={14} /> {error}</div>}

            <button className="btn btn-primary auth-submit" type="submit" disabled={busy || !cloudConfigured}>
              {busy ? (mode === "login" ? "Signing in…" : "Creating account…") : (mode === "login" ? "Sign in" : "Create account")}
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

  return { AuthProvider, useAuth, Splash, LoginScreen, FREE_LIMITS };
})();

window.Auth = Auth;
