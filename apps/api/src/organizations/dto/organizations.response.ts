import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';

export class OrganizationBriefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;
}

export class OrganizationResponseDto extends OrganizationBriefDto {
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

// An organization as seen by one of its members: includes their role in it.
export class OrganizationWithRoleDto extends OrganizationBriefDto {
  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;
}

export class OrganizationDetailDto extends OrganizationResponseDto {
  @ApiProperty()
  memberCount!: number;
}

export class MemberUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;
}

export class MemberResponseDto {
  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: MemberUserDto })
  user!: MemberUserDto;
}

export class MemberRoleChangeResponseDto {
  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;

  @ApiProperty({ type: MemberUserDto })
  user!: MemberUserDto;
}

export class InvitationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: Role, enumName: 'Role' })
  role!: Role;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: string;
}

export class PendingInvitationResponseDto extends InvitationResponseDto {
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}
