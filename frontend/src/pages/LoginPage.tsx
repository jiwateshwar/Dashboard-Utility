import { useEffect, useState } from "react";
import { api } from "../api";

export default function LoginPage({ onAuthed }: { onAuthed: (user: any) => void }) {
  const [step, setStep] = useState<"email" | "otp" | "signup">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ users: number; dashboards: number; tasks: number } | null>(null);

  const [signup, setSignup] = useState({ name: "", email: "", manager_id: "" });
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [signupDone, setSignupDone] = useState(false);

  useEffect(() => {
    api("/auth/stats").then(setStats).catch(() => {});
  }, []);

  async function handleEmail() {
    setError(null);
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ email }) });
      setStep("otp");
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleOtp() {
    setError(null);
    try {
      await api("/auth/verify", { method: "POST", body: JSON.stringify({ otp }) });
      const user = await api("/auth/me");
      onAuthed(user);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function openSignup() {
    setError(null);
    try {
      const data = await api("/auth/managers");
      setManagers(data);
    } catch {
      setManagers([]);
    }
    setStep("signup");
  }

  async function handleSignup() {
    setError(null);
    try {
      await api("/auth/signup", { method: "POST", body: JSON.stringify(signup) });
      setSignupDone(true);
    } catch (err: any) {
      setError(err.message);
    }
  }

  function backToLogin() {
    setStep("email");
    setSignupDone(false);
    setSignup({ name: "", email: "", manager_id: "" });
    setError(null);
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "stretch",
      background: "var(--bg)"
    }}>
      {/* ── Left panel ── */}
      <div style={{
        flex: "0 0 55%",
        background: "linear-gradient(145deg, #0f172a 0%, #1e3a5f 60%, #1d4ed8 100%)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "64px 72px",
        color: "#fff"
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 12 }}>
          MCS Leadership Tool
        </div>
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -1, lineHeight: 1.05, marginBottom: 8 }}>
          PRISM
        </div>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", marginBottom: 32, fontStyle: "italic" }}>
          Performance Reporting, Insights &amp; Status Management
        </div>

        <p style={{ fontSize: 15, lineHeight: 1.75, color: "rgba(255,255,255,0.8)", maxWidth: 480, marginBottom: 48 }}>
          PRISM is a centralised leadership dashboard platform that gives MCS teams a single, real-time view of tasks, risks, decisions, and escalations across all their programmes. It replaces fragmented spreadsheets and status emails with structured, trackable records — enabling faster decisions, clearer accountability, and proactive escalation management.
        </p>

        {/* Stats strip */}
        {stats && (
          <div style={{ display: "flex", gap: 40, marginBottom: 56 }}>
            {[
              { value: stats.users,      label: "Registered Users" },
              { value: stats.dashboards, label: "Dashboards Managed" },
              { value: stats.tasks,      label: "Tasks Tracked" }
            ].map(({ value, label }) => (
              <div key={label}>
                <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{value.toLocaleString()}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Attribution */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 24 }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>
            Built by team MCS-DSDP
          </div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>
            Sarthak &nbsp;·&nbsp; Ishita &nbsp;·&nbsp; Jiwa
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 40px"
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>

          {/* ── Login: email step ── */}
          {step === "email" && (
            <>
              <h2 style={{ marginBottom: 6 }}>Welcome back</h2>
              <p style={{ color: "var(--muted)", marginBottom: 28, fontSize: 14 }}>
                Enter your work email to sign in.
              </p>
              <input
                className="input"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEmail()}
                autoFocus
              />
              <button className="button" style={{ marginTop: 12, width: "100%" }} onClick={handleEmail}>
                Continue
              </button>
              <div style={{ marginTop: 20, textAlign: "center" }}>
                <button
                  onClick={openSignup}
                  style={{ background: "none", border: "none", color: "#1d63ed", cursor: "pointer", fontSize: 13 }}
                >
                  Don't have access? Request it →
                </button>
              </div>
            </>
          )}

          {/* ── Login: OTP step ── */}
          {step === "otp" && (
            <>
              <h2 style={{ marginBottom: 6 }}>Verify your identity</h2>
              <p style={{ color: "var(--muted)", marginBottom: 28, fontSize: 14 }}>
                Enter your employee ID for <strong>{email}</strong>.
              </p>
              <input
                className="input"
                type="password"
                placeholder="Employee ID"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleOtp()}
                autoFocus
              />
              <button className="button" style={{ marginTop: 12, width: "100%" }} onClick={handleOtp}>
                Verify &amp; Sign In
              </button>
              <button
                onClick={() => { setStep("email"); setOtp(""); setError(null); }}
                style={{ marginTop: 10, width: "100%", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}
              >
                ← Use a different email
              </button>
            </>
          )}

          {/* ── Signup step ── */}
          {step === "signup" && (
            signupDone ? (
              <>
                <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
                <h2 style={{ marginBottom: 8 }}>Request submitted</h2>
                <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
                  Your access request has been sent to the administrators. You'll be able to log in once your request is approved.
                </p>
                <button className="button secondary" style={{ width: "100%" }} onClick={backToLogin}>
                  ← Back to login
                </button>
              </>
            ) : (
              <>
                <h2 style={{ marginBottom: 6 }}>Request Access</h2>
                <p style={{ color: "var(--muted)", marginBottom: 28, fontSize: 14 }}>
                  Fill in your details. An admin will approve your request.
                </p>
                <input
                  className="input"
                  placeholder="Full name"
                  value={signup.name}
                  onChange={(e) => setSignup({ ...signup, name: e.target.value })}
                  autoFocus
                />
                <input
                  className="input"
                  placeholder="Work email"
                  value={signup.email}
                  onChange={(e) => setSignup({ ...signup, email: e.target.value })}
                  style={{ marginTop: 8 }}
                />
                <select
                  className="select"
                  value={signup.manager_id}
                  onChange={(e) => setSignup({ ...signup, manager_id: e.target.value })}
                  style={{ marginTop: 8 }}
                >
                  <option value="">Select your manager *</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button className="button" style={{ marginTop: 14, width: "100%" }} onClick={handleSignup}>
                  Submit Request
                </button>
                <button
                  onClick={backToLogin}
                  style={{ marginTop: 10, width: "100%", background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 13 }}
                >
                  ← Back to login
                </button>
              </>
            )
          )}

          {error && (
            <div style={{ marginTop: 14, padding: "10px 14px", background: "rgba(239,106,98,0.1)", border: "1px solid rgba(239,106,98,0.3)", borderRadius: 6, color: "#ef6a62", fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
