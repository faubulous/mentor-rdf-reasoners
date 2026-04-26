import * as rdfjs from '@rdfjs/types';
import { InferenceResult, InferredRecord, ReasonerBase, ReportSeverity, TripleIndex } from '../reasoner.js';
import { equalitySingleQuad, equalityJoin } from './rules/equality.js';
import { classAxiomSingleQuad, classAxiomJoin } from './rules/class-axioms.js';
import { propertySingleQuad, propertyJoin, propertyAxioms } from './rules/property-semantics.js';
import { classAxioms, classSingleQuad, classJoin } from './rules/class-semantics.js';
import { schemaSingleQuad, schemaJoin } from './rules/schema.js';
import { dtAxioms } from './rules/datatypes.js';

const OWL_RL_RULE_DESCRIPTIONS: Readonly<Record<string, string>> = {
    // Equality rules
    'eq-sym': 'Equality symmetry: from x owl:sameAs y infer y owl:sameAs x.',
    'eq-trans': 'Equality transitivity: chain owl:sameAs links.',
    'eq-rep-s': 'Subject replacement by owl:sameAs.',
    'eq-rep-o': 'Object replacement by owl:sameAs.',
    'eq-diff1': 'A pair cannot be both sameAs and differentFrom.',
    'eq-diff2': 'owl:AllDifferent members must be pairwise distinct.',
    'eq-diff3': 'owl:AllDifferent members must be pairwise distinct.',

    // Property semantics rules
    'prp-dom': 'Domain typing: from p rdfs:domain C and s p o infer s a C.',
    'prp-rng': 'Range typing: from p rdfs:range C and s p o infer o a C.',
    'prp-fp': 'Functional property equality: values of a functional property are owl:sameAs.',
    'prp-fp-dif': 'Functional property has explicitly different values.',
    'prp-ifp': 'Inverse-functional property equality: subjects are owl:sameAs.',
    'prp-ifp-dif': 'Inverse-functional property has explicitly different subjects.',
    'prp-irp': 'An irreflexive property cannot relate an individual to itself.',
    'prp-symp': 'Symmetric property: from x p y infer y p x.',
    'prp-asyp': 'Asymmetric property cannot hold in both directions.',
    'prp-trp': 'Transitive property closure.',
    'prp-adp': 'allDisjointProperties cannot share the same pair.',
    'prp-spo1': 'Subproperty propagation: from p subPropertyOf q and x p y infer x q y.',
    'prp-spo2': 'Property chain expansion: apply owl:propertyChainAxiom.',
    'prp-eqp1': 'EquivalentProperty to SubPropertyOf (first direction).',
    'prp-eqp2': 'EquivalentProperty to SubPropertyOf (second direction).',
    'prp-inv1': 'Inverse properties (first direction).',
    'prp-inv2': 'Inverse properties (second direction).',
    'prp-key': 'HasKey equality: matching key values imply owl:sameAs.',
    'prp-npa1': 'Source triple violates a negative property assertion.',
    'prp-npa2': 'Object equality violates a negative property assertion.',
    'prp-pdw': 'Disjoint properties cannot connect the same pair.',
    'prp-ap': 'Annotation properties are valid RDF properties.',
    'prp-rflx': 'Reflexive property: from x a C infer x p x when p is reflexive over C.',

    // Class semantics rules
    'cls-nothing2': 'Instance of owl:Nothing detected.',
    'cls-int1': 'Intersection class membership (first direction).',
    'cls-int2': 'Intersection class membership (second direction).',
    'cls-uni': 'Union class membership propagation.',
    'cls-com': 'DisjointWith violation.',
    'cls-svf1': 'someValuesFrom typing from a matching property assertion.',
    'cls-svf2': 'someValuesFrom consistency check via owl:Nothing.',
    'cls-avf': 'allValuesFrom propagation to property values.',
    'cls-hv1': 'hasValue to class membership.',
    'cls-hv2': 'Class membership to hasValue property assertion.',
    'cls-maxc1': 'maxCardinality 0 violated.',
    'cls-maxc2': 'maxCardinality 1 implies owl:sameAs between fillers.',
    'cls-maxqc1': 'maxQualifiedCardinality 0 violated.',
    'cls-maxqc2': 'maxQualifiedCardinality 1 implies owl:sameAs between fillers.',
    'cls-maxqc3': 'maxQualifiedCardinality 0 with owl:onClass violated.',
    'cls-maxqc4': 'maxQualifiedCardinality 1 with owl:onClass implies owl:sameAs.',
    'cls-oo': 'oneOf membership expansion.',

    // Class axiom rules
    'cax-sco': 'Subclass typing: from C subClassOf D and x a C infer x a D.',
    'cax-eqc1': 'EquivalentClass typing (first direction).',
    'cax-eqc2': 'EquivalentClass typing (second direction).',
    'cax-dw': 'DisjointWith classes overlap on an instance.',
    'cax-adc': 'allDisjointClasses overlap on an instance.',

    // Schema rules
    'scm-cls': 'Schema closure for owl:Class declarations.',
    'scm-op': 'Schema closure for owl:ObjectProperty declarations.',
    'scm-dp': 'Schema closure for owl:DatatypeProperty declarations.',
    'scm-eqc1': 'EquivalentClass induces mutual subClassOf.',
    'scm-eqc2': 'SubClassOf in both directions induces EquivalentClass.',
    'scm-eqp1': 'EquivalentProperty induces mutual subPropertyOf.',
    'scm-eqp2': 'SubPropertyOf in both directions induces EquivalentProperty.',
    'scm-int': 'IntersectionOf schema propagation.',
    'scm-uni': 'UnionOf schema propagation.',
    'scm-sco': 'SubClassOf transitivity.',
    'scm-spo': 'SubPropertyOf transitivity.',
    'scm-dom1': 'Domain propagation along subClassOf.',
    'scm-dom2': 'Domain propagation along subPropertyOf.',
    'scm-rng1': 'Range propagation along subClassOf.',
    'scm-rng2': 'Range propagation along subPropertyOf.',
    'scm-hv': 'Schema propagation for hasValue restrictions.',
    'scm-svf1': 'Schema propagation for someValuesFrom restrictions.',
    'scm-svf2': 'Schema propagation for someValuesFrom via subclass chain.',
    'scm-avf1': 'Schema propagation for allValuesFrom restrictions.',
    'scm-avf2': 'Schema propagation for allValuesFrom via subclass chain.',
    'scm-chain-trans': 'Schema: transitive property implies two-step property chain.',

    // Datatype / inconsistency marker in this implementation
    'dt-diff': 'Different literal values for a functional data property.',
};

