import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * 数据管道导入守卫（import-eastmoney-json 专用）：X-Api-Key 与 JWT 二选一。
 * - 自动化脚本（每日导入技能）携带 X-Api-Key，值 = 环境变量 IMPORT_API_KEY
 * - 已登录管理员携带 Authorization: Bearer（前端 fetch 拦截器自动附加）
 * - 两者皆无 → 401
 * 说明：该路由同时标注了 @Public() 以跳过类级 WriteGuard，由本守卫独立把关；
 * 服务器未配置 IMPORT_API_KEY 时，Key 通道自动禁用（仅剩 JWT）。
 */
@Injectable()
export class ImportKeyGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest();
    const provided = req.headers['x-api-key'];
    const expected = process.env.IMPORT_API_KEY;
    if (expected && typeof provided === 'string' && provided.length === expected.length) {
      let diff = 0; // 定长逐位比较，避免时序侧信道
      for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
      if (diff === 0) return true;
    }
    return super.canActivate(context);
  }
}
