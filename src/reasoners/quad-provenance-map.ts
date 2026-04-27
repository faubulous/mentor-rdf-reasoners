import * as rdfjs from '@rdfjs/types';
import type { QuadProvenanceRecord } from './quad-provenance-record.js';

type SeedRecordOrigin = 'source' | 'axiom';

/**
 * Stores provenance records keyed by normalized quad identity and resolves
 * premise references back to previously recorded provenance nodes.
 */
export class QuadProvenanceMap {
    private readonly records = new Map<string, QuadProvenanceRecord>();

    keyOf(quad: rdfjs.Quad): string {
        return `${this._termKey(quad.subject)}\x01${this._termKey(quad.predicate)}\x01${this._termKey(quad.object)}`;
    }

    get(quad: rdfjs.Quad): QuadProvenanceRecord | undefined {
        return this.records.get(this.keyOf(quad));
    }

    set(record: QuadProvenanceRecord): string {
        const key = this.keyOf(record.quad);
        this.records.set(key, record);

        return key;
    }

    addSeedRecord(origin: SeedRecordOrigin, quad: rdfjs.Quad): { key: string; record: QuadProvenanceRecord } {
        const record: QuadProvenanceRecord = { origin, quad };

        return {
            key: this.set(record),
            record,
        };
    }

    resolvePremises(antecedents: rdfjs.Quad[]): QuadProvenanceRecord[] {
        return antecedents.map(antecedent => this.get(antecedent) ?? { origin: 'source', quad: antecedent });
    }

    private _termKey(term: rdfjs.Term): string {
        if (term.termType === 'Literal') {
            const literal = term as rdfjs.Literal;

            return `L\x00${literal.value}\x00${literal.language || (literal.datatype?.value ?? '')}`;
        }

        return `${term.termType[0]}\x00${term.value}`;
    }
}
