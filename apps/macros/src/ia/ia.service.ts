import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

const MODELO = 'claude-sonnet-5';

/**
 * Camada de IA.
 *
 * Duas regras que valem pra tudo aqui:
 *
 * 1. A IA NUNCA define meta de macro. Isso é conta fechada, feita pelo
 *    CalculoService, e a pessoa precisa conseguir refazer no papel. A IA
 *    interpreta linguagem e organiza informação — não arbitra número.
 *
 * 2. A IA nunca chuta valor nutricional. Ela identifica o que a pessoa
 *    comeu e devolve a busca; quem tem o número é a base TACO/TBCA.
 *    Chutar macro é o erro que o método inteiro combate.
 *
 * Por isso NÃO existe aqui "aponte a câmera pro prato e receba as calorias".
 * Medição do NIH/NIDDK (NUTRITION 2026) com 102 refeições pesadas a 0,1 g:
 * Cal AI errou -345 kcal por refeição, Lose It! -333, MyFitnessPal -327,
 * todos subestimando. O erro não é aleatório, é enviesado pra baixo — não se
 * dilui ao longo da semana, acumula, e come o déficit inteiro sem a pessoa
 * perceber. Prato brasileiro é o pior caso: comida não-ocidental perde 25-30%
 * de acurácia e prato misto amorfo (arroz, feijão e mistura juntos) cai de
 * 95% pra 65-75% de reconhecimento.
 *
 * Foto de RÓTULO é outra coisa e está liberada: ali existe um número impresso
 * pra ler, não um volume pra adivinhar.
 */
@Injectable()
export class IaService {
  private readonly log = new Logger(IaService.name);
  private readonly cliente: Anthropic | null;

  constructor() {
    const chave = process.env.ANTHROPIC_API_KEY;
    this.cliente = chave ? new Anthropic({ apiKey: chave }) : null;
    if (!chave) {
      this.log.warn('ANTHROPIC_API_KEY ausente — recursos de IA ficam desligados.');
    }
  }

  get disponivel(): boolean {
    return this.cliente !== null;
  }

  private async perguntar(sistema: string, usuario: string, maxTokens = 1500): Promise<string> {
    if (!this.cliente) throw new Error('IA indisponível: configure ANTHROPIC_API_KEY.');
    const r = await this.cliente.messages.create({
      model: MODELO,
      max_tokens: maxTokens,
      system: sistema,
      messages: [{ role: 'user', content: usuario }],
    });
    return r.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
  }

  /** Extrai JSON de uma resposta, tolerando cercas de markdown em volta. */
  private extrairJson<T>(texto: string): T {
    const limpo = texto.replace(/^```(?:json)?/gm, '').replace(/```$/gm, '').trim();
    const inicio = Math.min(
      ...[limpo.indexOf('{'), limpo.indexOf('[')].filter((i) => i >= 0),
    );
    const fim = Math.max(limpo.lastIndexOf('}'), limpo.lastIndexOf(']'));
    return JSON.parse(limpo.slice(inicio, fim + 1)) as T;
  }

  /**
   * Interpreta uma frase solta ("almocei arroz, feijão e um bife") e devolve
   * itens com termo de busca e peso estimado em gramas.
   *
   * O peso vem marcado como estimativa justamente pra pessoa confirmar:
   * a balança é que manda, a IA só adianta o trabalho de digitação.
   */
  async interpretarRefeicao(texto: string): Promise<{
    itens: { termoBusca: string; gramasEstimadas: number; modoPreparo: string; confianca: string }[];
    observacao: string | null;
  }> {
    const sistema = `Você interpreta descrições de refeições em português brasileiro e devolve itens estruturados para busca numa base de alimentos.

REGRAS:
- NUNCA invente valores nutricionais (calorias, proteína, carboidrato, gordura). Seu trabalho é só identificar o alimento e estimar o peso.
- Sempre indique o modo de preparo, porque ele muda o alimento: cru, cozido, grelhado, frito, assado, refogado, industrializado.
- Estime gramas usando porções caseiras brasileiras: colher de servir de arroz ~45 g, concha de feijão ~80 g, filé de frango médio ~120 g, fatia de pão de forma ~25 g, pão francês ~50 g.
- "confianca" é "alta" quando a pessoa deu quantidade explícita, "media" quando deu porção caseira, "baixa" quando não deu nada e você chutou pela porção típica.
- Responda SOMENTE com JSON válido, sem texto em volta.

FORMATO:
{"itens":[{"termoBusca":"arroz branco","gramasEstimadas":90,"modoPreparo":"cozido","confianca":"media"}],"observacao":null}

Em "observacao", avise se algo ficou ambíguo demais pra estimar. Não faça julgamento sobre a comida — nenhuma comida é boa ou ruim aqui.`;

    const resposta = await this.perguntar(sistema, texto);
    return this.extrairJson(resposta);
  }

