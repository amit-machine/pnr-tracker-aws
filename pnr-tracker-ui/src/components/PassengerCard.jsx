function PassengerCard({ passenger }) {
  const { current } = passenger;

  return (
    <div className="passenger-card">
      <div>
        <h4>{passenger.serialNumber}</h4>

        <span className="passenger-details">{current.details}</span>
      </div>

      <div className="passenger-status">
        <strong>{current.status}</strong>

        <span>
          {current.coach || "Not assigned"}
          {" • "}
          {current.berthNo ? `Berth ${current.berthNo}` : "No berth"}
        </span>
      </div>
    </div>
  );
}

export default PassengerCard;
