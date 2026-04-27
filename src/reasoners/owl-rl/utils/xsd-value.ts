/**
 * XSD value-space utilities for OWL 2 RL datatype rules (dt-type2, dt-eq, dt-diff, dt-not-type).
 *
 * Covers the XSD datatypes listed in the OWL 2 RL supported-datatypes table (section 4.2).
 *
 * @see https://www.w3.org/TR/owl2-profiles/#Reasoning_in_OWL_2_RL_and_RDF_Graphs_using_Rules
 * @see Table 8 — https://www.w3.org/TR/owl2-profiles/#tab-rules-datatypes
 */
import type * as rdfjs from '@rdfjs/types';

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF_NS = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDFS_NS = 'http://www.w3.org/2000/01/rdf-schema#';

// ---------------------------------------------------------------------------
// Value-space families
// ---------------------------------------------------------------------------

/**
 * Top-level value-space family groupings. Datatypes in different families
 * have completely disjoint value spaces.
 */
export type ValueSpaceFamily =
    | 'integer'       // xsd:integer + all integer subtypes
    | 'decimal'       // xsd:decimal (superset of integer; non-integer decimals)
    | 'float'         // xsd:float (IEEE 754 single)
    | 'double'        // xsd:double (IEEE 754 double)
    | 'boolean'       // xsd:boolean
    | 'string'        // xsd:string + normalizedString + token + language + Name + NCName + NMTOKEN
    | 'anyURI'        // xsd:anyURI
    | 'hexBinary'     // xsd:hexBinary
    | 'base64Binary'  // xsd:base64Binary
    | 'date'          // xsd:date
    | 'time'          // xsd:time
    | 'dateTime'      // xsd:dateTime + xsd:dateTimeStamp
    | 'duration'      // xsd:duration + xsd:yearMonthDuration + xsd:dayTimeDuration
    | 'gYear' | 'gMonth' | 'gDay' | 'gYearMonth' | 'gMonthDay'
    | 'plainLiteral'  // rdf:PlainLiteral
    | 'xmlLiteral';   // rdf:XMLLiteral

const DATATYPE_FAMILY = new Map<string, ValueSpaceFamily>([
    // Integer subtypes (xsd:integer value space)
    [XSD + 'integer',            'integer'],
    [XSD + 'long',               'integer'],
    [XSD + 'int',                'integer'],
    [XSD + 'short',              'integer'],
    [XSD + 'byte',               'integer'],
    [XSD + 'nonNegativeInteger', 'integer'],
    [XSD + 'nonPositiveInteger', 'integer'],
    [XSD + 'positiveInteger',    'integer'],
    [XSD + 'negativeInteger',    'integer'],
    [XSD + 'unsignedLong',       'integer'],
    [XSD + 'unsignedInt',        'integer'],
    [XSD + 'unsignedShort',      'integer'],
    [XSD + 'unsignedByte',       'integer'],
    // Decimal (includes non-integer values; its own family for comparison purposes)
    [XSD + 'decimal',            'decimal'],
    // Float / double
    [XSD + 'float',              'float'],
    [XSD + 'double',             'double'],
    // Boolean
    [XSD + 'boolean',            'boolean'],
    // String family
    [XSD + 'string',             'string'],
    [XSD + 'normalizedString',   'string'],
    [XSD + 'token',              'string'],
    [XSD + 'language',           'string'],
    [XSD + 'Name',               'string'],
    [XSD + 'NCName',             'string'],
    [XSD + 'NMTOKEN',            'string'],
    // URI
    [XSD + 'anyURI',             'anyURI'],
    // Binary
    [XSD + 'hexBinary',          'hexBinary'],
    [XSD + 'base64Binary',       'base64Binary'],
    // Date / time
    [XSD + 'date',               'date'],
    [XSD + 'time',               'time'],
    [XSD + 'dateTime',           'dateTime'],
    [XSD + 'dateTimeStamp',      'dateTime'],
    // Duration
    [XSD + 'duration',           'duration'],
    [XSD + 'yearMonthDuration',  'duration'],
    [XSD + 'dayTimeDuration',    'duration'],
    // Gregorian
    [XSD + 'gYear',              'gYear'],
    [XSD + 'gMonth',             'gMonth'],
    [XSD + 'gDay',               'gDay'],
    [XSD + 'gYearMonth',         'gYearMonth'],
    [XSD + 'gMonthDay',          'gMonthDay'],
    // RDF special literals
    [RDF_NS + 'PlainLiteral',    'plainLiteral'],
    [RDF_NS + 'XMLLiteral',      'xmlLiteral'],
    // rdfs:Literal and xsd:anyAtomicType are supertypes; they do not form a single value space
    // and are intentionally omitted from family assignments.
]);

