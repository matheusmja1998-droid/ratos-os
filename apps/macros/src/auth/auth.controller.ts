import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { EntrarDto, RegistrarDto } from '../comum/dtos';
import { JwtGuard } from './jwt.guard';
import { UsuarioAtual } from './usuario.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
  eu(@UsuarioAtual() usuario: { id: string; email: string }) {
    return usuario;
  }
}
