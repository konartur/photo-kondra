import { applyDecorators, type Type as NestType } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsInt,
  IsObject,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/** Required metadata fields: omission is different from an explicit nullable value. */
export function Text(maxLength: number) {
  return applyDecorators(
    ApiProperty({ type: String, maxLength }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() : value,
    ),
    IsString(),
    MaxLength(maxLength),
  );
}

export function Integer(minimum: number, maximum = Number.MAX_SAFE_INTEGER) {
  return applyDecorators(
    ApiProperty({ type: 'integer', minimum, maximum }),
    IsInt(),
    Min(minimum),
    Max(maximum),
  );
}

export function Nested(model: NestType<object>, nullable = false) {
  return applyDecorators(
    ApiProperty({ type: () => model, nullable }),
    ...(nullable ? [ValidateIf((_object, value: unknown) => value !== null)] : []),
    IsDefined(),
    IsObject(),
    ValidateNested(),
    Type(() => model),
  );
}

export function NestedList(model: NestType<object>, maxItems: number) {
  return applyDecorators(
    ApiProperty({ type: () => [model], maxItems }),
    IsArray(),
    ArrayMaxSize(maxItems),
    ValidateNested({ each: true }),
    Type(() => model),
  );
}
