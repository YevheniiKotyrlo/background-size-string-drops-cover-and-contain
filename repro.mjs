// Runs React Native's `backgroundSize` style processor, `processBackgroundSize`,
// as each named release publishes it, over size lists with and without
// `cover` and `contain`.
//
// Usage: node repro.mjs [react-native version | path to a processBackgroundSize.js]...
// Exit status: 1 while a string holding `cover` or `contain` loses its sizes,
// 0 once every case gives its expected result, 2 when a step fails or a case
// holding neither keyword gives another result.

import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {basename, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {gunzipSync} from 'node:zlib';

/** @type {(source: string, options: {all: boolean}) => {toString(): string}} */
const flowRemoveTypes = createRequire(import.meta.url)('flow-remove-types');

const MODULE_IN_PACKAGE = 'package/Libraries/StyleSheet/processBackgroundSize.js';
const DEFAULT_VERSIONS = ['0.88.1', '0.90.0-nightly-20261122-d6ea9fc1e'];

const CASES = [
  {input: '10px auto, 50%', expected: [{x: 10, y: 'auto'}, {x: '50%', y: 'auto'}], keyword: false},
  {input: [{x: 10, y: 'auto'}, 'cover'], expected: [{x: 10, y: 'auto'}, 'cover'], keyword: false},
  {input: 'cover', expected: ['cover'], keyword: true},
  {input: 'contain', expected: ['contain'], keyword: true},
  {input: '10px auto, cover', expected: [{x: 10, y: 'auto'}, 'cover'], keyword: true},
];

const VERDICTS = ['every case as expected', 'a string holding cover or contain loses its sizes', 'a step failed or a case without the keywords changed'];

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response;
}

function readTarEntry(archive, path) {
  for (let offset = 0; offset + 512 <= archive.length; ) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      break;
    }
    const field = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0[\s\S]*$/, '');
    const name = [field(345, 155), field(0, 100)].filter(part => part.length > 0).join('/');
    const size = parseInt(field(124, 12).trim(), 8);
    const start = offset + 512;
    if (name === path) {
      return archive.subarray(start, start + size).toString('utf8');
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${path} is not in the package`);
}

async function publishedSource(version) {
  const manifest = await (await fetchOk(`https://registry.npmjs.org/react-native/${encodeURIComponent(version)}`)).json();
  const tarball = Buffer.from(await (await fetchOk(manifest.dist.tarball)).arrayBuffer());
  const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
  if (integrity !== manifest.dist.integrity) {
    throw new Error(`${manifest.dist.tarball} does not match its integrity ${manifest.dist.integrity}`);
  }
  return {label: `react-native@${manifest.version} (gitHead ${manifest.gitHead})`, source: readTarEntry(gunzipSync(tarball), MODULE_IN_PACKAGE)};
}

async function loadProcessor(source, file) {
  writeFileSync(file, flowRemoveTypes(source, {all: true}).toString());
  return (await import(pathToFileURL(file).href)).default;
}

function runCase(processBackgroundSize, {input, expected, keyword}) {
  let seen;
  let matches = false;
  try {
    const value = processBackgroundSize(input);
    seen = JSON.stringify(value);
    matches = isDeepStrictEqual(value, expected);
  } catch (error) {
    seen = `throws ${error instanceof Error ? error.message : String(error)}`;
  }
  console.log(`  processBackgroundSize(${JSON.stringify(input)}) -> ${seen}${matches ? '' : `, expected ${JSON.stringify(expected)}`}`);
  return matches ? 0 : keyword ? 1 : 2;
}

async function runTarget(target, file) {
  let label = target.endsWith('.js') ? basename(target) : `react-native@${target}`;
  let processBackgroundSize;
  try {
    const published = target.endsWith('.js') ? {label, source: readFileSync(target, 'utf8')} : await publishedSource(target);
    label = published.label;
    processBackgroundSize = await loadProcessor(published.source, file);
  } catch (error) {
    console.log(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return {label, verdict: 2};
  }
  console.log(`${label}:`);
  return {label, verdict: Math.max(...CASES.map(testCase => runCase(processBackgroundSize, testCase)))};
}

console.log(`node ${process.version}, ${process.platform} ${process.arch}`);
const targets = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_VERSIONS;
const folder = mkdtempSync(join(tmpdir(), 'background-size-'));
const results = [];
try {
  for (const [index, target] of targets.entries()) {
    results.push(await runTarget(target, join(folder, `processBackgroundSize-${index}.mjs`)));
  }
} finally {
  rmSync(folder, {recursive: true, force: true});
}
const status = Math.max(...results.map(result => result.verdict));
console.log(`Summary: ${results.map(result => `${result.label}: ${VERDICTS[result.verdict]}`).join('; ')}; exit ${status}`);
process.exitCode = status;
