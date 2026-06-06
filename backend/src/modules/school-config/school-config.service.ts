import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UpsertConfigDto,
  BulkUpsertConfigDto,
  UpdateOnboardingDto,
} from './dto';

@Injectable()
export class SchoolConfigService {
  constructor(private prisma: PrismaService) {}

  // ─── GET ALL CONFIGS ────────────────────────────────────────────────────────

  async findAll() {
    const configs = await this.prisma.schoolConfig.findMany({
      orderBy: { key: 'asc' },
    });
    // Return as key-value map for convenience
    const map: Record<string, string> = {};
    for (const c of configs) {
      map[c.key] = c.value;
    }
    return { configs, map };
  }

  // ─── PUBLIC BRANDING (no auth) ──────────────────────────────────────────────
  // The login page and every role's shell need the school name, colour and logo
  // before/without authentication, so these few non-sensitive keys are exposed
  // publicly. Nothing else is returned.

  async getPublicBranding() {
    const keys = [
      'school_name',
      'school_motto',
      'primary_color',
      'logo_url',
    ];
    const configs = await this.prisma.schoolConfig.findMany({
      where: { key: { in: keys } },
    });
    const map: Record<string, string> = {};
    for (const c of configs) map[c.key] = c.value;
    return {
      schoolName: map.school_name || 'Markova',
      schoolMotto: map.school_motto || '',
      primaryColor: map.primary_color || '#1B4F72',
      logoUrl: map.logo_url || '',
    };
  }

  // ─── GET SINGLE CONFIG ──────────────────────────────────────────────────────

  async findByKey(key: string) {
    const config = await this.prisma.schoolConfig.findUnique({
      where: { key },
    });
    if (!config) {
      throw new NotFoundException(`Config key "${key}" not found`);
    }
    return config;
  }

  // ─── UPSERT SINGLE ─────────────────────────────────────────────────────────

  async upsert(dto: UpsertConfigDto) {
    return this.prisma.schoolConfig.upsert({
      where: { key: dto.key },
      update: { value: dto.value },
      create: { key: dto.key, value: dto.value },
    });
  }

  // ─── BULK UPSERT ───────────────────────────────────────────────────────────

  async bulkUpsert(dto: BulkUpsertConfigDto) {
    const results = [];
    for (const config of dto.configs) {
      const result = await this.prisma.schoolConfig.upsert({
        where: { key: config.key },
        update: { value: config.value },
        create: { key: config.key, value: config.value },
      });
      results.push(result);
    }
    return results;
  }

  // ─── DELETE CONFIG ──────────────────────────────────────────────────────────

  async delete(key: string) {
    const config = await this.prisma.schoolConfig.findUnique({
      where: { key },
    });
    if (!config) {
      throw new NotFoundException(`Config key "${key}" not found`);
    }
    await this.prisma.schoolConfig.delete({ where: { key } });
    return { message: `Config "${key}" deleted` };
  }

  // ─── ONBOARDING STATUS ─────────────────────────────────────────────────────

  async getOnboardingStatus() {
    const step = await this.prisma.schoolConfig.findUnique({
      where: { key: 'onboarding_step' },
    });
    const completed = await this.prisma.schoolConfig.findUnique({
      where: { key: 'onboarding_completed' },
    });
    return {
      currentStep: step?.value ? parseInt(step.value) : 0,
      completed: completed?.value === 'true',
    };
  }

  async updateOnboarding(dto: UpdateOnboardingDto) {
    await this.prisma.schoolConfig.upsert({
      where: { key: 'onboarding_step' },
      update: { value: dto.currentStep },
      create: { key: 'onboarding_step', value: dto.currentStep },
    });

    if (dto.completed) {
      await this.prisma.schoolConfig.upsert({
        where: { key: 'onboarding_completed' },
        update: { value: dto.completed },
        create: { key: 'onboarding_completed', value: dto.completed },
      });
    }

    return this.getOnboardingStatus();
  }

  // ─── FILE UPLOAD HELPERS ────────────────────────────────────────────────────

  async updateBrandingFile(key: string, fileUrl: string) {
    return this.prisma.schoolConfig.upsert({
      where: { key },
      update: { value: fileUrl },
      create: { key, value: fileUrl },
    });
  }
}
