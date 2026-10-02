import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { SettingsService } from '../settings/settings.service';
import type { AdminUser } from './admin.entities';
import {
  AdminGuard,
  AdminSessionId,
  CurrentAdmin,
  RequireRole,
} from './admin.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';
import {
  AddWaitlistDto,
  AdminLoginDto,
  DisableTwoFactorDto,
  ForgotPasswordDto,
  LoginTwoFactorDto,
  ResetPasswordDto,
  TwoFactorCodeDto,
  AuditQueryDto,
  ChangePasswordDto,
  CreateAdminDto,
  CreateCategoryDto,
  CreateQuestionDto,
  CreateTopicDto,
  IdsDto,
  ListAdminRoundsDto,
  ListUsersDto,
  ListWaitlistDto,
  RangeQueryDto,
  ReorderCategoriesDto,
  SuspendUserDto,
  UpdateAdminDto,
  UpdateAdminProfileDto,
  UpdateCategoryDto,
  UpdateQuestionDto,
  UpdateSettingsDto,
  UpdateTopicDto,
} from './dto';

const csvCell = (v: string | number | Date | null) => {
  const s = v instanceof Date ? v.toISOString() : String(v ?? '');
  // Leading =+-@ would run as a formula in Excel/Sheets.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replaceAll('"', '""')}"`;
};
const toCsv = (rows: (string | number | Date | null)[][]) =>
  rows.map((r) => r.map(csvCell).join(',')).join('\n');

/** The dashboard calls the API server-side, so it forwards the browser's IP. */
const clientIp = (req: Request) =>
  (req.headers['x-admin-client-ip'] as string | undefined) ?? req.ip;

// ---- auth --------------------------------------------------------------------

