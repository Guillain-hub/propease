import { Controller, Get, Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';

@Controller('health')
class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth(): Promise<{ status: 'ok'; database: 'ok'; timestamp: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      database: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