const OWL_RL_VIOLATION_RULES: ReadonlySet<string> = new Set([
    'eq-diff1',
    'eq-diff2',
    'eq-diff3',
    'prp-fp-dif',
    'prp-ifp-dif',
    'prp-irp',
    'prp-asyp',
    'prp-adp',
    'prp-npa1',
    'prp-npa2',
    'prp-pdw',
    'cls-nothing2',
    'cls-com',
    'cls-maxc1',
    'cls-maxqc1',
    'cls-maxqc3',
    'cax-dw',
    'cax-adc',
    'dt-diff',
]);

/**
 * An OWL 2 RL reasoner.
 *
 * Implements the OWL 2 RL profile as specified at https://www.w3.org/TR/owl2-profiles/
 * using semi-naive forward chaining over a `TripleIndex`.
 *
 * Usage:
 * ```ts
 * const reasoner = new OwlRlReasoner();
 * const store = RdfStore.createDefault().asDataset();
 * // load your ontology into store / sourceGraph ...
 * for (const quad of reasoner.expand(store, sourceGraph)) {
 *     store.add(DataFactory.quad(quad.subject, quad.predicate, quad.object, targetGraph));
 * }
 * ```
 */
export class OwlRlReasoner extends ReasonerBase {
    protected *axioms(): Iterable<rdfjs.Quad> {
        yield* propertyAxioms();
        yield* classAxioms();
        yield* dtAxioms();
    }

    /** Returns all axiomatic triples pre-loaded before inference (profile axioms). */
    public *getAxioms(): Iterable<rdfjs.Quad> {
        yield* this.axioms();
    }

    protected *inferFromQuad(quad: rdfjs.Quad, index: TripleIndex): Iterable<InferenceResult> {
        yield* equalitySingleQuad(quad, index);
        yield* propertySingleQuad(quad, index);
        yield* classSingleQuad(quad, index);
        yield* classAxiomSingleQuad(quad, index);
        yield* schemaSingleQuad(quad, index);
    }

    protected *inferFromIndex(index: TripleIndex): Iterable<InferenceResult> {
        yield* equalityJoin(index);
        yield* propertyJoin(index);
        yield* classJoin(index);
        yield* classAxiomJoin(index);
        yield* schemaJoin(index);
    }

    protected getRuleDescription(rule: string): string | undefined {
        return OWL_RL_RULE_DESCRIPTIONS[rule];
    }

    protected getSeverity(record: InferredRecord): ReportSeverity {
        return OWL_RL_VIOLATION_RULES.has(record.rule) ? 'Violation' : 'Info';
    }
}

