/**
 * OWL 2 RL — Table 8: Datatype rules (dt-*)
 *
 * dt-type1 only: each OWL 2 RL supported datatype is typed as rdfs:Datatype.
 * Value-space checks (dt-type2, dt-eq, dt-diff, dt-not-type) are deferred.
 */
import * as rdfjs from '@rdfjs/types';
import DataFactory from '@rdfjs/data-model';
import { rdf, rdfs } from '../vocabulary.js';

const { namedNode } = DataFactory;
const mkQuad = DataFactory.quad.bind(DataFactory);

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
    ['http://www.w3.org/2001/XMLSchema#byte',            'http://www.w3.org/2001/XMLSchema#short'],
    ['http://www.w3.org/2001/XMLSchema#short',           'http://www.w3.org/2001/XMLSchema#int'],
    ['http://www.w3.org/2001/XMLSchema#int',             'http://www.w3.org/2001/XMLSchema#long'],
    ['http://www.w3.org/2001/XMLSchema#long',            'http://www.w3.org/2001/XMLSchema#integer'],
    ['http://www.w3.org/2001/XMLSchema#integer',         'http://www.w3.org/2001/XMLSchema#decimal'],
    // Non-negative and positive integers
    ['http://www.w3.org/2001/XMLSchema#positiveInteger', 'http://www.w3.org/2001/XMLSchema#nonNegativeInteger'],
    ['http://www.w3.org/2001/XMLSchema#nonNegativeInteger', 'http://www.w3.org/2001/XMLSchema#integer'],
    // Non-positive and negative integers
    ['http://www.w3.org/2001/XMLSchema#negativeInteger', 'http://www.w3.org/2001/XMLSchema#nonPositiveInteger'],
    ['http://www.w3.org/2001/XMLSchema#nonPositiveInteger', 'http://www.w3.org/2001/XMLSchema#integer'],
    // Unsigned integer hierarchy
    ['http://www.w3.org/2001/XMLSchema#unsignedByte',    'http://www.w3.org/2001/XMLSchema#unsignedShort'],
    ['http://www.w3.org/2001/XMLSchema#unsignedShort',   'http://www.w3.org/2001/XMLSchema#unsignedInt'],
    ['http://www.w3.org/2001/XMLSchema#unsignedInt',     'http://www.w3.org/2001/XMLSchema#unsignedLong'],
    ['http://www.w3.org/2001/XMLSchema#unsignedLong',    'http://www.w3.org/2001/XMLSchema#nonNegativeInteger'],
    // String hierarchy
    ['http://www.w3.org/2001/XMLSchema#normalizedString', 'http://www.w3.org/2001/XMLSchema#string'],
    ['http://www.w3.org/2001/XMLSchema#token',           'http://www.w3.org/2001/XMLSchema#normalizedString'],
    ['http://www.w3.org/2001/XMLSchema#language',        'http://www.w3.org/2001/XMLSchema#token'],
    ['http://www.w3.org/2001/XMLSchema#Name',            'http://www.w3.org/2001/XMLSchema#token'],
    ['http://www.w3.org/2001/XMLSchema#NCName',          'http://www.w3.org/2001/XMLSchema#Name'],
    ['http://www.w3.org/2001/XMLSchema#NMTOKEN',         'http://www.w3.org/2001/XMLSchema#token'],
];

/** dt-type1: yield axiomatic rdfs:Datatype typing and XSD subtype hierarchy. */
export function* dtAxioms(): Iterable<rdfjs.Quad> {
    for (const dt of OWL2_RL_DATATYPES) {
        yield mkQuad(namedNode(dt), rdf.type, rdfs.Datatype);
    }

    for (const [sub, sup] of XSD_SUBTYPE_HIERARCHY) {
        yield mkQuad(namedNode(sub), rdfs.subClassOf, namedNode(sup));
    }
}
