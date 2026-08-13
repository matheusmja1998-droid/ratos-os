export const metadata = {
  title: "Prospecta — Prospecção com IA no WhatsApp",
  description: "Sua IA prospecta, qualifica e marca reunião no WhatsApp.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", background: "#0b1020", color: "#e8ecf5" }}>
        {children}
      </body>
    </html>
  );
}