  /**
   * Lê a foto de um rótulo nutricional e extrai a tabela.
   *
   * Rótulo é fonte legítima (é o fabricante declarando), diferente de chutar
   * o macro de um prato pela aparência.
   */
  async lerRotulo(imagemBase64: string, tipoMime = 'image/jpeg'): Promise<{
    nome: string | null;
    porcaoG: number | null;
    kcal100g: number | null;
    proteina100g: number | null;
    carboidrato100g: number | null;
    gordura100g: number | null;
    fibra100g: number | null;
    gorduraSaturada100g: number | null;
    avisos: string[];
  }> {
    if (!this.cliente) throw new Error('IA indisponível: configure ANTHROPIC_API_KEY.');

    const r = await this.cliente.messages.create({
      model: MODELO,
      max_tokens: 1200,
      system: `Você lê tabelas nutricionais de rótulos brasileiros e converte tudo para valores POR 100 g.

REGRAS:
- Rótulos no Brasil normalmente declaram por porção. Converta para 100 g e diga a porção original em "porcaoG".
- Se um campo não aparece no rótulo, devolva null. NUNCA chute.
- Se a imagem estiver ilegível em algum ponto, liste isso em "avisos".
- Responda SOMENTE com JSON válido.

FORMATO:
{"nome":"...","porcaoG":30,"kcal100g":400,"proteina100g":10,"carboidrato100g":60,"gordura100g":12,"fibra100g":3,"gorduraSaturada100g":2,"avisos":[]}`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: tipoMime as 'image/jpeg', data: imagemBase64 } },
            { type: 'text', text: 'Extraia a tabela nutricional deste rótulo.' },
          ],
        },
      ],
    });

    const texto = r.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');
    return this.extrairJson(texto);
  }

  /**
   * Comentário sobre o dia — descritivo, nunca corretivo.
   *
   * A diferença que importa: "faltam 40 g de proteína, um filé resolve" ensina;
   * "você estourou as calorias" só produz culpa e faz a pessoa parar de registrar.
   */
  async comentarDia(dados: {
    totais: Record<string, number>;
    meta: Record<string, number>;
    itens: string[];
  }): Promise<string> {
    const sistema = `Você comenta o dia alimentar de alguém que acompanha macros. Fale em português brasileiro, informal e direto, como um amigo que entende do assunto.

REGRAS INEGOCIÁVEIS:
- NUNCA chame comida de porcaria, lixo, besteira, "comida de verdade", suja ou limpa. Comida é comida.
- NUNCA use linguagem de culpa, punição ou moralização. Nada de "você exagerou", "precisa compensar", "foi mal hoje".
- Se a pessoa passou da meta, trate como informação, não como falha. Um dia não define nada.
- Aponte o que é útil: proteína que ficou pra trás, fibra baixa, e o que resolveria na prática.
- Elogie o que foi bem feito.
- Máximo 4 frases. Sem bullet points, sem travessão.`;

    const usuario = `Meta: ${JSON.stringify(dados.meta)}
Consumido: ${JSON.stringify(dados.totais)}
Itens do dia: ${dados.itens.join(', ')}`;

    return this.perguntar(sistema, usuario, 500);
  }

  /**
   * Explica um ajuste de meta em linguagem simples.
   *
   * O ajuste em si já foi decidido pela regra determinística — a IA só traduz
   * o porquê, pra pessoa entender em vez de obedecer.
   */
  async explicarAjuste(dados: {
    metaAnterior: Record<string, number>;
    metaNova: Record<string, number>;
    motivo: string;
  }): Promise<string> {
    const sistema = `Você explica, em português brasileiro informal e direto, por que as metas de macro de alguém mudaram.

REGRAS:
- A proteína não se mexe em ajuste de platô. Se ela ficou igual, diga isso e explique: é o macro estrutural.
- Explique que carboidrato é o macro de ajuste, e que cardio é a outra alavanca.
- Nada de culpa. Estagnar é parte do processo, não fracasso.
- Máximo 4 frases. Sem bullet points, sem travessão.`;

    return this.perguntar(sistema, JSON.stringify(dados), 500);
  }
}
