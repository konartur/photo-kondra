import { describe, expect, it, jest } from '@jest/globals';
import { PrismaService } from './prisma.service.js';

describe('PrismaService', () => {
  it('connects when the Nest module initializes', async () => {
    const prismaService = new PrismaService();
    const connect = jest.spyOn(prismaService, '$connect').mockResolvedValue();

    await prismaService.onModuleInit();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('disconnects when the Nest module is destroyed', async () => {
    const prismaService = new PrismaService();
    const disconnect = jest.spyOn(prismaService, '$disconnect').mockResolvedValue();

    await prismaService.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
