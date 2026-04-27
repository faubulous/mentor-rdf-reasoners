import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';
import { NTriplesLexer, NTriplesParser, NTriplesReader } from '@faubulous/mentor-rdf-parsers';
import { OwlRlReasoner } from '../dist/index.js';

const { namedNode, quad } = DataFactory;

function readIntEnv(name, fallback) {
    const raw = process.env[name];

    if (!raw || raw.trim() === '') {
        return fallback;
    }

    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value)) {
        throw new Error(`${name} must be an integer`);
    }

    return value;
}

function readBoolEnv(name, fallback) {
    const raw = process.env[name];

    if (!raw || raw.trim() === '') {
        return fallback;
    }

    const value = raw.trim().toLowerCase();
    if (value === '1' || value === 'true' || value === 'yes' || value === 'on') {
        return true;
    }
    if (value === '0' || value === 'false' || value === 'no' || value === 'off') {
        return false;
    }

    throw new Error(`${name} must be a boolean (true/false, 1/0, yes/no, on/off)`);
}

const baseUrl = process.env.MOBIBENCH_BASE_URL ?? 'https://william-vw.github.io/mobibench/web/res/owl/data/ore-small';
const first = readIntEnv('MOBIBENCH_FIRST', 0);
const last = readIntEnv('MOBIBENCH_LAST', 188);
const rounds = readIntEnv('MOBIBENCH_ROUNDS', 3);
const warmupFiles = readIntEnv('MOBIBENCH_WARMUP', 5);
const sourceGraphIri = process.env.MOBIBENCH_SOURCE_GRAPH ?? 'https://example.org/mobibench/source';
const enableEqRef = readBoolEnv('MOBIBENCH_EQ_REF', false);

if (first < 0 || last < first) {
    throw new Error('MOBIBENCH_FIRST/MOBIBENCH_LAST define an invalid range');
}
if (rounds <= 0) {
    throw new Error('MOBIBENCH_ROUNDS must be a positive integer');
}
if (warmupFiles < 0) {
    throw new Error('MOBIBENCH_WARMUP must be >= 0');
}

const sourceGraph = namedNode(sourceGraphIri);
const lexer = new NTriplesLexer();
const parser = new NTriplesParser();
const reader = new NTriplesReader();
const reasoner = new OwlRlReasoner({ enableEqRef });

function parseNTriples(ntriples) {
    const lexResult = lexer.tokenize(ntriples);
    parser.input = lexResult.tokens;
    const cst = parser.ntriplesDoc();

    return reader.readQuadContexts(cst);
}

function mean(values) {
    return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function min(values) {
    return Math.min(...values);
}

function max(values) {
    return Math.max(...values);
}

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }

    return await response.text();
}

async function loadCorpus() {
    const docs = [];

    for (let id = first; id <= last; id++) {
        const url = `${baseUrl}/${id}.nt`;
        const text = await fetchText(url);
        docs.push({ id, url, text, bytes: Buffer.byteLength(text, 'utf8') });
    }

    return docs;
}

function parseCorpus(docs) {
    const parsed = [];

    for (const doc of docs) {
        const triples = parseNTriples(doc.text);
        parsed.push({
            id: doc.id,
            url: doc.url,
            bytes: doc.bytes,
            triples,
        });
    }

    return parsed;
}

function runInferenceRound(parsed) {
    let totalInferMs = 0;
    let totalLoadMs = 0;
    let totalInferred = 0;

    for (const doc of parsed) {
        const store = RdfStore.createDefault().asDataset();

        const loadStart = performance.now();
        for (const triple of doc.triples) {
            store.add(quad(triple.subject, triple.predicate, triple.object, sourceGraph));
        }
        const loadEnd = performance.now();

        const inferStart = performance.now();
        for (const _ of reasoner.infer(store, [sourceGraph])) {
            totalInferred++;
        }
        const inferEnd = performance.now();

        totalLoadMs += (loadEnd - loadStart);
        totalInferMs += (inferEnd - inferStart);
    }

    return {
        totalLoadMs,
        totalInferMs,
        totalInferred,
    };
}

