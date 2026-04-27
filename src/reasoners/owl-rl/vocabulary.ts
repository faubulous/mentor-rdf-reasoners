/**
 * URI string constants and NamedNode instances for the vocabularies used in OWL 2 RL
 * inference rules.
 *
 * Convention (matching the mentor-rdf project):
 * - Uppercase exports (`RDF`, `RDFS`, `OWL`) — plain URI strings for index look-ups.
 * - Lowercase exports (`rdf`, `rdfs`, `owl`) — pre-allocated `NamedNode` instances for
 *   use as quad subjects, predicates, and objects in emitted inference triples.
 *
 * Using pre-allocated nodes avoids repeated `DataFactory.namedNode()` calls in hot
 * inference loops while keeping type safety.
 */
import DataFactory from '@rdfjs/data-model';

const { namedNode } = DataFactory;

export const RDF = {
    type: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
    first: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first',
    rest: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest',
    nil: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil',
    Property: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property',
} as const;

export const RDFS = {
    subClassOf: 'http://www.w3.org/2000/01/rdf-schema#subClassOf',
    subPropertyOf: 'http://www.w3.org/2000/01/rdf-schema#subPropertyOf',
    domain: 'http://www.w3.org/2000/01/rdf-schema#domain',
    range: 'http://www.w3.org/2000/01/rdf-schema#range',
    Class: 'http://www.w3.org/2000/01/rdf-schema#Class',
    Datatype: 'http://www.w3.org/2000/01/rdf-schema#Datatype',
    label: 'http://www.w3.org/2000/01/rdf-schema#label',
    comment: 'http://www.w3.org/2000/01/rdf-schema#comment',
    seeAlso: 'http://www.w3.org/2000/01/rdf-schema#seeAlso',
    isDefinedBy: 'http://www.w3.org/2000/01/rdf-schema#isDefinedBy',
    member: 'http://www.w3.org/2000/01/rdf-schema#member',
} as const;

export const OWL = {
    // Classes
    Thing: 'http://www.w3.org/2002/07/owl#Thing',
    Nothing: 'http://www.w3.org/2002/07/owl#Nothing',
    Class: 'http://www.w3.org/2002/07/owl#Class',
    Restriction: 'http://www.w3.org/2002/07/owl#Restriction',
    NamedIndividual: 'http://www.w3.org/2002/07/owl#NamedIndividual',

    // Properties
    ObjectProperty: 'http://www.w3.org/2002/07/owl#ObjectProperty',
    DatatypeProperty: 'http://www.w3.org/2002/07/owl#DatatypeProperty',
    AnnotationProperty: 'http://www.w3.org/2002/07/owl#AnnotationProperty',

    // Class axioms
    equivalentClass: 'http://www.w3.org/2002/07/owl#equivalentClass',
    disjointWith: 'http://www.w3.org/2002/07/owl#disjointWith',
    complementOf: 'http://www.w3.org/2002/07/owl#complementOf',
    intersectionOf: 'http://www.w3.org/2002/07/owl#intersectionOf',
    unionOf: 'http://www.w3.org/2002/07/owl#unionOf',
    oneOf: 'http://www.w3.org/2002/07/owl#oneOf',
    AllDisjointClasses: 'http://www.w3.org/2002/07/owl#AllDisjointClasses',
    members: 'http://www.w3.org/2002/07/owl#members',

    // Property axioms
    equivalentProperty: 'http://www.w3.org/2002/07/owl#equivalentProperty',
    propertyDisjointWith: 'http://www.w3.org/2002/07/owl#propertyDisjointWith',
    AllDisjointProperties: 'http://www.w3.org/2002/07/owl#AllDisjointProperties',
    inverseOf: 'http://www.w3.org/2002/07/owl#inverseOf',
    propertyChainAxiom: 'http://www.w3.org/2002/07/owl#propertyChainAxiom',

    // Property characteristics
    FunctionalProperty: 'http://www.w3.org/2002/07/owl#FunctionalProperty',
    InverseFunctionalProperty: 'http://www.w3.org/2002/07/owl#InverseFunctionalProperty',
    SymmetricProperty: 'http://www.w3.org/2002/07/owl#SymmetricProperty',
    ReflexiveProperty: 'http://www.w3.org/2002/07/owl#ReflexiveProperty',
    AsymmetricProperty: 'http://www.w3.org/2002/07/owl#AsymmetricProperty',
    TransitiveProperty: 'http://www.w3.org/2002/07/owl#TransitiveProperty',
    IrreflexiveProperty: 'http://www.w3.org/2002/07/owl#IrreflexiveProperty',

    // Restrictions
    onProperty: 'http://www.w3.org/2002/07/owl#onProperty',
    someValuesFrom: 'http://www.w3.org/2002/07/owl#someValuesFrom',
    allValuesFrom: 'http://www.w3.org/2002/07/owl#allValuesFrom',
    hasValue: 'http://www.w3.org/2002/07/owl#hasValue',
    maxCardinality: 'http://www.w3.org/2002/07/owl#maxCardinality',
    maxQualifiedCardinality: 'http://www.w3.org/2002/07/owl#maxQualifiedCardinality',
    onClass: 'http://www.w3.org/2002/07/owl#onClass',

    // Individuals / keys
    sameAs: 'http://www.w3.org/2002/07/owl#sameAs',
    differentFrom: 'http://www.w3.org/2002/07/owl#differentFrom',
    AllDifferent: 'http://www.w3.org/2002/07/owl#AllDifferent',
    distinctMembers: 'http://www.w3.org/2002/07/owl#distinctMembers',
    hasKey: 'http://www.w3.org/2002/07/owl#hasKey',

    // Negative property assertions
    NegativePropertyAssertion: 'http://www.w3.org/2002/07/owl#NegativePropertyAssertion',
    sourceIndividual: 'http://www.w3.org/2002/07/owl#sourceIndividual',
    assertionProperty: 'http://www.w3.org/2002/07/owl#assertionProperty',
    targetIndividual: 'http://www.w3.org/2002/07/owl#targetIndividual',
    targetValue: 'http://www.w3.org/2002/07/owl#targetValue',

    // Built-in annotation properties (prp-ap axioms)
    deprecated: 'http://www.w3.org/2002/07/owl#deprecated',
    versionInfo: 'http://www.w3.org/2002/07/owl#versionInfo',
    priorVersion: 'http://www.w3.org/2002/07/owl#priorVersion',
    backwardCompatibleWith: 'http://www.w3.org/2002/07/owl#backwardCompatibleWith',
    incompatibleWith: 'http://www.w3.org/2002/07/owl#incompatibleWith',
} as const;

