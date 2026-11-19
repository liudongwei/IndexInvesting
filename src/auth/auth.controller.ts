import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('认证管理')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @ApiOperation({ summary: '用户注册' })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Get('profile')
  @ApiOperation({ summary: '获取当前用户信息' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return this.authService.getProfile(req.user.userId);
  }

  @Post('change-password')
  @ApiOperation({ summary: '修改当前用户密码（需登录，验证当前密码）' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  changePassword(@Request() req, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.userId, dto.currentPassword, dto.newPassword);
  }
}
