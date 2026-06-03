import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth/jwt-auth.guard'
import { ValidateResourcesIdsInterceptor } from 'src/common/interceptors/validate-resources-ids.interceptor'
import { DashboardSummaryDTO } from './dashboard.dto'
import { DashboardService } from './dashboard.service'

@Controller({ path: 'dashboard', version: '1' })
@UseInterceptors(ValidateResourcesIdsInterceptor)
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiResponse({ type: DashboardSummaryDTO })
  getSummary() {
    return this.dashboardService.getSummary()
  }
}
