import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { Usuario } from '../comum/entidades';
import { AtualizarPerfilDto } from '../comum/dtos';
import { EntrarDto, RegistrarDto } from '../comum/dtos';
import { JwtGuard } from './jwt.guard';
import { UsuarioAtual } from './usuario.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
  ) {}

  @Post('registrar')
  registrar(@Body() dto: RegistrarDto) {
    return this.auth.registrar(dto);
  }

  @Post('entrar')
  entrar(@Body() dto: EntrarDto) {
    return this.auth.entrar(dto.email, dto.senha);
  }

  @Get('eu')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Perfil completo de quem está logado' })
  async eu(@UsuarioAtual() usuario: { id: string }) {
    // Devolve o perfil inteiro: o cliente precisa de idade, altura e nível de
    // atividade pra montar o cálculo. Sem isso ele cairia em valores padrão e
    // produziria uma meta errada silenciosamente.
    const u = await this.usuarios.findOneOrFail({ where: { id: usuario.id } });
    return {
      id: u.id, nome: u.nome, email: u.email, sexo: u.sexo,
      idadeAnos: u.idadeAnos, alturaCm: u.alturaCm,
      nivelAtividade: u.nivelAtividade, objetivo: u.objetivo,
    };
  }

  @Patch('eu')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualiza os dados do perfil' })
  async atualizar(
    @UsuarioAtual() usuario: { id: string },
    @Body() dto: AtualizarPerfilDto,
  ) {
    await this.usuarios.update(usuario.id, dto);
    return this.eu(usuario);
  }
}
