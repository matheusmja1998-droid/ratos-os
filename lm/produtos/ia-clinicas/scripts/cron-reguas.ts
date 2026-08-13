// Roda as reguas na mao (confirmacao D-1 + pos-consulta). Roda: npm run cron
import { rodarTodasReguas } from "../lib/reguas";

rodarTodasReguas().then((r) => {
  console.log("Reguas executadas:", r);
  console.log(`  ${r.confirmacoes} confirmacao(oes) D-1 enviada(s)`);
  console.log(`  ${r.pos_consulta} pedido(s) de review enviado(s)`);
  process.exit(0);
});
