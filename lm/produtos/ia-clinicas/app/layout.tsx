import "./globals.css";
import ThemeToggle from "./ThemeToggle";

export const metadata = {
  title: "Facilita AI — Painel",
  description: "Atendimento e agenda por IA no WhatsApp pra clinicas",
};

// Roda antes do resto do body renderizar: aplica o tema salvo sem flash.
const temaScript = `try{if(localStorage.getItem("tema")==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: temaScript }} />
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
