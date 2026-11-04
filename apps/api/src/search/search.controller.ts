import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentMembership } from '../common/auth/current-membership.decorator';
import { OrgMembership } from '../common/auth/current-user.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { SearchQueryDto, SearchResponseDto } from './dto/search.dto';
import { SearchService } from './search.service';

// Every member searches the whole organization: members can already read all its projects and
// tasks, so search shows nothing the lists would not.
@ApiTags('search')
@ApiBearerAuth()
@Controller('organizations/:orgId/search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @RateLimit('search')
  @ApiOkResponse({ type: SearchResponseDto })
  find(@CurrentMembership() actor: OrgMembership, @Query() query: SearchQueryDto) {
    return this.search.search(actor.organizationId, query);
  }
}
