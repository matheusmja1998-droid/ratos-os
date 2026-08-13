// Cria as contas iniciais: 1 admin (Matheus) + 1 clinica (Comtato, se existir).
// Roda: node --env-file=.env node_modules/.bin/tsx scripts/criar-contas.ts
import { getContaPorEmail, criarConta, listClinicas } from "../lib/db";
import { hashSenha } from "../lib/auth";

async function main() {
  const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || "matheus@iaclinicas.com";
  const ADMIN_SENHA = process.env.SEED_ADMIN_SENHA || "admin1234";

  // 1) conta admin
  if (!(await getContaPorEmail(ADMIN_EMAIL))) {
    await criarConta({
      email: ADMIN_EMAIL,
      senha_hash: await hashSenha(ADMIN_SENHA),
      papel: "admin",
      nome: "Matheus (admin)",
    });
    console.log(`✓ ADMIN criado: ${ADMIN_EMAIL} / senha: ${ADMIN_SENHA}`);
  } else {
    console.log(`- admin ${ADMIN_EMAIL} ja existe`);
  }

  // 2) conta pra clinica-demo (Comtato) se existir
  const clinicas = await listClinicas();
  const comtato = clinicas.find((c: any) => /comtato/i.test(c.nome)) || clinicas[0];
  if (comtato) {
    const CLIN_EMAIL = "comtato@iaclinicas.com";
    const CLIN_SENHA = "comtato123";
    if (!(await getContaPorEmail(CLIN_EMAIL))) {
      await criarConta({
        email: CLIN_EMAIL,
        senha_hash: await hashSenha(CLIN_SENHA),
        papel: "clinica",
        clinica_id: comtato.id,
        nome: comtato.nome,
      });
      console.log(`✓ CLINICA criada: ${CLIN_EMAIL} / senha: ${CLIN_SENHA} -> ${comtato.nome}`);
    } else {
      console.log(`- conta ${CLIN_EMAIL} ja existe`);
    }
  }

  console.log("\nPronto. Use o admin pra ver todas; a conta da clinica ve so a dela.");
}
main().then(() => process.exit(0)).catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
