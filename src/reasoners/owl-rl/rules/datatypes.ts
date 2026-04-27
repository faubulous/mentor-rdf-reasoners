/**
 * OWL 2 RL — Table 8: Datatype rules (dt-*)
 *
 * Implements:
 * - dt-type1:    axiomatic rdfs:Datatype typings and XSD subtype hierarchy (via dtAxioms).
 * - dt-type2:    for each well-typed literal appearing as a quad object, emit `lt rdf:type DT`.
 * - dt-not-type: detect inconsistency when a literal is typed with two disjoint datatypes.
 * - dt-eq:       emit `lt1 owl:sameAs lt2` when two literals share the same parsed value.
 * - dt-diff:     emit `lt1 owl:differentFrom lt2` when same-family literals have different values.
 */
import * as rdfjs from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import { QuadIndex } from '../../quad-index.js';
import { infer, type InferenceResult } from '../../inference-result.js';
import { RDF, owl, rdfs } from '../vocabulary.js';
import { parseXsdValue, xsdValuesEqual, areTypesDisjoint } from '../utils/xsd-value.js';

const { namedNode } = DataFactory;

const makeTriple = (s: rdfjs.Quad_Subject, p: rdfjs.Quad_Predicate, o: rdfjs.Quad_Object): rdfjs.Quad =>
    DataFactory.quad(s, p, o);

/** OWL 2 RL supported datatypes (from the spec, section 4.2). */
const OWL2_RL_DATATYPES = [
    'http://www.w3.org/2001/XMLSchema#string',
    'http://www.w3.org/2001/XMLSchema#boolean',
    'http://www.w3.org/2001/XMLSchema#decimal',
    'http://www.w3.org/2001/XMLSchema#integer',
    'http://www.w3.org/2001/XMLSchema#double',
    'http://www.w3.org/2001/XMLSchema#float',
    'http://www.w3.org/2001/XMLSchema#date',
    'http://www.w3.org/2001/XMLSchema#time',
    'http://www.w3.org/2001/XMLSchema#dateTime',
    'http://www.w3.org/2001/XMLSchema#dateTimeStamp',
    'http://www.w3.org/2001/XMLSchema#gYear',
    'http://www.w3.org/2001/XMLSchema#gMonth',
    'http://www.w3.org/2001/XMLSchema#gDay',
    'http://www.w3.org/2001/XMLSchema#gYearMonth',
    'http://www.w3.org/2001/XMLSchema#gMonthDay',
    'http://www.w3.org/2001/XMLSchema#duration',
    'http://www.w3.org/2001/XMLSchema#yearMonthDuration',
    'http://www.w3.org/2001/XMLSchema#dayTimeDuration',
    'http://www.w3.org/2001/XMLSchema#anyURI',
    'http://www.w3.org/2001/XMLSchema#hexBinary',
    'http://www.w3.org/2001/XMLSchema#base64Binary',
    'http://www.w3.org/2001/XMLSchema#normalizedString',
    'http://www.w3.org/2001/XMLSchema#token',
    'http://www.w3.org/2001/XMLSchema#language',
    'http://www.w3.org/2001/XMLSchema#Name',
    'http://www.w3.org/2001/XMLSchema#NCName',
    'http://www.w3.org/2001/XMLSchema#NMTOKEN',
    'http://www.w3.org/2001/XMLSchema#nonNegativeInteger',
    'http://www.w3.org/2001/XMLSchema#positiveInteger',
    'http://www.w3.org/2001/XMLSchema#nonPositiveInteger',
    'http://www.w3.org/2001/XMLSchema#negativeInteger',
    'http://www.w3.org/2001/XMLSchema#long',
    'http://www.w3.org/2001/XMLSchema#int',
    'http://www.w3.org/2001/XMLSchema#short',
    'http://www.w3.org/2001/XMLSchema#byte',
    'http://www.w3.org/2001/XMLSchema#unsignedLong',
    'http://www.w3.org/2001/XMLSchema#unsignedInt',
    'http://www.w3.org/2001/XMLSchema#unsignedShort',
    'http://www.w3.org/2001/XMLSchema#unsignedByte',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#PlainLiteral',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#XMLLiteral',
    'http://www.w3.org/2000/01/rdf-schema#Literal',
    'http://www.w3.org/2001/XMLSchema#anyAtomicType',
];