/** Returns the value-space family for a datatype URI, or `undefined` if unrecognised. */
export function getValueSpaceFamily(datatypeUri: string): ValueSpaceFamily | undefined {
    return DATATYPE_FAMILY.get(datatypeUri);
}

// ---------------------------------------------------------------------------
// Disjointness
// ---------------------------------------------------------------------------

/** Canonical unordered pair key. */
function pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Pairs of integer subtypes whose value ranges are disjoint.
 * Built once at module load; consulted by {@link areTypesDisjoint}.
 */
const DISJOINT_INTEGER_PAIRS = new Set<string>([
    pairKey(XSD + 'negativeInteger',    XSD + 'nonNegativeInteger'),
    pairKey(XSD + 'negativeInteger',    XSD + 'positiveInteger'),
    pairKey(XSD + 'negativeInteger',    XSD + 'unsignedLong'),
    pairKey(XSD + 'negativeInteger',    XSD + 'unsignedInt'),
    pairKey(XSD + 'negativeInteger',    XSD + 'unsignedShort'),
    pairKey(XSD + 'negativeInteger',    XSD + 'unsignedByte'),
    pairKey(XSD + 'nonPositiveInteger', XSD + 'positiveInteger'),
    pairKey(XSD + 'nonPositiveInteger', XSD + 'unsignedLong'),
    pairKey(XSD + 'nonPositiveInteger', XSD + 'unsignedInt'),
    pairKey(XSD + 'nonPositiveInteger', XSD + 'unsignedShort'),
    pairKey(XSD + 'nonPositiveInteger', XSD + 'unsignedByte'),
]);

/**
 * Returns `true` if `dt1` and `dt2` have disjoint value spaces.
 *
 * Two datatypes are disjoint when:
 * 1. They belong to different value-space families, none of which overlap
 *    (e.g. string vs. integer, boolean vs. date).
 * 2. Both are integer subtypes with non-overlapping ranges
 *    (e.g. `xsd:negativeInteger` vs. `xsd:nonNegativeInteger`).
 *
 * Note: the integer/decimal/float/double numeric tower is **not** treated as
 * mutually disjoint — they share overlapping subsets of the numeric value space.
 */
export function areTypesDisjoint(dt1: string, dt2: string): boolean {
    if (dt1 === dt2) return false;

    const f1 = DATATYPE_FAMILY.get(dt1);
    const f2 = DATATYPE_FAMILY.get(dt2);

    if (f1 === undefined || f2 === undefined) return false;
    if (f1 === f2) {
        // Same family: only disjoint for specific integer subtype pairs
        return f1 === 'integer' && DISJOINT_INTEGER_PAIRS.has(pairKey(dt1, dt2));
    }

    // Different families: disjoint unless both are from the numeric tower
    const numericFamilies: ReadonlySet<ValueSpaceFamily> = new Set(['integer', 'decimal', 'float', 'double']);
    if (numericFamilies.has(f1) && numericFamilies.has(f2)) {
        return false;  // integer, decimal, float, double share some numeric values
    }

    return true;
}

// ---------------------------------------------------------------------------
// Value-space parsing
// ---------------------------------------------------------------------------

/** A parsed, normalised representation of an XSD literal value. */
export type XsdValue =
    | { kind: 'integer';  n: bigint }
    | { kind: 'decimal';  n: string }   // canonical decimal string
    | { kind: 'float';    n: number }   // IEEE 754; use Object.is() for ±0
    | { kind: 'double';   n: number }   // IEEE 754; use Object.is() for ±0
    | { kind: 'boolean';  n: boolean }
    | { kind: 'string';   n: string }
    | { kind: 'anyURI';   n: string }
    | { kind: 'binary';   n: string }   // normalised hex or base64
    | { kind: 'temporal'; n: string };  // date, time, dateTime, duration, gregorian

/** Inclusive bounds for integer subtype validation. `null` means unbounded. */
interface IntegerBounds { min: bigint | null; max: bigint | null; }

const INTEGER_BOUNDS = new Map<string, IntegerBounds>([
    [XSD + 'integer',            { min: null, max: null }],
    [XSD + 'long',               { min: -9223372036854775808n, max: 9223372036854775807n }],
    [XSD + 'int',                { min: -2147483648n,          max: 2147483647n }],
    [XSD + 'short',              { min: -32768n,               max: 32767n }],
    [XSD + 'byte',               { min: -128n,                 max: 127n }],
    [XSD + 'nonNegativeInteger', { min: 0n,                    max: null }],
    [XSD + 'nonPositiveInteger', { min: null,                  max: 0n }],
    [XSD + 'positiveInteger',    { min: 1n,                    max: null }],
    [XSD + 'negativeInteger',    { min: null,                  max: -1n }],
    [XSD + 'unsignedLong',       { min: 0n,                    max: 18446744073709551615n }],
    [XSD + 'unsignedInt',        { min: 0n,                    max: 4294967295n }],
    [XSD + 'unsignedShort',      { min: 0n,                    max: 65535n }],
    [XSD + 'unsignedByte',       { min: 0n,                    max: 255n }],
]);

