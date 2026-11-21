import 'reflect-metadata';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { portfolioModels } from '../dist/portfolio/portfolio-openapi.js';
import { format } from 'prettier';

// Schema-only build: no AppModule, database, Redis, storage credentials or stub API.
class ContractModule {}
Module({})(ContractModule);
const app = await NestFactory.create(ContractModule, { logger: false });
try {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('Portfolio contracts').setVersion('1').build(),
    { extraModels: portfolioModels },
  );
  const schemas = document.components.schemas;

  // Deliberately small converter for the schema constructs emitted by these DTOs.
  // Fail on unsupported constructs rather than silently widening a contract.
  function tsType(schema) {
    if (schema.oneOf || schema.anyOf || schema.not || schema.additionalProperties)
      throw new Error('Unsupported portfolio OpenAPI schema construct');
    let type;
    if (schema.$ref) {
      const name = schema.$ref.replace('#/components/schemas/', '');
      if (!Object.hasOwn(schemas, name)) throw new Error(`Unknown schema: ${name}`);
      type = name;
    } else if (schema.allOf) {
      type = schema.allOf.map((item) => `(${tsType(item)})`).join(' & ');
    } else if (schema.enum) {
      type = schema.enum.map((value) => JSON.stringify(value)).join(' | ');
    } else if (schema.type === 'array') {
      type = `Array<${tsType(schema.items)}>`;
    } else if (schema.type === 'object' || schema.properties) {
      const required = new Set(schema.required ?? []);
      type = `{\n${Object.entries(schema.properties ?? {})
        .map(
          ([key, value]) =>
            `  ${JSON.stringify(key)}${required.has(key) ? '' : '?'}: ${tsType(value)};`,
        )
        .join('\n')}\n}`;
    } else if (schema.type === 'integer' || schema.type === 'number') type = 'number';
    else if (schema.type === 'string' || schema.type === 'boolean') type = schema.type;
    else throw new Error(`Unsupported portfolio schema: ${JSON.stringify(schema)}`);
    return schema.nullable ? `(${type}) | null` : type;
  }

  const types =
    '// Generated from NestJS Portfolio OpenAPI schemas. Do not edit.\n' +
    '// Regenerate: npm --prefix backend run portfolio:contracts\n\n' +
    Object.keys(schemas)
      .sort()
      .map((name) => `export type ${name} = ${tsType(schemas[name])};\n`)
      .join('\n');
  const outputs = [
    [
      new URL('../../docs/portfolio-content/openapi.json', import.meta.url),
      JSON.stringify(document, null, 2) + '\n',
    ],
    [
      new URL('../../frontend/lib/portfolio/contracts.ts', import.meta.url),
      await format(types, { parser: 'typescript', singleQuote: true }),
    ],
  ];
  for (const [target, content] of outputs) {
    if (process.argv.includes('--check')) {
      if ((await readFile(target, 'utf8')) !== content)
        throw new Error(`Stale generated contract: ${target.pathname}`);
    } else {
      await mkdir(new URL('.', target), { recursive: true });
      await writeFile(target, content);
    }
  }
  console.log(
    process.argv.includes('--check')
      ? 'Portfolio contracts are current.'
      : 'Portfolio contracts generated.',
  );
} finally {
  await app.close();
}
