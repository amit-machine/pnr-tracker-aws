import PnrForm from "./components/PnrForm";

function App() {
  return (
    <main className="pnr-page">
      <header className="page-header">
        <h1>PNR Tracker</h1>
        <p>Check your Indian Railways PNR status</p>
      </header>

      <section className="pnr-card">
        <PnrForm />
      </section>
    </main>
  );
}

export default App;
