import { useState } from "react";
import { listTrackingsByEmail } from "../services/pnrApi";
import { statusLabel, stopReasonLabel } from "../utils/pnrUtils";
import { isValidEmail } from "../utils/validation";
import FormField from "./FormField";

function EmailTrackingList() {
  const [email, setEmail] = useState("");
  const [trackings, setTrackings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const emailValid = isValidEmail(email.trim());

  const handleLookup = async () => {
    setError("");
    setTrackings(null);

    if (!emailValid) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);

      const data = await listTrackingsByEmail(email.trim());

      setTrackings(data.items);
    } catch (error) {
      console.error("Failed to list trackings:", error);
      setError(
        error.message || "Unable to fetch trackings. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tracking-lookup">
      <FormField
        id="listEmail"
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email used when tracking was started"
      />

      <button
        className="primary-button"
        onClick={handleLookup}
        disabled={!emailValid || loading}
      >
        {loading ? "Checking..." : "Show My Trackings"}
      </button>

      {error && <p className="error-message">{error}</p>}

      {trackings && trackings.length === 0 && (
        <p>No tracking requests found for this email.</p>
      )}

      {trackings &&
        trackings.map((tracking) => (
          <div className="tracking-lookup-result" key={tracking.trackingId}>
            <div className="status-header">
              <div>
                <span className="section-label">PNR</span>
                <h3>{tracking.pnr}</h3>
              </div>

              <span className="status-badge">
                {tracking.active ? "Active" : "Stopped"}
              </span>
            </div>

            <p>
              {tracking.trainNumber || "Not available"} -{" "}
              {tracking.trainName || "Not available"}
            </p>

            {!tracking.active && stopReasonLabel(tracking.stopReason) && (
              <p>Tracking stopped: {stopReasonLabel(tracking.stopReason)}</p>
            )}

            <p>Chart: {tracking.lastStatus?.chart || "Not available"}</p>

            <div className="passenger-list">
              {(tracking.lastStatus?.passengers || []).map((passenger) => (
                <div className="passenger-card" key={passenger.serialNumber}>
                  <div>
                    <h4>{passenger.serialNumber || "Passenger"}</h4>
                    <span className="passenger-details">
                      {passenger.details || "Not available"}
                    </span>
                  </div>

                  <div className="passenger-status">
                    <strong>{statusLabel(passenger.status)}</strong>

                    <span>
                      {passenger.coach || "Not assigned"}
                      {" • "}
                      {passenger.berthNo
                        ? `Berth ${passenger.berthNo}`
                        : "No berth"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}

export default EmailTrackingList;
