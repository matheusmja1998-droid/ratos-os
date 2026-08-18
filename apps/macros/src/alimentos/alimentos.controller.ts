import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AlimentosService } from './alimentos.service';
import { CriarAlimentoDto } from '../comum/dtos';
import { JwtGuard } from '../auth/jwt.guard';
import { UsuarioAtual } from '../auth/usuario.decorator';
import { Alimento } from '../comum/entidades';

@ApiTags('alimentos')
@Controller('alimentos')
export class AlimentosController {
  constructor(private readonly alimentos: AlimentosService) {}

  @Get('buscar')
  @ApiOperation({ summary: 'Busca alimentos; fontes verificadas vêm primeiro' })
  buscar(@Query('q') q: string, @Query('limite') limite?: string) {
    return this.alimentos.buscar(q ?? '', limite ? Number(limite) : 25);
  }

  @Get('codigo-barras/:codigo')
  porCodigoBarras(@Param('codigo') codigo: string) {
    return this.alimentos.porCodigoBarras(codigo);
  }

  @Get(':id')
  porId(@Param('id') id: string) {
    return this.alimentos.porId(id);
  }

  @Get(':id/porcao')
  @ApiOperation({ summary: 'Macros de uma quantidade em gramas' })
  async porcao(@Param('id') id: string, @Query('gramas') gramas: string) {
    const alimento = await this.alimentos.porId(id);
    return {
      alimento: alimento.nome,
      modoPreparo: alimento.modoPreparo,
      fonte: alimento.fonte,
      gramas: Number(gramas),
      ...this.alimentos.calcularPorGramas(alimento, Number(gramas)),
    };
  }

  @Post()
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cadastra alimento; confere se macros batem com as calorias' })
  async criar(
    @Body() dto: CriarAlimentoDto,
    @UsuarioAtual() usuario: { id: string },
  ) {
    const coerencia = this.alimentos.validarCoerencia(dto);
    const alimento = await this.alimentos.criar(dto as Partial<Alimento>, usuario.id);
    return { alimento, coerencia };
  }

  @Post('validar')
  @ApiOperation({ summary: 'Confere a coerência de um rótulo sem salvar' })
  validar(@Body() dto: CriarAlimentoDto) {
    return this.alimentos.validarCoerencia(dto);
  }
}
