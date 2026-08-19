import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IaService } from './ia.service';
import { AlimentosService } from '../alimentos/alimentos.service';
import { DiarioService } from '../diario/diario.service';
import { InterpretarTextoDto, LerRotuloDto } from '../comum/dtos';
import { JwtGuard } from '../auth/jwt.guard';
import { UsuarioAtual } from '../auth/usuario.decorator';
import { hojeSP } from '../comum/data';

@ApiTags('ia')
@Controller('ia')
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class IaController {
  constructor(
    private readonly ia: IaService,
    private readonly alimentos: AlimentosService,
    private readonly diario: DiarioService,
  ) {}

  @Get('status')
  status() {
    return { disponivel: this.ia.disponivel };
  }

  @Post('interpretar')
  @ApiOperation({
    summary: 'Interpreta "comi arroz, feijão e um bife" e devolve candidatos da base',
  })
  async interpretar(@Body() dto: InterpretarTextoDto) {
    const leitura = await this.ia.interpretarRefeicao(dto.texto);

    // A IA identifica; quem dá o número é a base verificada.
    const itens = await Promise.all(
      leitura.itens.map(async (item) => ({
        ...item,
        candidatos: (await this.alimentos.buscar(item.termoBusca, 5)).map((a) => ({
          id: a.id, nome: a.nome, modoPreparo: a.modoPreparo, fonte: a.fonte,
          porcoes: this.alimentos.porcoesComMacros(a),
          macros: this.alimentos.calcularPorGramas(a, item.gramasEstimadas),
        })),
      })),
    );

    return {
      itens,
      observacao: leitura.observacao,
      aviso:
        'Os pesos são estimativa. Confirme na balança — os valores nutricionais vêm da base, não da IA.',
    };
  }

  @Post('prato')
  @ApiOperation({
    summary: 'Foto do prato: a IA identifica os alimentos, você confirma o peso',
  })
  async prato(@Body() dto: LerRotuloDto) {
    const leitura = await this.ia.verPrato(dto.imagemBase64, dto.tipoMime);

    // A IA identifica; quem dá o número é a base verificada.
    const itens = await Promise.all(
      leitura.itens.map(async (item) => {
        const termo = `${item.termoBusca} ${item.modoPreparo ?? ''}`.trim();

        // A busca por sinônimo pode devolver algo distante quando o termo é
        // uma descrição composta ("purê de batata com molho de cogumelos").
        // Nesse caso vale mais tentar o primeiro substantivo sozinho.
        let achados = await this.alimentos.buscar(termo, 5);
        const primeiraPalavra = item.termoBusca.split(/\s+/)[0];
        if (achados.length === 0 && primeiraPalavra.length >= 4) {
          achados = await this.alimentos.buscar(primeiraPalavra, 5);
        }

        return {
          ...item,
          candidatos: achados.map((a) => ({
            id: a.id,
            nome: a.nome,
            modoPreparo: a.modoPreparo,
            fonte: a.fonte,
            porcoes: this.alimentos.porcoesComMacros(a),
            macros: this.alimentos.calcularPorGramas(a, item.gramasEstimadas),
          })),
        };
      }),
    );

    return {
      itens,
      observacao: leitura.observacao,
      aviso:
        'A foto identifica os alimentos; confira se o nome bateu e ajuste a ' +
        'quantidade. A estimativa de peso costuma vir baixa, e os valores ' +
        'nutricionais vêm da tabela, não da foto.',
    };
  }

  @Post('rotulo')
  @ApiOperation({ summary: 'Lê a tabela nutricional de uma foto de rótulo' })
  async rotulo(@Body() dto: LerRotuloDto) {
    const lido = await this.ia.lerRotulo(dto.imagemBase64, dto.tipoMime);
    const coerencia =
      lido.kcal100g !== null &&
      lido.proteina100g !== null &&
      lido.carboidrato100g !== null &&
      lido.gordura100g !== null
        ? this.alimentos.validarCoerencia({
            kcal100g: lido.kcal100g,
            proteina100g: lido.proteina100g,
            carboidrato100g: lido.carboidrato100g,
            gordura100g: lido.gordura100g,
          })
        : null;
    return { ...lido, coerencia };
  }

  @Get('comentar-dia')
  @ApiOperation({ summary: 'Comentário descritivo do dia, sem linguagem de culpa' })
  async comentarDia(@UsuarioAtual() u: { id: string }, @Query('data') data?: string) {
    const resumo = await this.diario.resumoDia(u.id, data ?? hojeSP());
    if (!resumo.meta) return { erro: 'Defina suas metas primeiro.' };

    const itens = resumo.refeicoes
      .flatMap((r) => r.itens ?? [])
      .map((i) => `${i.alimentoNome} ${i.gramas}g`);

    return {
      comentario: await this.ia.comentarDia({
        totais: resumo.totais as unknown as Record<string, number>,
        meta: {
          calorias: resumo.meta.calorias,
          proteinaG: resumo.meta.proteinaG,
          carboidratoG: resumo.meta.carboidratoG,
          gorduraG: resumo.meta.gorduraG,
        },
        itens,
      }),
    };
  }
}