const runStartedAt = new Date().toISOString();
const fetchStart = performance.now();
const docs = await loadCorpus();
const fetchEnd = performance.now();

const parseStart = performance.now();
const parsed = parseCorpus(docs);
const parseEnd = performance.now();

const warmup = parsed.slice(0, Math.min(warmupFiles, parsed.length));
for (const doc of warmup) {
    const store = RdfStore.createDefault().asDataset();
    for (const triple of doc.triples) {
        store.add(quad(triple.subject, triple.predicate, triple.object, sourceGraph));
    }
    for (const _ of reasoner.infer(store, [sourceGraph])) {
    }
}

const roundResults = [];
for (let round = 1; round <= rounds; round++) {
    const result = runInferenceRound(parsed);
    roundResults.push({
        round,
        totalLoadMs: result.totalLoadMs,
        totalInferMs: result.totalInferMs,
        totalInferred: result.totalInferred,
    });
}

const files = parsed.length;
const totalBytes = docs.reduce((acc, d) => acc + d.bytes, 0);
const totalTriples = parsed.reduce((acc, d) => acc + d.triples.length, 0);

const inferMsSamples = roundResults.map(x => x.totalInferMs);
const loadMsSamples = roundResults.map(x => x.totalLoadMs);
const inferredSamples = roundResults.map(x => x.totalInferred);

const inferMsMean = mean(inferMsSamples);
const inferMsMin = min(inferMsSamples);
const inferMsMax = max(inferMsSamples);
const loadMsMean = mean(loadMsSamples);
const inferredMean = mean(inferredSamples);

const summary = {
    corpus: 'MobiBench OWL2 RL Benchmark Corpus',
    source: {
        baseUrl,
        range: `${first}-${last}`,
        sourceGraph: sourceGraphIri,
        enableEqRef,
    },
    run: {
        startedAt: runStartedAt,
        rounds,
        warmupFiles,
    },
    dataset: {
        files,
        totalBytes,
        totalTriples,
    },
    setupMs: {
        fetch: fetchEnd - fetchStart,
        parse: parseEnd - parseStart,
    },
    inference: {
        inferMsMean,
        inferMsMin,
        inferMsMax,
        loadMsMean,
        inferredMean,
        avgInferMsPerFile: inferMsMean / files,
        triplesPerSecond: totalTriples / (inferMsMean / 1000),
        inferredPerSecond: inferredMean / (inferMsMean / 1000),
    },
    rounds: roundResults.map(round => ({
        round: round.round,
        totalLoadMs: Number(round.totalLoadMs.toFixed(3)),
        totalInferMs: Number(round.totalInferMs.toFixed(3)),
        totalInferred: round.totalInferred,
        avgInferMsPerFile: Number((round.totalInferMs / files).toFixed(3)),
        triplesPerSecond: Number((totalTriples / (round.totalInferMs / 1000)).toFixed(2)),
        inferredPerSecond: Number((round.totalInferred / (round.totalInferMs / 1000)).toFixed(2)),
    })),
};

mkdirSync('benchmarks', { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = join('benchmarks', `mobibench-owl2rl-${timestamp}.json`);
writeFileSync(outFile, JSON.stringify(summary, null, 2));

console.log(`MobiBench benchmark report written to ${outFile}`);
console.log(JSON.stringify({
    files,
    totalTriples,
    rounds,
    inferMsMean: Number(inferMsMean.toFixed(3)),
    inferMsMin: Number(inferMsMin.toFixed(3)),
    inferMsMax: Number(inferMsMax.toFixed(3)),
    avgInferMsPerFile: Number((inferMsMean / files).toFixed(3)),
    triplesPerSecond: Number((totalTriples / (inferMsMean / 1000)).toFixed(2)),
    inferredPerSecond: Number((inferredMean / (inferMsMean / 1000)).toFixed(2)),
}, null, 2));
