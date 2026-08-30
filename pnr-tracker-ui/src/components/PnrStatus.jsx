import PassengerCard from "./PassengerCard";

function PnrStatus({ status }) {
  return (
    <section className="status-section">
      <div className="status-header">
        <div>
          <span className="section-label">PNR STATUS</span>
          <h2>{status.pnr}</h2>
        </div>

        <span className="status-badge">{status.chart.status}</span>
      </div>

      <div className="journey-card">
        <h3>
          {status.train.number} - {status.train.name}
        </h3>

        <p>
          {status.journey.source.name} → {status.journey.destination.name}
        </p>

        <span>{status.journey.dateOfJourney}</span>
      </div>

      <div className="journey-details">
        <div className="detail-card">
          <span>Class</span>
          <strong>{status.journey.class}</strong>
        </div>

        <div className="detail-card">
          <span>Quota</span>
          <strong>{status.journey.quota}</strong>
        </div>

        <div className="detail-card">
          <span>Distance</span>
          <strong>{status.journey.distance} km</strong>
        </div>
      </div>

      <div className="passengers-section">
        <h3>Passengers</h3>

        <div className="passenger-list">
          {status.passengers.map((passenger) => (
            <PassengerCard key={passenger.serialNumber} passenger={passenger} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default PnrStatus;
