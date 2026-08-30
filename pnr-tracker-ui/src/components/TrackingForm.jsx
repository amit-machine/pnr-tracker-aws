import { useState } from "react";
import { startPnrTracking } from "../services/pnrApi";

function TrackingForm({ pnr }) {
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleStartTracking = async () => {
    setEmailTouched(true);
    setError("");

    if (!isValidEmail) {
      return;
    }

    try {
      setLoading(true);

      const result = await startPnrTracking(pnr, email);

      console.log("PNR tracking created:", result);

      setTracking(true);
    } catch (error) {
      console.error("Failed to start PNR tracking:", error);

      setError(
        error.message || "Unable to start PNR tracking. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    setTracking(false);
    setError("");
  };

  return (
    <section className="tracking-section">
      <div className="tracking-content">
        <span className="tracking-icon">🔔</span>

        <div>
          <h3>Want updates on this PNR?</h3>

          <p>Get an email when your booking status changes.</p>
        </div>
      </div>

      {!tracking ? (
        <div className="tracking-form">
          <div className="email-field">
            <input
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              onBlur={() => setEmailTouched(true)}
              placeholder="Enter your email address"
              aria-invalid={emailTouched && !isValidEmail}
              disabled={loading}
            />

            {emailTouched && email && !isValidEmail && (
              <p className="field-error">Please enter a valid email address.</p>
            )}

            {error && <p className="field-error">{error}</p>}
          </div>

          <button
            className="primary-button"
            onClick={handleStartTracking}
            disabled={!isValidEmail || loading}
          >
            {loading ? "Starting..." : "Track PNR"}
          </button>
        </div>
      ) : (
        <div className="tracking-success">
          ✓ Tracking request created for <strong>{email}</strong>
          <p>
            Please check your email for the Amazon SNS confirmation message.
          </p>
          <p>
            <strong>Can't find it?</strong> Check your Spam or Junk folder.
          </p>
          <p>
            You must confirm the subscription before PNR updates can be
            delivered.
          </p>
        </div>
      )}
    </section>
  );
}

export default TrackingForm;
