import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

/**
 * Envía correos transaccionales vía Resend. Si RESEND_API_KEY no está
 * configurada (desarrollo local sin cuenta de Resend todavía), no falla:
 * registra el contenido en el log y devuelve false para que el llamador
 * pueda mostrar un fallback (ej. el link de invitación en la respuesta).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>("RESEND_API_KEY");
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = config.get<string>("EMAIL_FROM", "Qubit <onboarding@resend.dev>");
  }

  private async send(params: { to: string; subject: string; html: string }): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY no configurada — correo "${params.subject}" para ${params.to} no enviado (solo registrado en log).`,
      );
      return false;
    }
    try {
      const result = await this.resend.emails.send({ from: this.from, to: params.to, subject: params.subject, html: params.html });
      if (result.error) {
        this.logger.error(`Resend rechazó el correo a ${params.to}: ${result.error.message}`);
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(`Fallo enviando correo a ${params.to}: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  async sendInviteEmail(params: { to: string; orgName: string; inviteUrl: string }): Promise<boolean> {
    return this.send({
      to: params.to,
      subject: `Te invitaron a "${params.orgName}" en Qubit`,
      html: emailShell(`
        <p style="margin:0 0 16px;font-size:15px;color:#0a1931;">Te invitaron a unirte al equipo <strong>${escapeHtml(params.orgName)}</strong> en Qubit, la plataforma de requerimientos y QA potenciada por IA.</p>
        <p style="margin:0 0 24px;font-size:15px;color:#0a1931;">Haz clic en el siguiente botón para crear tu contraseña y activar tu cuenta.</p>
        <a href="${params.inviteUrl}" style="display:inline-block;background:#1598d3;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:6px;">Aceptar invitación</a>
        <p style="margin:24px 0 0;font-size:12px;color:#5b6577;">Este enlace expira en 3 días. Si no esperabas esta invitación, puedes ignorar este correo.</p>
      `),
    });
  }

  async sendUsageLimitWarningEmail(params: { to: string; orgName: string; plan: string; used: number; limit: number }): Promise<boolean> {
    return this.send({
      to: params.to,
      subject: `${params.orgName}: cerca del límite de tu plan ${params.plan} en Qubit`,
      html: emailShell(`
        <p style="margin:0 0 16px;font-size:15px;color:#0a1931;">Tu organización <strong>${escapeHtml(params.orgName)}</strong> ha usado ${params.used} de ${params.limit} análisis incluidos este mes en el plan ${escapeHtml(params.plan)}.</p>
        <p style="margin:0;font-size:15px;color:#0a1931;">Mejora tu plan para seguir generando paquetes de análisis sin interrupciones.</p>
      `),
    });
  }
}

function emailShell(bodyHtml: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
    <div style="background:#0a1931;color:#ffffff;font-weight:700;font-size:18px;padding:16px 20px;border-radius:8px 8px 0 0;">Qubit</div>
    <div style="border:1px solid #e2e5e4;border-top:none;border-radius:0 0 8px 8px;padding:24px 20px;">${bodyHtml}</div>
  </div>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
