# Mentor RDF Reasoners

[![License: LGPL-2.1](https://img.shields.io/badge/License-LGPL--2.1-blue.svg)](https://opensource.org/licenses/LGPL-2.1)
[![Coverage](https://img.shields.io/endpoint?url=https://faubulous.github.io/mentor-rdf-reasoners/coverage-badge.json)](https://faubulous.github.io/mentor-rdf-reasoners/)
[![npm downloads](https://img.shields.io/npm/dm/@faubulous/mentor-rdf-reasoners.svg)](https://www.npmjs.com/package/@faubulous/mentor-rdf-reasoners)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-blue.svg)](https://www.typescriptlang.org/)

**RDF reasoners for the Mentor toolkit, written in TypeScript.**

Provides rule-based forward-chaining reasoners for RDF graphs. Each reasoner implements a well-defined inference profile and integrates seamlessly with standard RDF/JS interfaces.

## Installation

```bash
npm install @faubulous/mentor-rdf-reasoners
```

## Reasoners

| Reasoner | Profile | Status |
|---|---|---|
| `OwlRlReasoner` | [OWL 2 RL](https://www.w3.org/TR/owl2-profiles/) | In development |

## Usage

### Basic inference

Load your ontology into an `RdfStore`, then call `expand()` to derive all entailed triples and add them to a target graph.

```ts
import { OwlRlReasoner } from '@faubulous/mentor-rdf-reasoners';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';

const { namedNode, quad } = DataFactory;

const sourceGraph = namedNode('https://example.org/my-ontology');
const inferredGraph = namedNode('https://example.org/my-ontology/inferred');

const store = RdfStore.createDefault().asDataset();
// ... load your ontology into store / sourceGraph ...

const reasoner = new OwlRlReasoner();

for (const q of reasoner.expand(store, sourceGraph)) {
    store.add(quad(q.subject, q.predicate, q.object, inferredGraph));
}
```

### Detecting inconsistencies

When the reasoner detects an inconsistency (for example a `owl:FunctionalProperty` violation or `owl:disjointWith` clash) it infers the standard marker:

```
owl:Thing rdfs:subClassOf owl:Nothing
```

For editor workflows, prefer the two-phase API:

1. `expand(..., { stopWhen: ... })` finds the first inferred quad matching a predicate and stops inference early.
2. `provenanceFor(...)` explains only that one derived quad.

```ts
import { OwlRlReasoner } from '@faubulous/mentor-rdf-reasoners';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';

const { namedNode, defaultGraph } = DataFactory;

const OWL  = 'http://www.w3.org/2002/07/owl#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

const store = RdfStore.createDefault().asDataset();
// ... load your ontology into store ...

const sourceGraph = defaultGraph();
const reasoner = new OwlRlReasoner();

const stopWhen = q =>
  q.subject.value === `${OWL}Thing` &&
  q.predicate.value === `${RDFS}subClassOf` &&
  q.object.value === `${OWL}Nothing`;

const inconsistency = [...reasoner.expand(store, sourceGraph, { stopWhen })].find(stopWhen);

if (inconsistency) {
    console.error('Ontology is inconsistent.');
}
```

If you need the full closure instead, `expand()` still yields all inferred triples.

### Explaining inconsistencies

The reasoner now tracks derivation provenance as structured explanation trees.

- `provenanceFor(store, sourceGraph, targetQuad)` returns the explanation for one derived quad.
- `provenanceForAll(store, sourceGraph)` returns explanation records for all inferred quads.
- `expandWithProvenance(store, sourceGraph)` is retained as a backward-compatible alias for `provenanceForAll(...)`.

Each explanation record contains:

- `quad`: the derived triple
- `rule`: the OWL RL rule that produced it, such as `prp-fp` or `eq-sym`
- `antecedents`: recursively resolved source, axiom, or inferred records that justify the result

Example: detect an inconsistency first, then explain only that marker.

```ts
import { OwlRlReasoner } from '@faubulous/mentor-rdf-reasoners';
import { RdfStore } from 'rdf-stores';
import DataFactory from '@rdfjs/data-model';

const { namedNode, defaultGraph } = DataFactory;

const OWL  = 'http://www.w3.org/2002/07/owl#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

const store = RdfStore.createDefault().asDataset();
// ... load your ontology into store ...

const sourceGraph = defaultGraph();
const reasoner = new OwlRlReasoner();

const stopWhen = q =>
  q.subject.value === `${OWL}Thing` &&
  q.predicate.value === `${RDFS}subClassOf` &&
  q.object.value === `${OWL}Nothing`;

const inconsistency = [...reasoner.expand(store, sourceGraph, { stopWhen })].find(stopWhen);

if (inconsistency) {
    const explanation = reasoner.provenanceFor(store, sourceGraph, inconsistency);

    console.dir(explanation, { depth: null });
}
```

Typical result shape:

```ts
{
  quad: owl:Thing rdfs:subClassOf owl:Nothing,
  rule: 'dt-diff',
  antecedents: [
    {
      quad: :p rdf:type owl:FunctionalProperty,
      rule: 'source',
      antecedents: []
    },
    {
      quad: :a :p "v1",
      rule: 'source',
      antecedents: []
    },
    {
      quad: :a :p "v2",
      rule: 'source',
      antecedents: []
    }
  ]
}
```

This gives direct explainability down to the source triples that triggered the inconsistency, without requiring callers to reverse-engineer the cause from the inferred graph.

Current limitation: provenance is exposed as TypeScript data structures, not as RDF explanation triples. If you need explanation graphs that can be queried or stored as RDF, that would be a separate serialization layer on top of `ProvenanceRecord`.

## Building

```bash
npm run build
```

## Testing

```bash
npm test
npm run test:coverage
```

## Benchmarks

```bash
npm run bench
```

## Contributing

Contributions are welcome. Please feel free to open an issue or submit a pull request on [GitHub](https://github.com/faubulous/mentor-rdf-reasoners).

## License

[LGPL-2.1-or-later](https://github.com/faubulous/mentor-rdf-reasoners/blob/main/LICENSE)