/** XSD numeric datatype subtype hierarchy (dt-type2 basis). */
const XSD_SUBTYPE_HIERARCHY: [string, string][] = [
    // Integer hierarchy (signed)
    ['http://www.w3.org/2001/XMLSchema#byte', 'http://www.w3.org/2001/XMLSchema#short'],
    ['http://www.w3.org/2001/XMLSchema#short', 'http://www.w3.org/2001/XMLSchema#int'],
    ['http://www.w3.org/2001/XMLSchema#int', 'http://www.w3.org/2001/XMLSchema#long'],
    ['http://www.w3.org/2001/XMLSchema#long', 'http://www.w3.org/2001/XMLSchema#integer'],
    ['http://www.w3.org/2001/XMLSchema#integer', 'http://www.w3.org/2001/XMLSchema#decimal'],

    // Non-negative and positive integers
    ['http://www.w3.org/2001/XMLSchema#positiveInteger', 'http://www.w3.org/2001/XMLSchema#nonNegativeInteger'],
    ['http://www.w3.org/2001/XMLSchema#nonNegativeInteger', 'http://www.w3.org/2001/XMLSchema#integer'],

    // Non-positive and negative integers
    ['http://www.w3.org/2001/XMLSchema#negativeInteger', 'http://www.w3.org/2001/XMLSchema#nonPositiveInteger'],
    ['http://www.w3.org/2001/XMLSchema#nonPositiveInteger', 'http://www.w3.org/2001/XMLSchema#integer'],

    // Unsigned integer hierarchy
    ['http://www.w3.org/2001/XMLSchema#unsignedByte', 'http://www.w3.org/2001/XMLSchema#unsignedShort'],
    ['http://www.w3.org/2001/XMLSchema#unsignedShort', 'http://www.w3.org/2001/XMLSchema#unsignedInt'],
    ['http://www.w3.org/2001/XMLSchema#unsignedInt', 'http://www.w3.org/2001/XMLSchema#unsignedLong'],
    ['http://www.w3.org/2001/XMLSchema#unsignedLong', 'http://www.w3.org/2001/XMLSchema#nonNegativeInteger'],
    
    // String hierarchy
    ['http://www.w3.org/2001/XMLSchema#normalizedString', 'http://www.w3.org/2001/XMLSchema#string'],
    ['http://www.w3.org/2001/XMLSchema#token', 'http://www.w3.org/2001/XMLSchema#normalizedString'],
    ['http://www.w3.org/2001/XMLSchema#language', 'http://www.w3.org/2001/XMLSchema#token'],
    ['http://www.w3.org/2001/XMLSchema#Name', 'http://www.w3.org/2001/XMLSchema#token'],
    ['http://www.w3.org/2001/XMLSchema#NCName', 'http://www.w3.org/2001/XMLSchema#Name'],
    ['http://www.w3.org/2001/XMLSchema#NMTOKEN', 'http://www.w3.org/2001/XMLSchema#token'],
];

/** dt-type1: yield axiomatic rdfs:Datatype typing and XSD subtype hierarchy. */
export function* dtAxioms(): Iterable<rdfjs.Quad> {
    for (const dt of OWL2_RL_DATATYPES) {
        yield DataFactory.quad(namedNode(dt), namedNode(RDF.type), rdfs.Datatype);
    }

    for (const [sub, sup] of XSD_SUBTYPE_HIERARCHY) {
        yield DataFactory.quad(namedNode(sub), rdfs.subClassOf, namedNode(sup));
    }
}

// ---------------------------------------------------------------------------
// dt-type2 / dt-not-type  (single-quad rules)
// ---------------------------------------------------------------------------

/**
 * Single-quad datatype rules fired once per incoming quad.
 *
 * Rules applied:
 * - **dt-type2**: If `lt` is a well-typed literal (valid lexical form for its declared datatype),
 *   emit `lt rdf:type DT`.  This makes the literal's type explicit in the index so that
 *   range-propagation results and explicit typings can be compared by dt-not-type.
 * - **dt-not-type**: When `lt rdf:type DT` is newly emitted, cross-check against all types
 *   already in the index for the same literal.  If a previously asserted type is disjoint
 *   with `DT`, the graph is inconsistent.
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-datatypes
 */
