import PassengerCard from "./PassengerCard";

function PnrStatus({ status }) {
  return (
    <section className="status-section">
      <div className="status-header">
        <div>
          <span className="section-label">PNR STATUS</span>
          <h2>{status.pnr}</h2>
        </div>

        <span className="status-badge">
          {status.chart?.status || "Not available"}
        </span>
      </div>

      <div className="journey-card">
        <h3>
          {status.train?.number || "Not available"} -{" "}
          {status.train?.name || "Not available"}
        </h3>

        <p>
          {status.journey?.source?.name || "Not available"} →{" "}
          {status.journey?.destination?.name || "Not available"}
        </p>

        <span>{status.journey?.dateOfJourney || "Not available"}</span>
      </div>

      <div className="journey-details">
        <div className="detail-card">
          <span>Class</span>
          <strong>{status.journey?.class || "Not available"}</strong>
        </div>

        <div className="detail-card">
          <span>Quota</span>
          <strong>{status.journey?.quota || "Not available"}</strong>
        </div>

        <div className="detail-card">
          <span>Distance</span>
          <strong>
            {status.journey?.distance ? `${status.journey.distance} km` : "Not available"}
          </strong>
        </div>
      </div>

      <div className="passengers-section">
        <h3>Passengers</h3>

        <div className="passenger-list">
          {(status.passengers || []).map((passenger, index) => (
            <PassengerCard
              key={passenger.serialNumber || index}
              passenger={passenger}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default PnrStatus;
