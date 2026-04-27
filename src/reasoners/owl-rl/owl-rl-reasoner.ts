import * as rdfjs from '@rdfjs/types';
import type { InferenceResult } from '../inference-result.js';
import type { InferredQuadRecord } from '../quad-provenance-record.js';
import { ReasonerBase } from '../reasoner-base.js';
import type { ReportSeverity } from '../reasoning-report.js';
import { QuadIndex } from '../quad-index.js';
import { equalitySingleQuad, equalityJoin } from './rules/equality.js';
import { classAxiomSingleQuad, classAxiomJoin } from './rules/class-axioms.js';
import { propertySingleQuad, propertyJoin, propertyAxioms } from './rules/property-semantics.js';
import { classAxioms, classSingleQuad, classJoin } from './rules/class-semantics.js';
import { schemaSingleQuad, schemaJoin } from './rules/schema.js';
import { dtAxioms, datatypesSingleQuad, datatypesJoin } from './rules/datatypes.js';
import { OWL_RL_RULE_DESCRIPTIONS, OWL_RL_VIOLATION_RULES } from './owl-rl-rules.js';

/**
 * Options for the OWL RL reasoner.
 */
export interface OwlRlReasonerOptions {
    /**
     * Enable eq-ref materialization (`x owl:sameAs x` for every term in a triple).
     * Disabled by default to avoid O(N) closure growth for reflexive sameAs.
     * Set to `false` to improve performance when reflexive sameAs is not needed.
     */
    equalityRef?: boolean;

    /**
     * Enable datatype value-space rules:
     * - **dt-type2**: emit `lt rdf:type DT` for each well-typed literal.
     * - **dt-not-type**: detect inconsistency when a literal is typed with two disjoint datatypes.
     * Default: `true`.
     */
    datatypeValueSpace?: boolean;

    /**
     * Enable pairwise datatype join rules (O(N²) over literals):
     * - **dt-eq**: emit `lt1 owl:sameAs lt2` when two literals have the same parsed value.
     * - **dt-diff**: emit `lt1 owl:differentFrom lt2` when literals of the same type differ.
     * Only effective when `datatypeValueSpace` is `true`. Default: `true`.
     * Set to `false` when the dataset has many literals and join cost is prohibitive.
     */
    datatypeJoins?: boolean;
}

/**
 * A semi-naive forward-chaining reasoner for the OWL 2 RL profile.
 */
export class OwlRlReasoner extends ReasonerBase {
    public constructor(private readonly _options: OwlRlReasonerOptions = {}) {
        super();
    }

    protected *axioms(): Iterable<rdfjs.Quad> {
        yield* propertyAxioms();
        yield* classAxioms();
        yield* dtAxioms();
    }

    /** Returns all axiomatic triples pre-loaded before inference (profile axioms). */
    public *getAxioms(): Iterable<rdfjs.Quad> {
        yield* this.axioms();
    }

    protected *inferFromQuad(quad: rdfjs.Quad, index: QuadIndex): Iterable<InferenceResult> {
        const { equalityRef = true, datatypeValueSpace = true } = this._options;
        yield* equalitySingleQuad(quad, index, { includeReflexiveSameAs: equalityRef });
        yield* propertySingleQuad(quad, index);
        yield* classSingleQuad(quad, index);
        yield* classAxiomSingleQuad(quad, index);
        yield* schemaSingleQuad(quad, index);
        if (datatypeValueSpace) {
            yield* datatypesSingleQuad(quad, index);
        }
    }

    protected *inferFromIndex(index: QuadIndex): Iterable<InferenceResult> {
        const { datatypeValueSpace = true, datatypeJoins = true } = this._options;
        yield* equalityJoin(index);
        yield* propertyJoin(index);
        yield* classJoin(index);
        yield* classAxiomJoin(index);
        yield* schemaJoin(index);
        if (datatypeValueSpace && datatypeJoins) {
            yield* datatypesJoin(index);
        }
    }

    protected getRuleDescription(rule: string): string | undefined {
        return OWL_RL_RULE_DESCRIPTIONS[rule];
    }

    protected getRecordSeverity(record: InferredQuadRecord): ReportSeverity {
        return OWL_RL_VIOLATION_RULES.has(record.rule) ? 'Violation' : 'Info';
    }
}

