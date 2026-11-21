// Compile-only checks: generated browser types must match the approved wire design.
// These imports are erased; no NestJS, Prisma or application runtime is imported.
import type * as Generated from '../lib/portfolio/contracts';
import type * as Design from '../../docs/portfolio-content/dto-contracts';

type Assert<T extends true> = T;
type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export type PortfolioContractChecks = [
  Assert<SameShape<Generated.PortfolioSiteDto, Design.PortfolioSiteDto>>,
  Assert<SameShape<Generated.PortfolioHomeDto, Design.PortfolioHomeDto>>,
  Assert<SameShape<Generated.PortfolioServiceDto, Design.PortfolioServiceDto>>,
  Assert<SameShape<Generated.PortfolioStoryDto, Design.PortfolioStoryDto>>,
  Assert<SameShape<Generated.PortfolioServiceListDto, Design.PortfolioServiceListDto>>,
  Assert<SameShape<Generated.PortfolioSitemapDto, Design.PortfolioSitemapDto>>,
  Assert<
    SameShape<Generated.PortfolioHomePageDto, Design.PortfolioPageDto<Design.PortfolioHomeDto>>
  >,
  Assert<
    SameShape<
      Generated.PortfolioServicePageDto,
      Design.PortfolioPageDto<Design.PortfolioServiceDto>
    >
  >,
  Assert<
    SameShape<Generated.PortfolioStoryPageDto, Design.PortfolioPageDto<Design.PortfolioStoryDto>>
  >,
  Assert<SameShape<Generated.PortfolioServiceDraftInputDto, Design.PortfolioServiceDraftInputDto>>,
  Assert<SameShape<Generated.PortfolioStoryDraftInputDto, Design.PortfolioStoryDraftInputDto>>,
  Assert<SameShape<Generated.PortfolioHomeDraftInputDto, Design.PortfolioHomeDraftInputDto>>,
  Assert<
    SameShape<
      Generated.AdminPortfolioServiceDto,
      Design.AdminPortfolioEntityDto<Design.PortfolioServiceDraftInputDto>
    >
  >,
  Assert<SameShape<Generated.AdminPortfolioStoryDto, Design.AdminPortfolioStoryDto>>,
  Assert<
    SameShape<
      Generated.AdminPortfolioSettingsDto,
      Design.AdminPortfolioEntityDto<Design.PortfolioHomeDraftInputDto>
    >
  >,
  Assert<SameShape<Generated.AdminPortfolioMediaDto, Design.AdminPortfolioMediaDto>>,
  Assert<SameShape<Generated.PortfolioUploadResponseDto, Design.PortfolioUploadResponseDto>>,
  Assert<SameShape<Generated.RequestPortfolioUploadDto, Design.RequestPortfolioUploadDto>>,
  Assert<SameShape<Generated.ReplaceStoryPhotosDto, Design.ReplaceStoryPhotosDto>>,
  Assert<
    SameShape<Generated.PortfolioPublicationResponseDto, Design.PortfolioPublicationResponseDto>
  >,
  Assert<SameShape<Generated.PortfolioApiErrorDto, Design.PortfolioApiErrorDto>>,
  Assert<
    SameShape<
      Generated.PortfolioHomePreviewDto,
      Design.PortfolioPreviewDto<Design.PortfolioHomeDto>
    >
  >,
  Assert<
    SameShape<
      Generated.PortfolioServicePreviewDto,
      Design.PortfolioPreviewDto<Design.PortfolioServiceDto>
    >
  >,
  Assert<
    SameShape<
      Generated.PortfolioStoryPreviewDto,
      Design.PortfolioPreviewDto<Design.PortfolioStoryDto>
    >
  >,
];
