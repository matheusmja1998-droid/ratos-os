import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DiarioService } from './diario.service';
import { MacroAlvo, PlanejadorService } from './planejador.service';
import { MontadorService } from './montador.service';
import { MODELOS_REFEICAO, PapelPrato, tipoDaRefeicao } from './prato';
import { AlimentosService } from '../alimentos/alimentos.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from '../comum/entidades';
import { AdicionarItemDto, AtualizarGramasDto } from '../comum/dtos';
import { JwtGuard } from '../auth/jwt.guard';
import { UsuarioAtual } from '../auth/usuario.decorator';
import { hojeSP } from '../comum/data';

@ApiTags('diario')
@Controller('diario')
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class DiarioController {
  constructor(
    private readonly diario: DiarioService,
    private readonly planejador: PlanejadorService,
    private readonly alimentos: AlimentosService,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly montador: MontadorService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Painel do dia: refeições, totais e o que ainda cabe' })
  async dia(@UsuarioAtual() u: { id: string }, @Query('data') data?: string) {
    const resumo = await this.diario.resumoDia(u.id, data ?? hojeSP());
    return {
      ...resumo,
      coerencia: this.planejador.conferirCoerencia(resumo.totais),
    };
  }

  @Get('frequentes')
  @ApiOperation({ summary: 'O que você mais anota, pra registrar sem buscar' })
  frequentes(@UsuarioAtual() u: { id: string }, @Query('limite') limite?: string) {
    return this.diario.maisAnotados(u.id, limite ? Number(limite) : 12);
  }

  @Post('refeicoes')
  @ApiOperation({ summary: 'Acrescenta uma refeição ao dia' })
  adicionarRefeicao(
    @UsuarioAtual() u: { id: string },
    @Body() dto: { nome?: string },
    @Query('data') data?: string,
  ) {
    return this.diario.adicionarRefeicao(u.id, data ?? hojeSP(), dto?.nome);
  }

  @Post('refeicoes/:id/clonar')
  @ApiOperation({ summary: 'Copia os itens desta refeição para outra' })
  clonarRefeicao(
    @UsuarioAtual() u: { id: string },
    @Param('id') origemId: string,
    @Body() dto: { destinoId: string },
  ) {
    return this.diario.clonarRefeicao(u.id, origemId, dto.destinoId);
  }

  @Patch('refeicoes/:id')
  @ApiOperation({ summary: 'Renomeia uma refeição' })
  renomearRefeicao(
    @UsuarioAtual() u: { id: string },
    @Param('id') id: string,
    @Body() dto: { nome: string },
  ) {
    return this.diario.renomearRefeicao(u.id, id, dto.nome);
  }

  @Delete('refeicoes/:id')
  @ApiOperation({ summary: 'Remove uma refeição vazia do dia' })
  async removerRefeicao(@UsuarioAtual() u: { id: string }, @Param('id') id: string) {
    await this.diario.removerRefeicao(u.id, id);
    return { removida: true };
  }

  @Post('itens')
  @ApiOperation({ summary: 'Adiciona alimento à refeição (peso sempre em GRAMAS)' })
  adicionar(@UsuarioAtual() u: { id: string }, @Body() dto: AdicionarItemDto, @Query('data') data?: string) {
    return this.diario.adicionarItem({
      usuarioId: u.id,
      data: data ?? hojeSP(),
      ...dto,
    });
  }

  @Patch('itens/:id')
  atualizar(
    @UsuarioAtual() u: { id: string },
    @Param('id') id: string,
    @Body() dto: AtualizarGramasDto,
  ) {
    return this.diario.atualizarGramas(u.id, id, dto.gramas);
  }

  @Delete('itens/:id')
  async remover(@UsuarioAtual() u: { id: string }, @Param('id') id: string) {
    await this.diario.removerItem(u.id, id);
    return { removido: true };
  }

  @Get('espaco')
  @ApiOperation({ summary: 'Quanto ainda cabe hoje, por macro' })
  async espaco(@UsuarioAtual() u: { id: string }, @Query('data') data?: string) {
    const resumo = await this.diario.resumoDia(u.id, data ?? hojeSP());
    if (!resumo.meta) return { erro: 'Defina suas metas antes de planejar o dia.' };
    return this.planejador.calcularEspaco(resumo.meta, resumo.totais);
  }

  @Get('cabe/:alimentoId')
  @ApiOperation({ summary: 'Quantos gramas deste alimento ainda cabem hoje' })
  async cabe(
    @UsuarioAtual() u: { id: string },
    @Param('alimentoId') alimentoId: string,
    @Query('data') data?: string,
  ) {
    const resumo = await this.diario.resumoDia(u.id, data ?? hojeSP());
    if (!resumo.meta) return { erro: 'Defina suas metas antes de planejar o dia.' };

    const espaco = this.planejador.calcularEspaco(resumo.meta, resumo.totais);
    const alimento = await this.alimentos.porId(alimentoId);
    const resultado = this.planejador.quantoCabe(alimento, espaco);

    return {
      alimento: alimento.nome,
      modoPreparo: alimento.modoPreparo,
      ...resultado,
      espaco,
      mensagem: resultado.cabe
        ? `Cabem ${resultado.gramas} g. O limite aqui é ${resultado.macroLimitante}.`
        : `Hoje não cabe mais — o ${resultado.macroLimitante} já fechou. Amanhã cabe.`,
    };
  }

  @Get('montar/:refeicaoId')
  @ApiOperation({
    summary: 'Monta um prato completo pra esta refeição, com trocas por componente',
  })
  async montar(
    @UsuarioAtual() u: { id: string },
    @Param('refeicaoId') refeicaoId: string,
    @Query() query: { data?: string; sem?: string },
  ) {
    const resumo = await this.diario.resumoDia(u.id, query.data ?? hojeSP());
    if (!resumo.meta) return { erro: 'Defina suas metas antes de montar o prato.' };

    const refeicao = resumo.refeicoes.find((r) => r.id === refeicaoId);
    if (!refeicao) return { erro: 'Refeição não encontrada.' };

    const perfil = await this.usuarios.findOne({ where: { id: u.id } });
    const espaco = this.planejador.calcularEspaco(resumo.meta, resumo.totais);

    const prato = await this.montador.montarPrato({
      nomeRefeicao: refeicao.nome,
      espaco,
      restricoes: perfil?.restricoes ?? [],
      excluir: perfil?.naoComeIds ?? [],
      semPapeis: (query.sem ?? '').split(',').filter(Boolean) as PapelPrato[],
    });

    return { refeicao: { id: refeicao.id, nome: refeicao.nome }, espaco, ...prato };
  }

  @Get('montar/:refeicaoId/buscar')
  @ApiOperation({
    summary: 'Procura um alimento pra ocupar um papel do prato (proteína, base…)',
  })
  async buscarParaPapel(
    @UsuarioAtual() u: { id: string },
    @Param('refeicaoId') refeicaoId: string,
    @Query() query: { q?: string; papel?: string; data?: string },
  ) {
    if (!query.q || query.q.trim().length < 2) return [];

    const resumo = await this.diario.resumoDia(u.id, query.data ?? hojeSP());
    if (!resumo.meta) return { erro: 'Defina suas metas antes de montar o prato.' };

    const refeicao = resumo.refeicoes.find((r) => r.id === refeicaoId);
    if (!refeicao) return { erro: 'Refeição não encontrada.' };

    const perfil = await this.usuarios.findOne({ where: { id: u.id } });
    const espaco = this.planejador.calcularEspaco(resumo.meta, resumo.totais);
    const tipo = tipoDaRefeicao(refeicao.nome);

    return this.montador.buscarParaPapel({
      termo: query.q,
      papel: (query.papel ?? 'proteina') as PapelPrato,
      espaco,
      quantosPapeis: MODELOS_REFEICAO[tipo].length,
      restricoes: perfil?.restricoes ?? [],
      excluir: perfil?.naoComeIds ?? [],
    });
  }

  /**
   * Refeições que ainda não têm nada anotado — as candidatas naturais pra
   * montar um prato e fechar o dia.
   */
  @Get('refeicoes-vazias')
  @ApiOperation({ summary: 'Refeições do dia que ainda estão sem comida' })
  async refeicoesVazias(@UsuarioAtual() u: { id: string }, @Query('data') data?: string) {
    const resumo = await this.diario.resumoDia(u.id, data ?? hojeSP());
    return resumo.refeicoes.map((r) => ({
      id: r.id,
      nome: r.nome,
      vazia: (r.itens ?? []).length === 0,
      itens: (r.itens ?? []).length,
    }));
  }

  @Get('fechar')
  @ApiOperation({
    summary:
      'Sugere o que fecha os macros que faltam; `excluir` tira alimentos e `pular` traz outras opções',
  })
  async fechar(
    @UsuarioAtual() u: { id: string },
    @Query()
    query: { data?: string; excluir?: string; pular?: string; alvo?: string },
  ) {
    const data = query.data;
    const resumo = await this.diario.resumoDia(u.id, data ?? hojeSP());
    if (!resumo.meta) return { erro: 'Defina suas metas antes de planejar o dia.' };

    const espaco = this.planejador.calcularEspaco(resumo.meta, resumo.totais);
    const excluir = (query.excluir ?? '').split(',').filter(Boolean);
    const pular = Number(query.pular) || 0;

    // O perfil manda: restrições declaradas no cadastro mais o que a pessoa
    // foi descartando no uso.
    const perfil = await this.usuarios.findOne({ where: { id: u.id } });
    const r = await this.planejador.sugerirFechamento(espaco, 6, {
      excluir: [...excluir, ...(perfil?.naoComeIds ?? [])],
      pular,
      restricoes: perfil?.restricoes ?? [],
      alvo: query.alvo as MacroAlvo | undefined,
    });
    return { espaco, ...r };
  }
}
