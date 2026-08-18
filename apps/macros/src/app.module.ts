import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import {
  Alimento, ItemRefeicao, Meta, Receita, Refeicao, RegistroPeso, Usuario,
} from './comum/entidades';

import { CalculoService } from './calculo/calculo.service';
import { CalculoController } from './calculo/calculo.controller';
import { AlimentosService } from './alimentos/alimentos.service';
import { AlimentosController } from './alimentos/alimentos.controller';
import { DiarioService } from './diario/diario.service';
import { PlanejadorService } from './diario/planejador.service';
import { DiarioController } from './diario/diario.controller';
import { ProgressoService } from './metas/progresso.service';
import { MetasController } from './metas/metas.controller';
import { IaService } from './ia/ia.service';
import { IaController } from './ia/ia.controller';
import { AuthService } from './auth/auth.service';
import { AuthController } from './auth/auth.controller';
import { JwtStrategy, SEGREDO_JWT } from './auth/jwt.strategy';

const ENTIDADES = [Usuario, Meta, Alimento, Refeicao, ItemRefeicao, RegistroPeso, Receita];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DB_PATH ?? 'macros.db',
      entities: ENTIDADES,
      synchronize: true,
    }),
    TypeOrmModule.forFeature(ENTIDADES),
    PassportModule,
    JwtModule.register({ secret: SEGREDO_JWT, signOptions: { expiresIn: '30d' } }),
  ],
  controllers: [
    AuthController, CalculoController, AlimentosController,
    DiarioController, MetasController, IaController,
  ],
  providers: [
    AuthService, JwtStrategy, CalculoService, AlimentosService,
    DiarioService, PlanejadorService, ProgressoService, IaService,
  ],
})
export class AppModule {}
