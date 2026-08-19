import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Usuario } from '../comum/entidades';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    private readonly jwt: JwtService,
  ) {}

  async registrar(dados: {
    email: string; senha: string; nome: string;
    sexo?: string; idadeAnos?: number; alturaCm?: number;
    nivelAtividade?: string; objetivo?: string;
  }) {
    const email = dados.email.toLowerCase().trim();
    if (await this.usuarios.findOne({ where: { email } })) {
      throw new ConflictException('Já existe uma conta com esse e-mail.');
    }

    const usuario = this.usuarios.create({
      ...dados,
      email,
      senhaHash: await bcrypt.hash(dados.senha, 10),
    });
    await this.usuarios.save(usuario);
    return this.emitirToken(usuario);
  }

  async entrar(email: string, senha: string) {
    const usuario = await this.usuarios.findOne({
      where: { email: email.toLowerCase().trim() },
    });
    if (!usuario || !(await bcrypt.compare(senha, usuario.senhaHash))) {
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    }
    return this.emitirToken(usuario);
  }

  private emitirToken(usuario: Usuario) {
    return {
      token: this.jwt.sign({ sub: usuario.id, email: usuario.email }),
      usuario: {
        id: usuario.id, nome: usuario.nome, email: usuario.email,
        sexo: usuario.sexo, idadeAnos: usuario.idadeAnos,
        alturaCm: usuario.alturaCm, nivelAtividade: usuario.nivelAtividade,
        objetivo: usuario.objetivo,
      },
    };
  }
}
