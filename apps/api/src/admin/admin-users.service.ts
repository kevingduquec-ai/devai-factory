import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateUserAdminDto } from "./dto/update-user-admin.dto";

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  async update(userId: string, dto: UpdateUserAdminDto) {
    const db = this.prisma.bypassRls();
    const existing = await db.user.findUnique({ where: { id: userId } });
    if (!existing) {
      throw new NotFoundException("Usuario no encontrado");
    }
    return db.user.update({
      where: { id: userId },
      data: { singleStoryEnabled: dto.singleStoryEnabled },
    });
  }
}