export function* datatypesSingleQuad(quad: rdfjs.Quad, index: QuadIndex): Iterable<InferenceResult> {
    if (quad.object.termType !== 'Literal') return;

    const literal   = quad.object as rdfjs.Literal;
    const dt        = literal.datatype?.value;
    if (!dt) return;

    // Validate the lexical form; skip if the literal is not well-typed
    if (parseXsdValue(literal) === null) return;

    // dt-type2: emit `lt rdf:type DT`
    // @rdfjs/data-model accepts literals as subjects at runtime even though the
    // TypeScript type does not include Literal in Quad_Subject.
    const litAsSubject = literal as unknown as rdfjs.Quad_Subject;
    const rdfType      = namedNode(RDF.type);
    const dtNode       = namedNode(dt);
    const typeTriple   = makeTriple(litAsSubject, rdfType, dtNode);

    yield infer(typeTriple, 'dt-type2', quad);

    // dt-not-type: compare the new type against all types already indexed for this literal
    for (const existingType of index.getObjects(RDF.type, literal.value)) {
        if (existingType.termType !== 'NamedNode') continue;
        const existingDt = existingType.value;
        if (existingDt === dt) continue;

        if (areTypesDisjoint(dt, existingDt)) {
            const existingTypeTriple = makeTriple(litAsSubject, rdfType, namedNode(existingDt));
            yield infer(
                makeTriple(owl.Thing, rdfs.subClassOf, owl.Nothing),
                'dt-not-type',
                quad,
                typeTriple,
                existingTypeTriple,
            );
        }
    }
}

// ---------------------------------------------------------------------------
// dt-eq / dt-diff  (join rules over the full index)
// ---------------------------------------------------------------------------

/**
 * Join-based datatype rules fired once per fixpoint iteration.
 *
 * Rules applied:
 * - **dt-eq**:   For each pair of literals that parse to the same value in a shared
 *   value space, emit `lt1 owl:sameAs lt2`.
 * - **dt-diff**: For each pair of literals in the same value-space kind that parse
 *   to different values, emit `lt1 owl:differentFrom lt2`.
 *
 * Both rules operate only over literals that carry an explicit `rdf:type` assertion
 * (added by dt-type2 or prp-rng).  The pairwise scan is O(N²) in the number of
 * distinct typed literals.  Disable via `OwlRlReasonerOptions.datatypeJoins = false`
 * when performance is a concern.
 *
 * @see https://www.w3.org/TR/owl2-profiles/#tab-rules-datatypes
 */
export function* datatypesJoin(index: QuadIndex): Iterable<InferenceResult> {
    // Collect every (Literal, declaredDatatypeUri) pair visible in the index.
    // index.pairs(RDF.type) iterates all (subject, object) pairs for rdf:type.
    // When dt-type2 fires it stores the Literal as the subject; byST tracks the
    // actual term so pairs() returns the real Literal term, not a string.

    interface TypedLiteral {
        literal:   rdfjs.Literal;
        dtUri:     string;
        parsedKind: string;
    }

    const typedLiterals: TypedLiteral[] = [];
    const seen = new Set<string>();  // dedup by "lexicalValue|datatypeUri"

    for (const [subject, typeObject] of index.pairs(RDF.type)) {
        const subjectTerm = subject as rdfjs.Term;
        if (subjectTerm.termType !== 'Literal') continue;
        if (typeObject.termType !== 'NamedNode') continue;

        const literal = subjectTerm as rdfjs.Literal;
        const dtUri   = typeObject.value;
        const key     = `${literal.value}|${dtUri}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const parsed = parseXsdValue(literal);
        if (!parsed) continue;

        typedLiterals.push({ literal, dtUri, parsedKind: parsed.kind });
    }

    // Pairwise comparison: only compare literals with the same parsed kind
    // (same value-space family) and different lexical forms.
    for (let i = 0; i < typedLiterals.length; i++) {
        for (let j = i + 1; j < typedLiterals.length; j++) {
            const r1 = typedLiterals[i];
            const r2 = typedLiterals[j];

            if (r1.parsedKind !== r2.parsedKind) continue;
            // If the lexical forms are identical the literals are trivially equal —
            // no inference needed.
            if (r1.literal.value === r2.literal.value) continue;

            const lt1 = r1.literal as unknown as rdfjs.Quad_Subject;
            const lt2 = r2.literal as unknown as rdfjs.Quad_Subject;

            const typeTriple1 = makeTriple(lt1, namedNode(RDF.type), namedNode(r1.dtUri));
            const typeTriple2 = makeTriple(lt2, namedNode(RDF.type), namedNode(r2.dtUri));

            const eq = xsdValuesEqual(r1.literal, r2.literal);

            if (eq === true) {
                // dt-eq: same value → owl:sameAs
                yield infer(
                    makeTriple(lt1, owl.sameAs, lt2 as unknown as rdfjs.Quad_Object),
                    'dt-eq',
                    typeTriple1,
                    typeTriple2,
                );
            } else if (eq === false) {
                // dt-diff: different value in same family → owl:differentFrom
                yield infer(
                    makeTriple(lt1, owl.differentFrom, lt2 as unknown as rdfjs.Quad_Object),
                    'dt-diff',
                    typeTriple1,
                    typeTriple2,
                );
            }
        }
    }
}
