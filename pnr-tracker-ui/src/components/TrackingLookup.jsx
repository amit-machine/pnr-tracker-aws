import { useState } from "react";
import { getTrackingRequest } from "../services/pnrApi";
import { statusLabel, stopReasonLabel } from "../utils/pnrUtils";

const TRACKING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function TrackingLookup() {
  const [trackingId, setTrackingId] = useState("");
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValidTrackingId = TRACKING_ID_PATTERN.test(trackingId.trim());

  const handleLookup = async () => {
    setError("");
    setTracking(null);

    if (!isValidTrackingId) {
      setError("Please enter a valid tracking ID.");
      return;
    }

    try {
      setLoading(true);

      const data = await getTrackingRequest(trackingId.trim());

      setTracking(data);
    } catch (error) {
      console.error("Failed to fetch tracking request:", error);
      setError(
        error.message || "Unable to fetch tracking request. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tracking-lookup">
      <div className="form-group">
        <label htmlFor="trackingId">Tracking ID</label>

        <input
          id="trackingId"
          type="text"
          value={trackingId}
          onChange={(e) => setTrackingId(e.target.value)}
          placeholder="Paste the tracking ID you were given"
        />
      </div>

      <button
        className="primary-button"
        onClick={handleLookup}
        disabled={!isValidTrackingId || loading}
      >
        {loading ? "Checking..." : "Check Tracking Request"}
      </button>

      {error && <p className="error-message">{error}</p>}

      {tracking && (
        <div className="tracking-lookup-result">
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
      )}
    </div>
  );
}

export default TrackingLookup;
