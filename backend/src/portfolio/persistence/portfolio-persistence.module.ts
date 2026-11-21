import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { PortfolioPersistenceService } from './portfolio-persistence.service.js';

@Module({
  imports: [PrismaModule],
  providers: [PortfolioPersistenceService],
  exports: [PortfolioPersistenceService],
})
export class PortfolioPersistenceModule {}
