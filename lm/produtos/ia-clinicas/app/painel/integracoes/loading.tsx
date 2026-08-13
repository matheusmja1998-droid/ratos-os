// Loading instantaneo ao navegar entre telas do painel: feedback imediato em
// vez de tela parada enquanto o server component busca os dados.
export default function Loading() {
  return (
    <main className="pagina" style={{ display: "grid", placeItems: "center", minHeight: "50vh" }}>
      <div style={{ textAlign: "center", color: "var(--muted)" }}>
        <div
          style={{
            width: 34,
            height: 34,
            margin: "0 auto 12px",
            border: "3px solid var(--border)",
            borderTopColor: "var(--accent)",
            borderRadius: "50%",
            animation: "girar .7s linear infinite",
          }}
        />
        <div style={{ fontSize: 13 }}>carregando...</div>
        <style>{`@keyframes girar { to { transform: rotate(360deg); } }`}</style>
      </div>
    </main>
  );
}
