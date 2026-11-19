import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.usersService.findByUsername(username);
    if (user && await bcrypt.compare(password, user.password)) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.username, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is disabled');
    }

    const payload = { username: user.username, sub: user.id, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async register(registerDto: RegisterDto) {
    try {
      const user = await this.usersService.create({
        ...registerDto,
        isActive: true,
      });
      const { password, ...result } = user;
      return result;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw new ConflictException('Registration failed');
    }
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findOne(userId);
    const { password, ...result } = user;
    return result;
  }

  /**
   * 修改当前登录用户的密码：先验当前密码，再落新密码（bcrypt）。
   * JWT 无状态、无法吊销旧 token，前端约定改密成功后清凭证重新登录。
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.usersService.findOne(userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new UnauthorizedException('当前密码不正确');
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      throw new ConflictException('新密码不能与当前密码相同');
    }
    await this.usersService.update(userId, { password: newPassword });
    return { success: true, message: '密码修改成功，请使用新密码重新登录' };
  }
}
