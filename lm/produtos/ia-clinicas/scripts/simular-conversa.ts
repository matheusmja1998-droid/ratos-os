// Simulador de conversa no terminal — testa a IA sem WhatsApp.
// Roda: npm run chat   (precisa do ANTHROPIC_API_KEY no ambiente)
import readline from "readline";
import { responder } from "../lib/ia";
import { listClinicas } from "../lib/db";

const clinicas = await listClinicas().catch((e) => {
  console.log("Erro ao ler clinicas:", e.message);
  process.exit(1);
});
if (clinicas.length === 0) {
  console.log("Nenhuma clinica. Roda 'npm run seed' primeiro.");
  process.exit(1);
}
const clinica = clinicas[0];
const telefone = "5535988880000"; // paciente ficticio

console.log(`\n💬 Simulando conversa com a IA da ${clinica.nome}`);
console.log("   (digite 'sair' pra encerrar)\n");
console.log("IA: Oi! Aqui e da " + clinica.nome + ". Como posso te ajudar?\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function pergunta() {
  rl.question("Voce: ", async (texto) => {
    if (texto.trim().toLowerCase() === "sair") {
      rl.close();
      return;
    }
    try {
      const { texto: resposta, passouPraHumano } = await responder({
        clinicaId: clinica.id,
        telefone,
        texto,
      });
      console.log(`\nIA: ${resposta}`);
      if (passouPraHumano) console.log("   [→ acionou atendente humano]");
      console.log("");
    } catch (e: any) {
      console.log(`\n[erro] ${e.message}\n`);
    }
    pergunta();
  });
}

pergunta();
