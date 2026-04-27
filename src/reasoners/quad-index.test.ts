/**
 * Unit tests for QuadIndex.
 */
import { describe, it, expect } from 'vitest';
import DataFactory from '@rdfjs/data-model';
import { QuadIndex } from './quad-index.js';

const { namedNode, blankNode, literal, quad } = DataFactory;
const dg = DataFactory.defaultGraph();

const s1 = namedNode('urn:s1');
const s2 = namedNode('urn:s2');
const p1 = namedNode('urn:p1');
const p2 = namedNode('urn:p2');
const o1 = namedNode('urn:o1');
const o2 = namedNode('urn:o2');

function mkQuad(s: any, p: any, o: any) {
    return quad(s, p, o, dg);
}

describe('QuadIndex.add', () => {
    it('returns true for a new quad', () => {
        const index = new QuadIndex();
        expect(index.add(mkQuad(s1, p1, o1))).toBe(true);
    });

    it('returns false for a duplicate quad (same termType)', () => {
        const index = new QuadIndex();
        index.add(mkQuad(s1, p1, o1));
        expect(index.add(mkQuad(s1, p1, o1))).toBe(false);
    });

    it('distinguishes NamedNode and BlankNode with same value', () => {
        const index = new QuadIndex();
        const nn = namedNode('urn:x');
        const bn = blankNode('urn:x');
        index.add(mkQuad(s1, p1, nn));
        // Same value but different termType → treated as distinct
        expect(index.add(mkQuad(s1, p1, bn))).toBe(true);
    });
});

describe('QuadIndex.getObjects', () => {
    it('returns objects for known predicate+subject', () => {
        const index = new QuadIndex();
        index.add(mkQuad(s1, p1, o1));
        index.add(mkQuad(s1, p1, o2));
        const result = index.getObjects(p1.value, s1.value);
        expect(result.size).toBe(2);
    });

    it('returns empty set for unknown predicate', () => {
        const index = new QuadIndex();
        expect(index.getObjects(p1.value, s1.value).size).toBe(0);
    });
});

describe('QuadIndex.getSubjects', () => {
    it('returns subjects for known predicate+object', () => {
        const index = new QuadIndex();
        index.add(mkQuad(s1, p1, o1));
        index.add(mkQuad(s2, p1, o1));
        const result = index.getSubjects(p1.value, o1.value);
        expect(result.size).toBe(2);
    });

    it('returns empty set for unknown predicate', () => {
        const index = new QuadIndex();
        expect(index.getSubjects(p1.value, o1.value).size).toBe(0);
    });
});

describe('QuadIndex.getObjectsForSubject', () => {
    it('returns objects for a known subject+predicate', () => {
        const index = new QuadIndex();
        index.add(mkQuad(s1, p1, o1));
        index.add(mkQuad(s1, p1, o2));
        const result = index.getObjectsForSubject(s1.value, p1.value);
        expect(result.size).toBe(2);
    });

    it('returns empty set for unknown subject', () => {
        const index = new QuadIndex();
        expect(index.getObjectsForSubject(s1.value, p1.value).size).toBe(0);
    });
});

describe('QuadIndex.getSubjectsForObject', () => {
    it('returns subjects for a known object+predicate', () => {
        const index = new QuadIndex();
        index.add(mkQuad(s1, p1, o1));
        index.add(mkQuad(s2, p1, o1));
        const result = index.getSubjectsForObject(o1.value, p1.value);
        expect(result.size).toBe(2);
    });

    it('returns empty set for unknown object', () => {
        const index = new QuadIndex();
        expect(index.getSubjectsForObject(o1.value, p1.value).size).toBe(0);
    });
});

describe('QuadIndex.pairs', () => {
    it('yields (subject, object) pairs for a predicate', () => {
        const index = new QuadIndex();
        index.add(mkQuad(s1, p1, o1));
        index.add(mkQuad(s2, p1, o2));
        const pairs = [...index.pairs(p1.value)];
        expect(pairs.length).toBe(2);
        expect(pairs.some(([s, o]) => s.value === s1.value && o.value === o1.value)).toBe(true);
        expect(pairs.some(([s, o]) => s.value === s2.value && o.value === o2.value)).toBe(true);
    });

    it('yields nothing for an unknown predicate', () => {
        const index = new QuadIndex();
        const pairs = [...index.pairs(p2.value)];
        expect(pairs.length).toBe(0);
    });
});

describe('QuadIndex.has', () => {
    it('returns true for a present quad', () => {
        const index = new QuadIndex();
        index.add(mkQuad(s1, p1, o1));
        expect(index.has(p1.value, s1.value, o1.value)).toBe(true);
    });

    it('returns false for a missing quad (predicate exists, object differs)', () => {
        const index = new QuadIndex();
        index.add(mkQuad(s1, p1, o1));
        expect(index.has(p1.value, s1.value, o2.value)).toBe(false);
    });

    it('returns false for a missing quad (unknown predicate)', () => {
        const index = new QuadIndex();
        expect(index.has(p2.value, s1.value, o1.value)).toBe(false);
    });
});
