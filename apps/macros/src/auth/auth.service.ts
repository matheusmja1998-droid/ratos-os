import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Meta, RegistroPeso, Usuario } from '../comum/entidades';
import { CalculoService } from '../calculo/calculo.service';
import { NivelAtividade, Objetivo, Sexo } from '../calculo/calculo.tipos';
import { hojeSP } from '../comum/data';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario) private readonly usuarios: Repository<Usuario>,
    @InjectRepository(Meta) private readonly metas: Repository<Meta>,
    @InjectRepository(RegistroPeso) private readonly pesos: Repository<RegistroPeso>,
    private readonly jwt: JwtService,
    private readonly calculo: CalculoService,
  ) {}

  /**
   * Cria a conta e, quando os dados corporais vierem junto, já entrega as metas
   * calculadas e o primeiro peso registrado.
   *
   * O objetivo é que ninguém caia num app vazio: quem informa sexo, idade,
   * altura, peso e nível de atividade sai do cadastro com a conta pronta e a
   * memória de cálculo disponível pra conferir.
   */
  async registrar(dados: {
    email: string; senha: string; nome: string;
    sexo?: string; idadeAnos?: number; alturaCm?: number;
    nivelAtividade?: string; objetivo?: string;
    pesoKg?: number; deficitKcal?: number;
    restricoes?: string[];
  }) {
    const email = dados.email.toLowerCase().trim();
    if (await this.usuarios.findOne({ where: { email } })) {
      throw new ConflictException('Já existe uma conta com esse e-mail.');
    }

    const { pesoKg, deficitKcal, ...perfil } = dados;

    const usuario = this.usuarios.create({
      ...perfil,
      email,
      senhaHash: await bcrypt.hash(dados.senha, 10),
    });
    await this.usuarios.save(usuario);

    const onboarding = await this.concluirOnboarding(usuario, pesoKg, deficitKcal);
    return { ...this.emitirToken(usuario), ...onboarding };
  }

  /**
   * Fecha o onboarding: calcula as metas e registra o peso inicial.
   *
   * Sem peso ou sem os dados corporais não há conta a fazer — nesse caso o
   * app abre pedindo que a pessoa complete o perfil, em vez de inventar
   * número por ela.
   */
  private async concluirOnboarding(
    usuario: Usuario,
    pesoKg?: number,
    deficitKcal?: number,
  ): Promise<{ meta: Meta | null; calculo: ReturnType<CalculoService['calcular']> | null }> {
    const completo =
      pesoKg && usuario.idadeAnos && usuario.alturaCm && usuario.sexo && usuario.nivelAtividade;
    if (!completo) return { meta: null, calculo: null };

    const objetivo = (usuario.objetivo ?? 'emagrecer') as Objetivo;
    const calculo = this.calculo.calcular(
      {
        sexo: usuario.sexo as Sexo,
        idadeAnos: usuario.idadeAnos,
        pesoKg,
        alturaCm: usuario.alturaCm,
        nivelAtividade: usuario.nivelAtividade as NivelAtividade,
      },
      objetivo,
      deficitKcal ?? 500,
    );

    const meta = await this.metas.save(
      this.metas.create({
        usuarioId: usuario.id,
        calorias: calculo.metaCalorica,
        proteinaG: calculo.macros.proteinaG,
        carboidratoG: calculo.macros.carboidratoG,
        gorduraG: calculo.macros.gorduraG,
        getCalculado: calculo.get,
        pesoAlvoKg: calculo.pesoAlvoKg,
        deficitKcal: calculo.deficitKcal,
        origem: 'onboarding',
        justificativa: `Calculado no cadastro com ${pesoKg} kg.`,
        ativa: true,
      }),
    );

    // O peso do cadastro vira o primeiro ponto da série: sem ele a tendência
    // só começaria a existir semanas depois.
    await this.pesos.save(
      this.pesos.create({ usuarioId: usuario.id, data: hojeSP(), pesoKg }),
    );

    return { meta, calculo };
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
