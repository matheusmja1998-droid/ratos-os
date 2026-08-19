import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

/** Fontes aceitas para dados nutricionais, da mais confiável pra menos. */
export type FonteDado = 'TACO' | 'TBCA' | 'USDA' | 'ROTULO' | 'USUARIO';

/** Modo de preparo faz parte da identidade do alimento: arroz cru != cozido. */
export type ModoPreparo =
  | 'cru' | 'cozido' | 'grelhado' | 'frito' | 'assado' | 'refogado' | 'industrializado';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index({ unique: true }) @Column() email: string;
  @Column() senhaHash: string;
  @Column() nome: string;

  @Column({ type: 'text', default: 'masculino' }) sexo: string;
  @Column({ type: 'int', nullable: true }) idadeAnos: number;
  @Column({ type: 'real', nullable: true }) alturaCm: number;
  @Column({ type: 'text', default: 'moderado' }) nivelAtividade: string;
  @Column({ type: 'text', default: 'emagrecer' }) objetivo: string;

  /**
   * Alimentos que a pessoa não come, guardados como ids.
   *
   * Fica no perfil e não só no navegador: é preferência duradoura, e sugerir
   * de novo o que já foi recusado faz a pessoa parar de olhar as sugestões.
   */
  @Column({ type: 'simple-json', default: '[]' }) naoComeIds: string[];

  /** Restrições declaradas no cadastro (vegetariano, sem lactose...). */
  @Column({ type: 'simple-json', default: '[]' }) restricoes: string[];

  @OneToMany(() => Meta, (m) => m.usuario) metas: Meta[];
  @OneToMany(() => RegistroPeso, (p) => p.usuario) pesos: RegistroPeso[];

  @CreateDateColumn() criadoEm: Date;
  @UpdateDateColumn() atualizadoEm: Date;
}

/**
 * Metas de macro vigentes. Guardamos histórico em vez de sobrescrever:
 * saber quando e por que a meta mudou é o que permite explicar o progresso.
 */
@Entity('metas')
export class Meta {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => Usuario, (u) => u.metas, { onDelete: 'CASCADE' })
  @JoinColumn() usuario: Usuario;
  @Index() @Column() usuarioId: string;

  @Column({ type: 'real' }) calorias: number;
  @Column({ type: 'real' }) proteinaG: number;
  @Column({ type: 'real' }) carboidratoG: number;
  @Column({ type: 'real' }) gorduraG: number;

  @Column({ type: 'real', default: 30 }) fibraMetaG: number;
  @Column({ type: 'real', default: 25 }) gorduraSaturadaTetoG: number;

  @Column({ type: 'real' }) getCalculado: number;
  @Column({ type: 'real' }) pesoAlvoKg: number;
  @Column({ type: 'real', default: 0 }) deficitKcal: number;

  /** Por que essa meta existe — inclusive quando foi a IA que sugeriu o ajuste. */
  @Column({ type: 'text', default: 'calculo_inicial' }) origem: string;
  @Column({ type: 'text', nullable: true }) justificativa: string;

  @Column({ type: 'boolean', default: true }) ativa: boolean;
  @CreateDateColumn() criadoEm: Date;
}

/**
 * Alimento. A regra central: todo alimento carrega FONTE e MODO DE PREPARO.
 * Sem isso não dá pra saber se o dado é confiável nem se a pesagem bate.
 */
@Entity('alimentos')
export class Alimento {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column() nome: string;
  /** Nome sem acento e em minúsculas, pra busca funcionar como o usuário digita. */
  @Index() @Column({ type: 'text', default: '' }) nomeBusca: string;

  @Column({ type: 'text', default: 'industrializado' }) modoPreparo: ModoPreparo;
  @Column({ type: 'text' }) fonte: FonteDado;
  @Column({ type: 'text', nullable: true }) codigoFonte: string;
  @Column({ type: 'text', nullable: true }) marca: string;
  @Column({ type: 'text', nullable: true }) codigoBarras: string;

