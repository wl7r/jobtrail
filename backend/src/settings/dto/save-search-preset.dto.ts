import { Transform } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsEnum,
  IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min,
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

  @IsString() @MaxLength(2000)
  searchTerm!: string;

  @IsString() @MaxLength(2000)
  location!: string;

  @IsIn(['sweden', 'denmark'])
  country!: 'sweden' | 'denmark';

  @IsOptional() @IsInt() @Min(1) @Max(2147483647)
  hoursOld?: number | null;

  @IsBoolean()
  isRemote!: boolean;

  @IsOptional() @IsEnum(JobType)
  jobType?: JobType | null;

  @IsString() @MaxLength(2000)
  includeKeywords!: string;

  @IsString() @MaxLength(2000)
  excludeKeywords!: string;

  @IsOptional() @IsBoolean()
  automatic?: boolean;
}
