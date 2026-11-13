import { Injectable, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';

/** 标记路由为公开（豁免写守卫）：@Public() */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * 写操作守卫（混合控制器用：公开只读 + 管理写操作）：
 * - @Public() 标记的路由永远放行（如公开页的手动计算按钮）
 * - GET / HEAD / OPTIONS 永远放行（公开查询，首页排名等前端依赖）
 * - POST / PUT / PATCH / DELETE 必须携带有效 JWT（Bearer）
 *
 * 纯管理控制器（admin/*）不使用本守卫，而是用 JwtAuthGuard 全方法锁定（含 GET）。
 */
@Injectable()
export class WriteGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const req = context.switchToHttp().getRequest();
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
    return super.canActivate(context);
  }
}
