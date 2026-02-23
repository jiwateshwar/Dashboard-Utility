import { useState } from "react";
import { api } from "../api";

export default function LoginPage({ onAuthed }: { onAuthed: (user: any) => void }) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleEmail() {
    setError(null);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setStep("otp");
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleOtp() {
    setError(null);
    try {
      await api("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ otp })
      });
      const user = await api("/auth/me");
      onAuthed(user);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="main" style={{ maxWidth: 460, margin: "0 auto" }}>
      <div className="card">
        <h2>PRISM Access</h2>
        <p style={{ color: "#9aa5b1" }}>Enter your email to receive an OTP (fixed for MVP).</p>
        {step === "email" ? (
          <>
            <input className="input" placeholder="email@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="button" style={{ marginTop: 12 }} onClick={handleEmail}>
              Continue
            </button>
          </>
        ) : (
          <>
            <input className="input" placeholder="OTP (1111)" value={otp} onChange={(e) => setOtp(e.target.value)} />
            <button className="button" style={{ marginTop: 12 }} onClick={handleOtp}>
              Verify
            </button>
          </>
        )}
        {error && <div style={{ marginTop: 12, color: "#ef6a62" }}>{error}</div>}
      </div>
    </div>
  );
}
