# Claude Code OS — Kit Ratos de IA

Este repositório é o kit de boas-vindas do curso Claude Code OS.

Se você acabou de clonar esse repositório, rode `/setup` agora.
O setup vai te fazer algumas perguntas e configurar tudo pro seu negócio em poucos minutos.

---

<!-- Este arquivo será atualizado pelo /setup com o contexto do seu negócio. -->

## Criação de skills

Quando o usuário pedir pra criar uma nova skill:

1. Perguntar: "Essa skill é específica pra esse projeto ou vai ser útil em qualquer projeto?"
   - Específica desse negócio → salvar em `.claude/skills/` (local)
   - Útil em qualquer projeto → salvar em `~/.claude/skills/` (global)
2. Ler `_memoria/empresa.md` e `_memoria/preferencias.md` pra calibrar o conteúdo da skill ao contexto do negócio
3. Seguir o fluxo da skill-creator nativa do Claude Code
