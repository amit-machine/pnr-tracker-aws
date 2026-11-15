import { formatJourneyDateTime, statusLabel, stopReasonLabel } from "../utils/pnrUtils";

function TrackingResult({ tracking }) {
  const departure = formatJourneyDateTime(tracking.journeyDate);

  return (
    <div className="tracking-lookup-result">
      <div className="status-header">
        <div>
          <span className="section-label">PNR</span>
          <h3>{tracking.pnr}</h3>
        </div>

        {tracking.active && <span className="status-badge">Active</span>}
      </div>

      <div className="journey-card">
        <h3>
          {tracking.trainNumber || "Not available"} -{" "}
          {tracking.trainName || "Not available"}
        </h3>

        {(tracking.source || tracking.destination) && (
          <p>
            {tracking.source || "Not available"} →{" "}
            {tracking.destination || "Not available"}
          </p>
        )}

        {departure && <span>Departs {departure}</span>}
      </div>

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
                {passenger.berthNo ? `Berth ${passenger.berthNo}` : "No berth"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TrackingResult;
