import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { RolesModule } from './roles/roles.module';
import { IndicesModule } from './indices/indices.module';
import { MovingAveragesModule } from './moving-averages/moving-averages.module';
import { TrendAnalysisModule } from './trend-analysis/trend-analysis.module';
import { CronConfigModule } from './cron-config/cron-config.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // 全局可用
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'jack@123',
      database: process.env.DB_DATABASE || 'index_investing',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true, // 开发环境使用，生产环境建议关闭
    }),
    HttpModule,
    UsersModule,
    AuthModule,
    RolesModule,
    IndicesModule,
    MovingAveragesModule,
    TrendAnalysisModule,
    CronConfigModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
