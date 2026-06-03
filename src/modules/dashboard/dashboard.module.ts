import { Module } from '@nestjs/common'
import { RequestContextService } from 'src/common/services/request-context/request-context.service'
import { DashboardController } from './dashboard.controller'
import { DashboardService } from './dashboard.service'

@Module({
  providers: [DashboardService, RequestContextService],
  controllers: [DashboardController],
})
export class DashboardModule {}
