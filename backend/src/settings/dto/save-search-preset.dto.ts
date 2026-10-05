import { Transform } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEnum,
  IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';
import { JobType } from '@prisma/client';
import { DISCOVER_SITES, DiscoverSite } from '../../discover/dto/discover.dto';

export class SaveSearchPresetDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(80)
  name!: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7) @ArrayUnique()
  @IsIn(DISCOVER_SITES, { each: true })
  sites!: DiscoverSite[];

  @IsString()
  searchTerm!: string;

  @IsString()
  location!: string;

  @IsIn(['sweden', 'denmark'])
  country!: 'sweden' | 'denmark';

  @IsOptional() @IsInt() @Min(1)
  hoursOld?: number;

  @IsBoolean()
  isRemote!: boolean;

  @IsOptional() @IsEnum(JobType)
  jobType?: JobType;

  @IsString()
  includeKeywords!: string;

  @IsString()
  excludeKeywords!: string;
}
