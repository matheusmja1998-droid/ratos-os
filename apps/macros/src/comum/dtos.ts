import {
  IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsBoolean,
  Max, Min, MinLength, Matches,
} from 'class-validator';

const SEXOS = ['masculino', 'feminino'];
const NIVEIS = ['sedentario', 'leve', 'moderado', 'intenso', 'atleta'];
const OBJETIVOS = ['emagrecer', 'manter', 'ganhar'];
const PREPAROS = ['cru', 'cozido', 'grelhado', 'frito', 'assado', 'refogado', 'industrializado'];
const FONTES = ['TACO', 'TBCA', 'USDA', 'ROTULO', 'USUARIO'];

export class RegistrarDto {
  @IsEmail({}, { message: 'E-mail inválido.' }) email: string;
  @IsString() @MinLength(8, { message: 'A senha precisa de pelo menos 8 caracteres.' }) senha: string;
  @IsString() @MinLength(2) nome: string;

  @IsOptional() @IsIn(SEXOS) sexo?: string;
  @IsOptional() @IsInt() @Min(14) @Max(100) idadeAnos?: number;
  @IsOptional() @IsNumber() @Min(120) @Max(250) alturaCm?: number;
  @IsOptional() @IsIn(NIVEIS) nivelAtividade?: string;
  @IsOptional() @IsIn(OBJETIVOS) objetivo?: string;
}

export class EntrarDto {
  @IsEmail() email: string;
  @IsString() senha: string;
}

export class CalcularDto {
  @IsIn(SEXOS) sexo: string;
  @IsInt() @Min(14) @Max(100) idadeAnos: number;
  @IsNumber() @Min(30) @Max(400) pesoKg: number;
  @IsNumber() @Min(120) @Max(250) alturaCm: number;
  @IsIn(NIVEIS) nivelAtividade: string;

  @IsOptional() @IsIn(OBJETIVOS) objetivo?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1500) deficitKcal?: number;
}

export class AdicionarItemDto {
  @IsString() refeicaoId: string;
  @IsString() alimentoId: string;
  @IsNumber() @Min(0.1, { message: 'Informe o peso em GRAMAS, não em porções.' }) @Max(5000)
  gramas: number;

  @IsOptional() @IsBoolean() ehMaravilha?: boolean;
  @IsOptional() @IsBoolean() consumido?: boolean;
}

export class AtualizarGramasDto {
  @IsNumber() @Min(0) @Max(5000) gramas: number;
}

export class CriarAlimentoDto {
  @IsString() @MinLength(2) nome: string;
  @IsIn(PREPAROS) modoPreparo: string;
  @IsIn(FONTES) fonte: string;

  @IsOptional() @IsString() marca?: string;
  @IsOptional() @IsString() codigoBarras?: string;
  @IsOptional() @IsString() codigoFonte?: string;

  @IsNumber() @Min(0) @Max(900) kcal100g: number;
  @IsNumber() @Min(0) @Max(100) proteina100g: number;
  @IsNumber() @Min(0) @Max(100) carboidrato100g: number;
  @IsNumber() @Min(0) @Max(100) gordura100g: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) fibra100g?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) gorduraSaturada100g?: number;
}

export class RegistrarPesoDto {
  @IsNumber() @Min(30) @Max(400) pesoKg: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use o formato AAAA-MM-DD.' })
  data?: string;
  @IsOptional() @IsString() observacao?: string;
}

export class InterpretarTextoDto {
  @IsString() @MinLength(3) texto: string;
}

export class LerRotuloDto {
  @IsString() imagemBase64: string;
  @IsOptional() @IsString() tipoMime?: string;
}
