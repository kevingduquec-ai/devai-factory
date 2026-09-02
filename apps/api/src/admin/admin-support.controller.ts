import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "./guards/admin-auth.guard";
import { AdminSupportService } from "./admin-support.service";
import { SendAdminSupportMessageDto } from "./dto/send-admin-support-message.dto";
import { UpdateSupportConversationDto } from "./dto/update-support-conversation.dto";

@UseGuards(AdminAuthGuard)
@Controller("admin/support")
export class AdminSupportController {
  constructor(private readonly adminSupportService: AdminSupportService) {}

  @Get("conversations")
  listConversations() {
    return this.adminSupportService.listConversations();
  }

  @Get("unread-count")
  totalUnreadCount() {
    return this.adminSupportService.totalUnreadCount();
  }

  @Get("conversations/:orgId")
  getMessages(@Param("orgId") orgId: string) {
    return this.adminSupportService.getMessages(orgId);
  }

  @Post("conversations/:orgId")
  sendMessage(@Param("orgId") orgId: string, @Body() dto: SendAdminSupportMessageDto) {
    return this.adminSupportService.sendMessage(orgId, dto);
  }

  @Patch("conversations/:orgId/status")
  setClosed(@Param("orgId") orgId: string, @Body() dto: UpdateSupportConversationDto) {
    return this.adminSupportService.setClosed(orgId, dto);
  }
}
