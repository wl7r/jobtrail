import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { JobSource, JobType } from '@prisma/client';

// Sites JobSpy supports for search. `manual` is excluded — it's only valid for tracker entries.
export const DISCOVER_SITES = [
  JobSource.linkedin,
  JobSource.indeed,
  JobSource.glassdoor,
  JobSource.google,
  JobSource.ziprecruiter,
  JobSource.arbetsformedlingen,
  JobSource.jobadlinks,
] as const;
export type DiscoverSite = (typeof DISCOVER_SITES)[number];

export class DiscoverSearchDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(7)
  @IsIn(DISCOVER_SITES, { each: true })
  sites!: DiscoverSite[];

  @IsString()
  searchTerm!: string;

  @IsOptional() @IsString()
  location?: string;

  @IsOptional() @IsIn(['sweden', 'denmark'])
  country?: 'sweden' | 'denmark';

  @IsOptional() @IsInt() @Min(1) @Max(100)
  resultsWanted?: number;

  // For the frontend "Load more" pagination — skip the first N results.
  @IsOptional() @IsInt() @Min(0) @Max(2000)
  offset?: number;

  @IsOptional() @IsInt() @Min(1)
  hoursOld?: number;

  @IsOptional() @IsBoolean()
  isRemote?: boolean;

  @IsOptional() @IsString()
  jobType?: string;
}

export class DiscoverImportDto {
  @IsIn(DISCOVER_SITES)
  source!: DiscoverSite;

  @IsString()
  sourceJobId!: string;

  @IsString()
  company!: string;

  @IsString()
  position!: string;

  @IsOptional() @IsString()
  jobUrl?: string;

  // Domain of the company's website, when JobSpy returns one. Strong dedup signal for the
  // CompaniesService cache lookup — bypasses the normalized-name match when present.
  @IsOptional() @IsString()
  companyUrl?: string;

  @IsOptional() @IsString()
  location?: string;

  @IsOptional() @IsInt()
  salaryMin?: number;

  @IsOptional() @IsInt()
  salaryMax?: number;

  @IsOptional() @IsString()
  salaryCurrency?: string;

  @IsOptional() @IsBoolean()
  remote?: boolean;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsEnum(JobType)
  jobType?: JobType;
}
