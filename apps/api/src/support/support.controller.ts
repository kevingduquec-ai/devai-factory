import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { SupportService } from "./support.service";
import { SendSupportMessageDto } from "./dto/send-support-message.dto";

@UseGuards(JwtAuthGuard)
@Controller("support")
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get("messages")
  listMessages() {
    return this.supportService.listMessages();
  }

  @Post("messages")
  sendMessage(@Body() dto: SendSupportMessageDto) {
    return this.supportService.sendMessage(dto);
  }

  @Get("unread-count")
  unreadCount() {
    return this.supportService.unreadCount();
  }
}
