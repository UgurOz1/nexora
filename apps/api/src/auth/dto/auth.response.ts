import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';

// Response shapes, written down for the OpenAPI document (and so for the typed web client).
// They describe what the services already return; they do not change any behaviour.

export class MessageResponseDto {
  @ApiProperty()
  message!: string;
}

export class MeOrganizationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;
}

export class MeMembershipDto {
  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;

  @ApiProperty({ type: MeOrganizationDto })
  organization!: MeOrganizationDto;
}

export class MeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  emailVerifiedAt!: string | null;

  @ApiProperty({ type: [MeMembershipDto] })
  memberships!: MeMembershipDto[];
}
