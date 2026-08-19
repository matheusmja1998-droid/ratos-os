import { Body, Controller, Get, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProgressoService } from './progresso.service';
import { Meta, RegistroPeso } from '../comum/entidades';
import { RegistrarPesoDto } from '../comum/dtos';
import { JwtGuard } from '../auth/jwt.guard';
import { UsuarioAtual } from '../auth/usuario.decorator';
import { hojeSP } from '../comum/data';
import { Objetivo } from '../calculo/calculo.tipos';

@ApiTags('metas')
@Controller('metas')
@UseGuards(JwtGuard)
@ApiBearerAuth()
export class MetasController {
  constructor(
    private readonly progresso: ProgressoService,
    @InjectRepository(Meta) private readonly metas: Repository<Meta>,
    @InjectRepository(RegistroPeso) private readonly pesos: Repository<RegistroPeso>,
  ) {}

  @Get()
  atual(@UsuarioAtual() u: { id: string }) {
    return this.metas.findOne({ where: { usuarioId: u.id, ativa: true }, order: { criadoEm: 'DESC' } });
  }

  @Get('historico')
  historico(@UsuarioAtual() u: { id: string }) {
    return this.metas.find({ where: { usuarioId: u.id }, order: { criadoEm: 'DESC' } });
  }

  @Post('recalcular')
  @ApiOperation({ summary: 'Recalcula as metas a partir do peso atual' })
  recalcular(
    @UsuarioAtual() u: { id: string },
    @Body() body: { pesoKg: number; objetivo?: string; deficitKcal?: number },
  ) {
    return this.progresso.recalcularMeta(
      u.id,
      body.pesoKg,
      (body.objetivo ?? 'emagrecer') as Objetivo,
      body.deficitKcal ?? 500,
    );
  }

  @Post('peso')
  @ApiOperation({ summary: 'Registra o peso do dia' })
  async registrarPeso(@UsuarioAtual() u: { id: string }, @Body() dto: RegistrarPesoDto) {
    const data = dto.data ?? hojeSP();
    const existente = await this.pesos.findOne({ where: { usuarioId: u.id, data } });
    if (existente) {
      Object.assign(existente, { pesoKg: dto.pesoKg, observacao: dto.observacao });
      return this.pesos.save(existente);
    }
    return this.pesos.save(
      this.pesos.create({ usuarioId: u.id, data, pesoKg: dto.pesoKg, observacao: dto.observacao }),
    );
  }

  @Get('peso')
  listarPesos(@UsuarioAtual() u: { id: string }, @Query('dias') dias?: string) {
    return this.pesos.find({
      where: { usuarioId: u.id },
      order: { data: 'DESC' },
      take: dias ? Number(dias) : 90,
    });
  }

  @Get('tendencia')
  @ApiOperation({ summary: 'Tendência de peso por média móvel, sem o ruído do dia' })
  tendencia(@UsuarioAtual() u: { id: string }) {
    return this.progresso.tendencia(u.id);
  }

  @Post('ajustar-carboidrato')
  @ApiOperation({
    summary: 'Aplica o ajuste de platô: mexe só no carboidrato, proteína intacta',
  })
  async ajustarCarboidrato(
    @UsuarioAtual() u: { id: string },
    @Body() body: { carboidratoG: number },
  ) {
    const atual = await this.metas.findOne({
      where: { usuarioId: u.id, ativa: true },
      order: { criadoEm: 'DESC' },
    });
    if (!atual) throw new NotFoundException('Você ainda não tem metas para ajustar.');

    const carboidratoG = Math.max(0, Math.round(body.carboidratoG));
    // Proteína e gordura ficam onde estão: no platô se corta carboidrato e se
    // aumenta o gasto, nunca o macro estrutural.
    const calorias =
      atual.proteinaG * 4 + carboidratoG * 4 + atual.gorduraG * 9;

    await this.metas.update({ usuarioId: u.id, ativa: true }, { ativa: false });

    return this.metas.save(
      this.metas.create({
        ...atual,
        id: undefined,
        carboidratoG,
        calorias,
        origem: 'ajuste_plato',
        justificativa:
          `Carboidrato de ${atual.carboidratoG} g para ${carboidratoG} g por estagnação. ` +
          `Proteína mantida em ${atual.proteinaG} g.`,
        ativa: true,
      }),
    );
  }

  @Get('plato')
  @ApiOperation({ summary: 'Diagnostica platô e sugere o ajuste (proteína nunca muda)' })
  plato(@UsuarioAtual() u: { id: string }) {
    return this.progresso.diagnosticarPlato(u.id);
  }
}