function inIntegerBounds(n: bigint, datatypeUri: string): boolean {
    const bounds = INTEGER_BOUNDS.get(datatypeUri);
    if (!bounds) return true;
    if (bounds.min !== null && n < bounds.min) return false;
    if (bounds.max !== null && n > bounds.max) return false;
    return true;
}

/** Parses an XSD float/double lexical form, including `INF`, `-INF`, `NaN`. */
function parseXsdFloat(lex: string): number | null {
    const s = lex.trim();
    if (s === 'INF'  || s === '+INF') return Infinity;
    if (s === '-INF')                  return -Infinity;
    if (s === 'NaN')                   return NaN;
    // Check for negative zero before calling Number()
    const n = Number(s);
    if (!isFinite(n) && !isNaN(n)) return null;  // rejected by Number but not handled above
    if (isNaN(n)) return null;
    return n;
}

/** Normalises a decimal lexical form to a canonical string (trims whitespace, removes leading +). */
function normaliseDecimal(lex: string): string | null {
    const s = lex.trim().replace(/^\+/, '');
    // Must match: optional -, digits, optional dot + digits
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return s;
}

/**
 * Parses a literal into its value-space representative.
 * Returns `null` if the literal's lexical form is invalid for its declared datatype
 * or if the datatype is not supported.
 */
export function parseXsdValue(literal: rdfjs.Literal): XsdValue | null {
    const dt  = literal.datatype?.value;
    const lex = literal.value;

    if (!dt) return null;

    const family = DATATYPE_FAMILY.get(dt);
    if (!family) return null;

    switch (family) {
        case 'integer': {
            try {
                const s = lex.trim().replace(/^\+/, '');
                const n = BigInt(s);
                if (!inIntegerBounds(n, dt)) return null;
                return { kind: 'integer', n };
            } catch {
                return null;
            }
        }

        case 'decimal': {
            const s = normaliseDecimal(lex);
            if (s === null) return null;
            return { kind: 'decimal', n: s };
        }

        case 'float': {
            const n = parseXsdFloat(lex);
            return n !== null ? { kind: 'float', n } : null;
        }

        case 'double': {
            const n = parseXsdFloat(lex);
            return n !== null ? { kind: 'double', n } : null;
        }

        case 'boolean': {
            if (lex === 'true'  || lex === '1') return { kind: 'boolean', n: true };
            if (lex === 'false' || lex === '0') return { kind: 'boolean', n: false };
            return null;
        }

        case 'string':
            return { kind: 'string', n: lex };

        case 'anyURI':
            return { kind: 'anyURI', n: lex };

        case 'hexBinary':
            return { kind: 'binary', n: lex.toUpperCase() };

        case 'base64Binary':
            return { kind: 'binary', n: lex.replace(/\s/g, '') };

        // Temporal types: compare lexical forms (canonical representation is assumed)
        case 'date':
        case 'time':
        case 'dateTime':
        case 'duration':
        case 'gYear': case 'gMonth': case 'gDay': case 'gYearMonth': case 'gMonthDay':
            return { kind: 'temporal', n: lex };

        default:
            return null;
    }
}

/**
 * Returns `true` if both literals have the same parsed value in a shared value space,
 * `false` if they differ, or `null` if the comparison cannot be determined
 * (unsupported datatypes, different families, or incomparable temporal forms).
 *
 * IEEE 754 semantics are preserved: `Object.is()` distinguishes `+0` from `-0`,
 * and two `NaN` literals are considered equal (they occupy the same value-space point).
 */
export function xsdValuesEqual(lt1: rdfjs.Literal, lt2: rdfjs.Literal): boolean | null {
    const v1 = parseXsdValue(lt1);
    const v2 = parseXsdValue(lt2);

    if (v1 === null || v2 === null) return null;
    if (v1.kind !== v2.kind) return null;

    if (v1.kind === 'float' || v1.kind === 'double') {
        const a = v1.n;
        const b = (v2 as typeof v1).n;

        // NaN === NaN in value-space terms (same point)
        if (isNaN(a) && isNaN(b)) return true;
        
        return Object.is(a, b);
    }

    if (v1.kind === 'integer') return v1.n === (v2 as typeof v1).n;

    return v1.n === (v2 as typeof v1).n;
}

/**
 * Returns `true` if both literals have different values in a shared value space,
 * `false` if they are equal, or `null` if the comparison cannot be determined.
 */
export function xsdValuesDiffer(lt1: rdfjs.Literal, lt2: rdfjs.Literal): boolean | null {
    const eq = xsdValuesEqual(lt1, lt2);
    return eq === null ? null : !eq;
}