@ApiTags('Admin · Auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @ApiOperation({
    summary: 'Sign in to the admin dashboard',
    description: 'Returns a 12-hour bearer token tied to a revocable session.',
  })
  @ApiUnauthorizedResponse({ description: 'Wrong email or password' })
  @ApiTooManyRequestsResponse({
    description: 'Five failed attempts locks the email for 15 minutes',
  })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, {
      ip: clientIp(req),
      userAgent:
        (req.headers['x-admin-user-agent'] as string | undefined) ??
        req.headers['user-agent'],
    });
  }

  @ApiOperation({ summary: 'Second sign-in step when 2FA is on' })
  @ApiTooManyRequestsResponse({
    description: 'Five wrong codes locks 2FA for 15 minutes',
  })
  @Post('login/2fa')
  @HttpCode(200)
  loginTwoFactor(@Body() dto: LoginTwoFactorDto, @Req() req: Request) {
    return this.auth.loginTwoFactor(dto.challengeToken, dto.code, {
      ip: clientIp(req),
      userAgent:
        (req.headers['x-admin-user-agent'] as string | undefined) ??
        req.headers['user-agent'],
    });
  }

  @ApiOperation({
    summary: 'Email a password reset link',
    description: 'Always 204, whether or not the email belongs to an admin.',
  })
  @Post('forgot-password')
  @HttpCode(204)
  forgot(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.requestPasswordReset(dto.email, clientIp(req));
  }

  @ApiOperation({ summary: 'Set a new password from an emailed link' })
  @Post('reset-password')
  @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.auth.resetPassword(dto.token, dto.password, clientIp(req));
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Get('2fa')
  twoFactor(@CurrentAdmin() admin: AdminUser) {
    return this.auth.twoFactorStatus(admin);
  }

  @ApiOperation({
    summary: 'Start 2FA setup',
    description: 'Returns a secret and otpauth:// URI to show as a QR code.',
  })
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Post('2fa/setup')
  @HttpCode(200)
  setupTwoFactor(@CurrentAdmin() admin: AdminUser) {
    return this.auth.setupTwoFactor(admin);
  }

  @ApiOperation({
    summary: 'Confirm 2FA with a code',
    description: 'Returns 10 recovery codes, shown once.',
  })
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Post('2fa/enable')
  @HttpCode(200)
  enableTwoFactor(
    @CurrentAdmin() admin: AdminUser,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.auth.enableTwoFactor(admin, dto.code);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Post('2fa/disable')
  @HttpCode(204)
  disableTwoFactor(
    @CurrentAdmin() admin: AdminUser,
    @Body() dto: DisableTwoFactorDto,
  ) {
    return this.auth.disableTwoFactor(admin, dto.password, dto.code);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Post('2fa/recovery-codes')
  @HttpCode(200)
  regenerateRecoveryCodes(
    @CurrentAdmin() admin: AdminUser,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.auth.regenerateRecoveryCodes(admin, dto.code);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Post('logout')
  @HttpCode(204)
  logout(@CurrentAdmin() admin: AdminUser, @AdminSessionId() sid: string) {
    return this.auth.logout(admin, sid);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Get('me')
  me(@CurrentAdmin() admin: AdminUser) {
    return this.auth.toDto(admin);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Patch('me')
  updateMe(
    @CurrentAdmin() admin: AdminUser,
    @Body() dto: UpdateAdminProfileDto,
  ) {
    return this.auth.updateProfile(admin, dto.name);
  }

  @ApiOperation({
    summary: 'Change own password',
    description: 'Signs out every other session.',
  })
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Post('password')
  @HttpCode(204)
  password(
    @CurrentAdmin() admin: AdminUser,
    @AdminSessionId() sid: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      admin,
      sid,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Get('sessions')
  sessions(@CurrentAdmin() admin: AdminUser, @AdminSessionId() sid: string) {
    return this.auth.listSessions(admin.id, sid);
  }

  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Delete('sessions/:id')
  @HttpCode(204)
  revoke(
    @CurrentAdmin() admin: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auth.revokeSession(admin, id);
  }

  @ApiOperation({ summary: 'Sign out everywhere else' })
  @ApiBearerAuth()
  @UseGuards(AdminGuard)
  @Delete('sessions')
  @HttpCode(204)
  revokeOthers(
    @CurrentAdmin() admin: AdminUser,
    @AdminSessionId() sid: string,
  ) {
    return this.auth.revokeOthers(admin, sid);
  }
}

// ---- dashboard data & actions ------------------------------------------------

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly userAuth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @ApiOperation({ summary: 'KPIs, daily series and recent signups' })
  @Get('overview')
  overview(@Query() q: RangeQueryDto) {
    return this.admin.overview(q.days);
  }

  @ApiOperation({ summary: 'Practice funnel, reflections and category mix' })
  @Get('activity')
  activity(@Query() q: RangeQueryDto) {
    return this.admin.activity(q.days);
  }

  // waitlist

  @Get('waitlist')
  waitlist(@Query() q: ListWaitlistDto) {
    return this.admin.listWaitlist(q);
  }

  @Get('waitlist/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="theround-waitlist.csv"')
  async exportWaitlist() {
    const rows = await this.admin.exportWaitlist();
    return toCsv([
      ['Ticket', 'Email', 'Joined waitlist', 'Status', 'Invited at'],
      ...rows.map((r) => [
        r.ticketNumber,
        r.email,
        r.createdAt,
        r.status,
        r.invitedAt,
      ]),
    ]);
  }

  @ApiOperation({ summary: 'Add emails by hand (no confirmation email)' })
  @RequireRole('admin')
  @Post('waitlist')
  @HttpCode(200)
  addWaitlist(@CurrentAdmin() by: AdminUser, @Body() dto: AddWaitlistDto) {
    return this.admin.addWaitlist(by, dto.emails);
  }

  @ApiOperation({ summary: 'Send the launch invite email' })
  @RequireRole('admin')
  @Post('waitlist/invite')
  @HttpCode(200)
  invite(@CurrentAdmin() by: AdminUser, @Body() dto: IdsDto) {
    return this.admin.inviteWaitlist(by, dto.ids);
  }

  @RequireRole('admin')
  @Delete('waitlist/:id')
  @HttpCode(204)
  removeWaitlist(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.admin.removeWaitlist(by, id);
  }

  // users

  @Get('users')
  users(@Query() q: ListUsersDto) {
    return this.admin.listUsers(q);
  }

  @Get('users/:id')
  user(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getUser(id);
  }

  @ApiOperation({
    summary: 'Suspend or restore a user',
    description:
      'A suspended user is refused on sign-in and on every API call.',
  })
  @RequireRole('admin')
  @Patch('users/:id')
  suspend(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.admin.setSuspended(by, id, dto.suspended);
  }

  @ApiOperation({
    summary: "Turn off a user's two-factor",
    description:
      'For support when someone lost their phone and recovery codes.',
  })
  @RequireRole('admin')
  @Post('users/:id/reset-2fa')
  @HttpCode(204)
  async resetUserTwoFactor(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.userAuth.resetTwoFactor(id);
    await this.audit.record(by, 'user.2fa_reset', id);
  }

  @ApiOperation({ summary: 'Delete a user, their rounds and recordings' })
  @RequireRole('admin')
  @Delete('users/:id')
  @HttpCode(204)
  deleteUser(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.deleteUser(by, id);
  }

  // rounds

  @Get('rounds')
  rounds(@Query() q: ListAdminRoundsDto) {
    return this.admin.listRounds(q);
  }

  @ApiOperation({
    summary: 'Signed URL for a recording',
    description: 'Every listen is written to the audit log.',
  })
  @RequireRole('admin')
  @Get('rounds/:id/audio')
  audio(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.admin.roundAudio(
      by,
      id,
      `${req.protocol}://${req.get('host')}`,
    );
  }

  @RequireRole('admin')
  @Delete('rounds/:id')
  @HttpCode(204)
  deleteRound(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.deleteRound(by, id);
  }

  // catalog

  @ApiOperation({
    summary: 'Categories → topics → questions, with practice counts',
  })
  @Get('catalog')
  catalog() {
    return this.admin.catalog();
  }

  @RequireRole('admin')
  @Post('catalog/categories')
  createCategory(
    @CurrentAdmin() by: AdminUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.admin.createCategory(by, dto);
  }

  @RequireRole('admin')
  @Put('catalog/categories/order')
  @HttpCode(204)
  reorder(@CurrentAdmin() by: AdminUser, @Body() dto: ReorderCategoriesDto) {
    return this.admin.reorderCategories(by, dto.ids);
  }

  @RequireRole('admin')
  @Patch('catalog/categories/:id')
  updateCategory(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.admin.updateCategory(by, id, dto);
  }

  @RequireRole('admin')
  @Delete('catalog/categories/:id')
  @HttpCode(204)
  deleteCategory(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.deleteCategory(by, id);
  }

  @RequireRole('admin')
  @Post('catalog/topics')
  createTopic(@CurrentAdmin() by: AdminUser, @Body() dto: CreateTopicDto) {
    return this.admin.createTopic(by, dto);
  }

  @RequireRole('admin')
  @Patch('catalog/topics/:id')
  updateTopic(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTopicDto,
  ) {
    return this.admin.updateTopic(by, id, dto.name);
  }

  @RequireRole('admin')
  @Delete('catalog/topics/:id')
  @HttpCode(204)
  deleteTopic(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.deleteTopic(by, id);
  }

  @RequireRole('admin')
  @Post('catalog/questions')
  createQuestion(
    @CurrentAdmin() by: AdminUser,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.admin.createQuestion(by, dto);
  }

  @RequireRole('admin')
  @Patch('catalog/questions/:id')
  updateQuestion(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.admin.updateQuestion(by, id, dto.text);
  }

  @RequireRole('admin')
  @Delete('catalog/questions/:id')
  @HttpCode(204)
  deleteQuestion(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.deleteQuestion(by, id);
  }
}

// ---- settings, audit, team ---------------------------------------------------

@ApiTags('Admin · Settings')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminSettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.describe();
  }

  @RequireRole('admin')
  @Patch('settings')
  async updateSettings(
    @CurrentAdmin() by: AdminUser,
    @Body() dto: UpdateSettingsDto,
  ) {
    const result = await this.settings.update(dto.values, by.email);
    await this.audit.record(by, 'settings.update', null, dto.values);
    return result;
  }

  @Get('audit')
  auditLog(@Query() q: AuditQueryDto) {
    return this.audit.list(q);
  }

  @Get('team')
  team() {
    return this.auth.listAdmins();
  }

  @RequireRole('owner')
  @Post('team')
  createAdmin(@CurrentAdmin() by: AdminUser, @Body() dto: CreateAdminDto) {
    return this.auth.createAdmin(by, dto);
  }

  @RequireRole('owner')
  @Patch('team/:id')
  updateAdmin(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminDto,
  ) {
    return this.auth.updateAdmin(by, id, dto);
  }

  @RequireRole('owner')
  @Delete('team/:id')
  @HttpCode(204)
  deleteAdmin(
    @CurrentAdmin() by: AdminUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auth.deleteAdmin(by, id);
  }
}
