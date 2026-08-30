import { useState } from "react";

function TrackingForm({ pnr }) {
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [tracking, setTracking] = useState(false);

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleStartTracking = () => {
    setEmailTouched(true);

    if (!isValidEmail) {
      return;
    }

    console.log("Start tracking:", {
      pnr,
      email,
    });

    setTracking(true);
  };

  const handleEmailChange = (e) => {
    setEmail(e.target.value);
    setTracking(false);
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
            />

            {emailTouched && email && !isValidEmail && (
              <p className="field-error">Please enter a valid email address.</p>
            )}
          </div>

          <button
            className="secondary-button"
            onClick={handleStartTracking}
            disabled={!isValidEmail}
          >
            Track PNR
          </button>
        </div>
      ) : (
        <div className="tracking-success">
          ✓ Tracking enabled for <strong>{email}</strong>
        </div>
      )}
    </section>
  );
}

export default TrackingForm;
