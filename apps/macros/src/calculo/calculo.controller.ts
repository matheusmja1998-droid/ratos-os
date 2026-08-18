import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CalculoService } from './calculo.service';
import { CalcularDto } from '../comum/dtos';
import { NivelAtividade, Objetivo, Sexo } from './calculo.tipos';
import { NIVEIS_ATIVIDADE } from './calculo.tipos';

@ApiTags('calculo')
@Controller('calculo')
export class CalculoController {
  constructor(private readonly calculo: CalculoService) {}

  @Post()
  @ApiOperation({
    summary: 'Calcula metas de macro com a memória de cálculo passo a passo',
  })
  calcular(@Body() dto: CalcularDto) {
    return this.calculo.calcular(
      {
        sexo: dto.sexo as Sexo,
        idadeAnos: dto.idadeAnos,
        pesoKg: dto.pesoKg,
        alturaCm: dto.alturaCm,
        nivelAtividade: dto.nivelAtividade as NivelAtividade,
      },
      (dto.objetivo ?? 'emagrecer') as Objetivo,
      dto.deficitKcal ?? 500,
    );
  }

  @Post('niveis')
  @ApiOperation({ summary: 'Lista os níveis de atividade e o que cada um significa' })
  niveis() {
    return Object.entries(NIVEIS_ATIVIDADE).map(([chave, v]) => ({ chave, ...v }));
  }
}
