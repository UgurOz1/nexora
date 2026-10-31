import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import type { Role } from '../../generated/prisma/client';
import { ASSIGNABLE_ROLES } from '../roles';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class OrganizationNameDto {
  @ApiProperty({ example: 'Acme Software', minLength: 2, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;
}

export class InviteMemberDto {
  @ApiProperty({ example: 'grace@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: ASSIGNABLE_ROLES, example: 'MEMBER' })
  @IsIn(ASSIGNABLE_ROLES)
  role!: Role;
}

export class ChangeRoleDto {
  @ApiProperty({ enum: ASSIGNABLE_ROLES, example: 'MANAGER' })
  @IsIn(ASSIGNABLE_ROLES)
  role!: Role;
}

export class AcceptInvitationDto {
  @ApiProperty({ description: 'Token from the invitation email link' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  token!: string;
}
