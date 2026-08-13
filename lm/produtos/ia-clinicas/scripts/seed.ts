// Cria a clinica-demo pra tu ver rodando na hora. Roda: npm run seed
import {
  upsertClinica,
  upsertProfissional,
  addHorario,
  upsertInstancia,
  getOuCriaPaciente,
  criarConsulta,
} from "../lib/db";
import { toISO } from "../lib/agenda";

async function main() {
// nao forcamos id: no Postgres a coluna e uuid e o banco gera sozinho.
// (no SQLite tambem funciona — o upsert cria um uuid quando id vem vazio)
const clinica = await upsertClinica({
  nome: "Clinica Comtato",
  endereco: "Av. Central, 1000 - Centro",
  convenios: "Unimed, Bradesco Saude, particular",
  precos: "Consulta particular R$300. Retorno gratis em ate 15 dias.",
  faq: "Funcionamento: seg a sex, 8h as 18h. Tem estacionamento no local. Chegar 15min antes na primeira consulta. Trazer documento e carteirinha do convenio.",
  tom_de_voz: "informal, acolhedor e direto",
  link_review: "https://g.page/r/clinica-comtato/review",
});

// dois profissionais
const drAna = await upsertProfissional({
  clinica_id: clinica.id,
  nome: "Dra. Ana Ribeiro",
  especialidade: "Dermatologia",
  duracao_min: 30,
});
const drJoao = await upsertProfissional({
  clinica_id: clinica.id,
  nome: "Dr. Joao Mendes",
  especialidade: "Clinico Geral",
  duracao_min: 40,
});

// grade: seg a sex, 08-12 e 14-18
for (const dia of [1, 2, 3, 4, 5]) {
  for (const prof of [drAna, drJoao]) {
    await addHorario({ profissional_id: prof.id, dia_semana: dia, hora_inicio: "08:00", hora_fim: "12:00" });
    await addHorario({ profissional_id: prof.id, dia_semana: dia, hora_inicio: "14:00", hora_fim: "18:00" });
  }
}

// instancia de whats (demo — sem uazapi real conectada)
await upsertInstancia({
  clinica_id: clinica.id,
  nome: "Recepcao",
  numero: "5535999990000",
  uazapi_instance: "comtato-recepcao",
  uazapi_token: "demo-token-comtato",
  status: "conectado",
});

// uma consulta pra amanha (pra regua D-1 ter o que confirmar no teste)
const amanha = new Date();
amanha.setDate(amanha.getDate() + 1);
amanha.setHours(10, 0, 0, 0);
const inicio = toISO(amanha);
const fim = new Date(amanha);
fim.setMinutes(fim.getMinutes() + 30);

const pac = await getOuCriaPaciente(clinica.id, "5535988887777", "Maria Teste");
await criarConsulta({
  clinica_id: clinica.id,
  profissional_id: drAna.id,
  paciente_id: pac.id,
  inicio,
  fim: toISO(fim),
  status: "agendada",
  origem: "manual",
});

console.log("✓ Seed pronto!");
console.log(`  Clinica: ${clinica.nome} (id: ${clinica.id})`);
console.log(`  Profissionais: ${drAna.nome}, ${drJoao.nome}`);
console.log(`  1 consulta amanha 10h (pra testar a regua D-1)`);
console.log("");
console.log("Agora roda:  npm run dev   e abre http://localhost:3100/painel");
console.log("Ou testa a IA no terminal:  npm run chat");
}

main().then(() => process.exit(0));
