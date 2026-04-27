import * as rdfjs from '@rdfjs/types';
import type { QuadProvenanceRecord } from './quad-provenance-record.js';

type SeedRecordOrigin = 'source' | 'axiom';

/**
 * Stores provenance records keyed by normalized quad identity and resolves
 * premise references back to previously recorded provenance nodes.
 */
export class QuadProvenanceMap {
    private readonly records = new Map<string, QuadProvenanceRecord>();

    /**
     * Gets a string key for a quad by concatenating its normalized subject, predicate, and object values with null character separators. This allows quads to be used as keys in the `records` map.
     * @param quad The quad to generate a key for.
     * @returns A string key representing the quad.
     */
    keyOf(quad: rdfjs.Quad): string {
        return `${this._termKey(quad.subject)}\x01${this._termKey(quad.predicate)}\x01${this._termKey(quad.object)}`;
    }

    /**
     * Get the provenance record for a given quad, if it exists.
     * @param quad The quad to look up.
     * @returns The provenance record for the quad, or undefined if it doesn't exist.
     */
    get(quad: rdfjs.Quad): QuadProvenanceRecord | undefined {
        return this.records.get(this.keyOf(quad));
    }

    /**
     * Set the provenance record for a given quad, returning the key under which it was stored. This is used to create provenance records for inferred quads and store them in the map for later retrieval when resolving premises of subsequent inference steps.
     * @param record The provenance record to store.
     * @returns The key under which the record was stored.
     */
    set(record: QuadProvenanceRecord): string {
        const key = this.keyOf(record.quad);
        this.records.set(key, record);

        return key;
    }

    /**
     * Add a provenance record for a source quad, returning the key under which it was stored. This is used to seed the provenance map with records for quads that come directly from the input dataset before inference begins.
     * @param origin The origin of the quad, either 'source' or 'axiom'.
     * @param quad The quad to add as a seed record.
     * @returns An object containing the key under which the record was stored and the record itself.
     */
    addSeedRecord(origin: SeedRecordOrigin, quad: rdfjs.Quad): { key: string; record: QuadProvenanceRecord } {
        const record: QuadProvenanceRecord = { origin, quad };

        return {
            key: this.set(record),
            record,
        };
    }

    /**
     * Resolve the provenance records for a list of antecedent quads. If a provenance record for an antecedent does not exist, a default record with origin 'source' is created.
     * @param antecedents The list of antecedent quads to resolve.
     * @returns An array of provenance records corresponding to the antecedents.
     */
    resolvePremises(antecedents: rdfjs.Quad[]): QuadProvenanceRecord[] {
        return antecedents.map(
            antecedent => this.get(antecedent) ?? { origin: 'source', quad: antecedent }
        );
    }

    private _termKey(term: rdfjs.Term): string {
        if (term.termType === 'Literal') {
            const literal = term as rdfjs.Literal;

            return `L\x00${literal.value}\x00${literal.language || (literal.datatype?.value ?? '')}`;
        } else {
            return `${term.termType[0]}\x00${term.value}`;
        }
    }
}
