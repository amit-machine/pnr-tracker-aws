import { useState } from "react";
import { startPnrTracking } from "../services/pnrApi";
import { isValidEmail } from "../utils/validation";
import FormField from "./FormField";

function TrackingForm({ pnr }) {
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [trackingId, setTrackingId] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const emailValid = isValidEmail(email);

  const handleStartTracking = async () => {
    setEmailTouched(true);
    setError("");

    if (!emailValid) {
      return;
    }

    try {
      setLoading(true);

      const result = await startPnrTracking(pnr, email);

      console.log("PNR tracking created:", result);

      setTrackingId(result.trackingId);
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

  const fieldError =
    emailTouched && email && !emailValid
      ? "Please enter a valid email address."
      : error || null;

  const handleCopyTrackingId = async () => {
    try {
      await navigator.clipboard.writeText(trackingId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy tracking ID:", error);
    }
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
        <>
          <div className="tracking-form">
            <FormField
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              onBlur={() => setEmailTouched(true)}
              placeholder="Enter your email address"
              invalid={emailTouched && !emailValid}
              disabled={loading}
              error={fieldError}
              className="email-field"
            />

            <button
              className="primary-button"
              onClick={handleStartTracking}
              disabled={!emailValid || loading}
            >
              {loading ? "Starting..." : "Track PNR"}
            </button>
          </div>

          <p className="privacy-note">
            Your email is only used to send PNR status update notifications
            for this tracking request.
          </p>
        </>
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

          <div className="tracking-id-row">
            <span>
              Tracking ID: <code>{trackingId}</code>
            </span>

            <button
              type="button"
              className="secondary-button"
              onClick={handleCopyTrackingId}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          <p>Save this ID to check on this tracking request later.</p>
        </div>
      )}
    </section>
  );
}

export default TrackingForm;
