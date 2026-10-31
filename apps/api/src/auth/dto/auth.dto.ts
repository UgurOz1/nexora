import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // Upper bound stops someone sending a 10 MB "password" to burn CPU in the hash function.
  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}

export class AccessTokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900 })
  expiresIn!: number;
}