/** The literal string "0" used in maxCardinality/maxQualifiedCardinality checks. */
export const ZERO = '0';

/** The literal string "1" used in maxCardinality/maxQualifiedCardinality checks. */
export const ONE = '1';

// ---------------------------------------------------------------------------
// NamedNode instances (lowercase) — pre-allocated for use in emitted triples.
// ---------------------------------------------------------------------------

export const rdf = {
    type: namedNode(RDF.type),
    first: namedNode(RDF.first),
    rest: namedNode(RDF.rest),
    nil: namedNode(RDF.nil),
    Property: namedNode(RDF.Property),
} as const;

export const rdfs = {
    subClassOf: namedNode(RDFS.subClassOf),
    subPropertyOf: namedNode(RDFS.subPropertyOf),
    domain: namedNode(RDFS.domain),
    range: namedNode(RDFS.range),
    Class: namedNode(RDFS.Class),
    Datatype: namedNode(RDFS.Datatype),
    label: namedNode(RDFS.label),
    comment: namedNode(RDFS.comment),
    seeAlso: namedNode(RDFS.seeAlso),
    isDefinedBy: namedNode(RDFS.isDefinedBy),
    member: namedNode(RDFS.member),
} as const;

export const owl = {
    // Classes
    Thing: namedNode(OWL.Thing),
    Nothing: namedNode(OWL.Nothing),
    Class: namedNode(OWL.Class),
    NamedIndividual: namedNode(OWL.NamedIndividual),
    
    // Properties
    ObjectProperty: namedNode(OWL.ObjectProperty),
    DatatypeProperty: namedNode(OWL.DatatypeProperty),
    AnnotationProperty: namedNode(OWL.AnnotationProperty),

    // Class axioms
    equivalentClass: namedNode(OWL.equivalentClass),
    disjointWith: namedNode(OWL.disjointWith),
    complementOf: namedNode(OWL.complementOf),
    intersectionOf: namedNode(OWL.intersectionOf),
    unionOf: namedNode(OWL.unionOf),
    oneOf: namedNode(OWL.oneOf),
    AllDisjointClasses: namedNode(OWL.AllDisjointClasses),
    members: namedNode(OWL.members),

    // Property axioms
    equivalentProperty: namedNode(OWL.equivalentProperty),
    propertyDisjointWith: namedNode(OWL.propertyDisjointWith),
    AllDisjointProperties: namedNode(OWL.AllDisjointProperties),
    inverseOf: namedNode(OWL.inverseOf),
    propertyChainAxiom: namedNode(OWL.propertyChainAxiom),

    // Property characteristics
    FunctionalProperty: namedNode(OWL.FunctionalProperty),
    InverseFunctionalProperty: namedNode(OWL.InverseFunctionalProperty),
    SymmetricProperty: namedNode(OWL.SymmetricProperty),
    ReflexiveProperty: namedNode(OWL.ReflexiveProperty),
    AsymmetricProperty: namedNode(OWL.AsymmetricProperty),
    TransitiveProperty: namedNode(OWL.TransitiveProperty),
    IrreflexiveProperty: namedNode(OWL.IrreflexiveProperty),

    // Restrictions
    onProperty: namedNode(OWL.onProperty),
    someValuesFrom: namedNode(OWL.someValuesFrom),
    allValuesFrom: namedNode(OWL.allValuesFrom),
    hasValue: namedNode(OWL.hasValue),
    maxCardinality: namedNode(OWL.maxCardinality),
    maxQualifiedCardinality: namedNode(OWL.maxQualifiedCardinality),
    onClass: namedNode(OWL.onClass),

    // Individuals / keys
    sameAs: namedNode(OWL.sameAs),
    differentFrom: namedNode(OWL.differentFrom),
    AllDifferent: namedNode(OWL.AllDifferent),
    distinctMembers: namedNode(OWL.distinctMembers),
    hasKey: namedNode(OWL.hasKey),

    // Negative property assertions
    NegativePropertyAssertion: namedNode(OWL.NegativePropertyAssertion),
    sourceIndividual: namedNode(OWL.sourceIndividual),
    assertionProperty: namedNode(OWL.assertionProperty),
    targetIndividual: namedNode(OWL.targetIndividual),
    targetValue: namedNode(OWL.targetValue),

    // Built-in annotation properties (prp-ap axioms)
    deprecated: namedNode(OWL.deprecated),
    versionInfo: namedNode(OWL.versionInfo),
    priorVersion: namedNode(OWL.priorVersion),
    backwardCompatibleWith: namedNode(OWL.backwardCompatibleWith),
    incompatibleWith: namedNode(OWL.incompatibleWith),
} as const;