  // Sempre por 100 g. Converter na hora de exibir é mais seguro que guardar
  // porções heterogêneas.
  @Column({ type: 'real' }) kcal100g: number;
  @Column({ type: 'real' }) proteina100g: number;
  @Column({ type: 'real' }) carboidrato100g: number;
  @Column({ type: 'real' }) gordura100g: number;
  @Column({ type: 'real', default: 0 }) fibra100g: number;
  @Column({ type: 'real', default: 0 }) gorduraSaturada100g: number;
  @Column({ type: 'real', default: 0 }) sodio100gMg: number;

  /** Porções caseiras conhecidas, ex: [{rotulo:'1 fatia', gramas:25}]. */
  @Column({ type: 'simple-json', default: '[]' }) porcoes: { rotulo: string; gramas: number }[];

  @Column({ type: 'boolean', default: true }) verificado: boolean;
  @Column({ type: 'text', nullable: true }) criadoPorUsuarioId: string;
  @CreateDateColumn() criadoEm: Date;
}

@Entity('refeicoes')
export class Refeicao {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column() usuarioId: string;
  /** Dia civil no formato AAAA-MM-DD, não timestamp: o dia do usuário é local. */
  @Index() @Column({ type: 'text' }) data: string;

  @Column({ type: 'text' }) nome: string;
  @Column({ type: 'int', default: 0 }) ordem: number;

  @OneToMany(() => ItemRefeicao, (i) => i.refeicao, { cascade: true })
  itens: ItemRefeicao[];

  @CreateDateColumn() criadoEm: Date;
}

@Entity('itens_refeicao')
export class ItemRefeicao {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => Refeicao, (r) => r.itens, { onDelete: 'CASCADE' })
  @JoinColumn() refeicao: Refeicao;
  @Index() @Column() refeicaoId: string;

  @Column() alimentoId: string;
  /** Congelado no momento do registro: se o alimento mudar depois, o histórico não se altera. */
  @Column({ type: 'text' }) alimentoNome: string;

  @Column({ type: 'real' }) gramas: number;

  @Column({ type: 'real' }) kcal: number;
  @Column({ type: 'real' }) proteinaG: number;
  @Column({ type: 'real' }) carboidratoG: number;
  @Column({ type: 'real' }) gorduraG: number;
  @Column({ type: 'real', default: 0 }) fibraG: number;
  @Column({ type: 'real', default: 0 }) gorduraSaturadaG: number;

  /**
   * Marca o item que a pessoa escolheu PRIMEIRO no planejamento reverso —
   * a sobremesa, a pizza, o que ela quer comer. O resto do dia se encaixa em volta.
   */
  @Column({ type: 'boolean', default: false }) ehMaravilha: boolean;

  /** Planejado (antes de comer) x consumido. Planejar antes é o método. */
  @Column({ type: 'boolean', default: true }) consumido: boolean;

  @CreateDateColumn() criadoEm: Date;
}

@Entity('registros_peso')
export class RegistroPeso {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => Usuario, (u) => u.pesos, { onDelete: 'CASCADE' })
  @JoinColumn() usuario: Usuario;
  @Index() @Column() usuarioId: string;

  @Index() @Column({ type: 'text' }) data: string;
  @Column({ type: 'real' }) pesoKg: number;
  @Column({ type: 'text', nullable: true }) observacao: string;

  @CreateDateColumn() criadoEm: Date;
}

/** Receita composta: vira um "alimento" com macros por grama do total pronto. */
@Entity('receitas')
export class Receita {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column() usuarioId: string;
  @Column() nome: string;

  /** Ingredientes crus e o peso final PRONTO — a diferença é a água perdida. */
  @Column({ type: 'simple-json', default: '[]' })
  ingredientes: { alimentoId: string; nome: string; gramas: number }[];

  @Column({ type: 'real' }) rendimentoFinalG: number;

  @Column({ type: 'real', default: 0 }) kcal100g: number;
  @Column({ type: 'real', default: 0 }) proteina100g: number;
  @Column({ type: 'real', default: 0 }) carboidrato100g: number;
  @Column({ type: 'real', default: 0 }) gordura100g: number;
  @Column({ type: 'real', default: 0 }) fibra100g: number;
  @Column({ type: 'real', default: 0 }) gorduraSaturada100g: number;

  @CreateDateColumn() criadoEm: Date;
}
