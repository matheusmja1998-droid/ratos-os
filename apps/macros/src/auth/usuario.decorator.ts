import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Injeta o usuário autenticado direto no handler. */
export const UsuarioAtual = createParamDecorator(
  (_dado: unknown, ctx: ExecutionContext): { id: string; email: string } =>
    ctx.switchToHttp().getRequest().user,
);
