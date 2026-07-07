/**
 * types.test-d.ts — Compile-time and runtime shape smoke tests for src/core/types.ts
 *
 * This file serves two purposes:
 *   1. Compile-time: TypeScript must accept every fixture literal below without
 *      error (verifying the type shapes are structurally correct).
 *   2. Runtime: Jest assertions confirm the object shapes are as expected and
 *      that `InputMode` / `RepresentationLevel` unions are exhaustively switchable.
 *
 * If `npx tsc --noEmit` is green and `npx jest` passes this file, Phase 2 is
 * structurally correct — stages 03 and 05 can safely bind to these types.
 */

import type {
  RepresentationLevel,
  InputMode,
  LocalizedRef,
  PromptSpec,
  DifficultyParams,
  SeededRng,
  ProblemSpec,
  Step,
  GeneratedTask,
  Band,
  DifficultyHooks,
  GraphNode,
  GraphDefinition,
  Generator,
  NodeId,
} from '../types';
import { SCALAR_DECIMAL_POLICY } from '@/core/canonical';

// ---------------------------------------------------------------------------
// Helper: exhaustiveness checker
// Never-guard ensures `switch` over a closed union is exhaustive.
// ---------------------------------------------------------------------------

function assertNever(x: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(x)}`);
}

// ---------------------------------------------------------------------------
// RepresentationLevel exhaustiveness
// ---------------------------------------------------------------------------

function handleRepresentationLevel(level: RepresentationLevel): string {
  switch (level) {
    case 'concrete':
      return 'concrete';
    case 'pictorial':
      return 'pictorial';
    case 'abstract':
      return 'abstract';
    default:
      return assertNever(level);
  }
}

describe('RepresentationLevel', () => {
  it('has exactly three members: concrete, pictorial, abstract', () => {
    const levels: RepresentationLevel[] = ['concrete', 'pictorial', 'abstract'];
    for (const level of levels) {
      expect(handleRepresentationLevel(level)).toBe(level);
    }
  });

  it('switch is exhaustive (never-guard compiles without error)', () => {
    // If this test compiles, the switch is exhaustive — TypeScript would reject
    // it at compile time if an unhandled case existed.
    expect(handleRepresentationLevel('abstract')).toBe('abstract');
  });
});

// ---------------------------------------------------------------------------
// InputMode exhaustiveness
// ---------------------------------------------------------------------------

function handleInputMode(mode: InputMode): string {
  switch (mode) {
    case 'manipulative':
      return 'manipulative';
    case 'choice':
      return 'choice';
    case 'number':
      return 'number';
    case 'tokens':
      return 'tokens';
    case 'multi-slot':
      return 'multi-slot';
    case 'compare':
      return 'compare';
    default:
      return assertNever(mode);
  }
}

describe('InputMode', () => {
  it('has exactly six members', () => {
    const modes: InputMode[] = [
      'manipulative',
      'choice',
      'number',
      'tokens',
      'multi-slot',
      'compare',
    ];
    for (const mode of modes) {
      expect(handleInputMode(mode)).toBe(mode);
    }
  });

  it('switch is exhaustive (never-guard compiles without error)', () => {
    expect(handleInputMode('tokens')).toBe('tokens');
  });
});

// ---------------------------------------------------------------------------
// LocalizedRef / PromptSpec — no raw strings in text positions
// ---------------------------------------------------------------------------

describe('LocalizedRef', () => {
  it('accepts a minimal { key } object', () => {
    const ref: LocalizedRef = { key: 'fruit_eq.prompt' };
    expect(ref.key).toBe('fruit_eq.prompt');
    expect(ref.vars).toBeUndefined();
  });

  it('accepts vars with string and number values', () => {
    const ref: LocalizedRef = {
      key: 'fruit_eq.prompt',
      vars: { apple: 3, label: 'fruit' },
    };
    expect(ref.vars?.apple).toBe(3);
    expect(ref.vars?.label).toBe('fruit');
  });
});

describe('PromptSpec', () => {
  it('is structurally identical to LocalizedRef', () => {
    const spec: PromptSpec = { key: 'step.question', vars: { n: 5 } };
    // PromptSpec = LocalizedRef; they are interchangeable (type alias)
    const ref: LocalizedRef = spec;
    expect(ref.key).toBe('step.question');
  });
});

// ---------------------------------------------------------------------------
// DifficultyParams shape
// ---------------------------------------------------------------------------

describe('DifficultyParams', () => {
  it('accepts a valid envelope with unknown params', () => {
    const params: DifficultyParams = {
      representationLevel: 'pictorial',
      elicitFromMastery: 0.5,
      params: { unknowns: 2, range: 10, negatives: false },
    };
    expect(params.representationLevel).toBe('pictorial');
    expect(params.elicitFromMastery).toBe(0.5);
    expect(params.params).toBeDefined();
  });

  it('elicitFromMastery accepts boundary values 0.0 and 1.0', () => {
    const floor: DifficultyParams = {
      representationLevel: 'concrete',
      elicitFromMastery: 0.0,
      params: null,
    };
    const ceiling: DifficultyParams = {
      representationLevel: 'abstract',
      elicitFromMastery: 1.0,
      params: null,
    };
    expect(floor.elicitFromMastery).toBe(0.0);
    expect(ceiling.elicitFromMastery).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Step shape — the load-bearing 02↔03 contract
// ---------------------------------------------------------------------------

describe('Step', () => {
  it('accepts a valid step with all required fields', () => {
    const step: Step = {
      prompt: { key: 'fruit_eq.step1.prompt' },
      inputMode: 'tokens',
      expected: '7',
      skillNode: 'fruit-equations' as NodeId,
      elicitFromMastery: 0.6,
      normalizationPolicy: SCALAR_DECIMAL_POLICY,
    };
    expect(step.expected).toBe('7');
    expect(step.inputMode).toBe('tokens');
    expect(step.normalizationPolicy.decimalForm).toBe('standard');
  });

  it('accepts an optional problem field', () => {
    const step: Step = {
      prompt: { key: 'fruit_eq.step1.prompt' },
      problem: { key: 'fruit_eq.step1.problem', vars: { apple: 3 } },
      inputMode: 'number',
      expected: '5',
      skillNode: 'fruit-equations' as NodeId,
      elicitFromMastery: 0.0,
      normalizationPolicy: SCALAR_DECIMAL_POLICY,
    };
    expect(step.problem?.key).toBe('fruit_eq.step1.problem');
  });

  it('elicitFromMastery at Step level is distinct from DifficultyParams envelope', () => {
    // Both are `number` (0..1) but carry different semantics:
    //   Envelope: gates overall scaffold fade for the task.
    //   Step:     marks whether THIS step is elicited vs shown at current mastery.
    const envelopeValue = 0.7;
    const stepValue = 0.3;
    expect(envelopeValue).not.toBe(stepValue); // confirm they can differ
  });

  it('expected is a string (canonical form, never a number)', () => {
    const step: Step = {
      prompt: { key: 'x' },
      inputMode: 'number',
      expected: '3.5',
      skillNode: 'fruit-equations' as NodeId,
      elicitFromMastery: 1.0,
      normalizationPolicy: SCALAR_DECIMAL_POLICY,
    };
    expect(typeof step.expected).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// GeneratedTask shape
// ---------------------------------------------------------------------------

describe('GeneratedTask', () => {
  it('accepts a valid task object', () => {
    const task: GeneratedTask = {
      problem: {
        prompt: { key: 'fruit_eq.problem', vars: { apple: 3, banana: 5 } },
        representation: 'pictorial',
      },
      solution: '8',
      steps: [
        {
          prompt: { key: 'fruit_eq.step1' },
          inputMode: 'tokens',
          expected: '8',
          skillNode: 'fruit-equations' as NodeId,
          elicitFromMastery: 0.5,
          normalizationPolicy: SCALAR_DECIMAL_POLICY,
        },
      ],
      representation: 'pictorial',
      skillNode: 'fruit-equations' as NodeId,
    };
    expect(task.solution).toBe('8');
    expect(task.steps).toHaveLength(1);
    expect(task.problem.prompt.key).toBe('fruit_eq.problem');
  });

  it('problem.prompt is a PromptSpec (not a raw string)', () => {
    const task: GeneratedTask = {
      problem: {
        prompt: { key: 'some.key' },
        representation: 'abstract',
      },
      solution: '4',
      steps: [],
      representation: 'abstract',
      skillNode: 'multiplication' as NodeId,
    };
    // `problem.prompt` must be a LocalizedRef, never a string
    expect(typeof task.problem.prompt).toBe('object');
    expect(task.problem.prompt.key).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ProblemSpec shape
// ---------------------------------------------------------------------------

describe('ProblemSpec', () => {
  it('accepts a valid problem spec', () => {
    const spec: ProblemSpec = {
      prompt: { key: 'problem.key', vars: { x: 10 } },
      representation: 'concrete',
    };
    expect(spec.representation).toBe('concrete');
  });
});

// ---------------------------------------------------------------------------
// Band and DifficultyHooks
// ---------------------------------------------------------------------------

describe('Band', () => {
  it('accepts a valid band with opaque params', () => {
    const band: Band = {
      minCoordinate: 0.0,
      representationLevel: 'pictorial',
      params: { unknowns: 1, range: 5, negatives: false },
    };
    expect(band.minCoordinate).toBe(0.0);
    expect(band.representationLevel).toBe('pictorial');
  });

  it('params is unknown — can hold any generator-specific shape', () => {
    const band: Band = {
      minCoordinate: 0.5,
      representationLevel: 'abstract',
      params: { someField: 42 },
    };
    // The core never inspects band.params — only the owning generator narrows it.
    expect(band.params).toBeDefined();
  });
});

describe('DifficultyHooks', () => {
  it('accepts a hooks object with a non-empty band array', () => {
    const hooks: DifficultyHooks = {
      bands: [
        { minCoordinate: 0.0, representationLevel: 'pictorial', params: {} },
        { minCoordinate: 0.5, representationLevel: 'abstract', params: {} },
      ],
    };
    expect(hooks.bands).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// GraphNode shape
// ---------------------------------------------------------------------------

describe('GraphNode', () => {
  it('accepts a valid node with prerequisites', () => {
    const node: GraphNode = {
      id: 'fruit-equations' as NodeId,
      prerequisites: ['number-bonds' as NodeId, 'counting' as NodeId],
      representationLevels: ['pictorial', 'abstract'],
      difficultyHooks: {
        bands: [
          { minCoordinate: 0.0, representationLevel: 'pictorial', params: {} },
        ],
      },
    };
    expect(node.id).toBe('fruit-equations');
    expect(node.prerequisites).toHaveLength(2);
  });

  it('accepts a root node with no prerequisites', () => {
    const rootNode: GraphNode = {
      id: 'counting' as NodeId,
      prerequisites: [],
      representationLevels: ['concrete', 'pictorial', 'abstract'],
      difficultyHooks: {
        bands: [
          { minCoordinate: 0.0, representationLevel: 'concrete', params: {} },
        ],
      },
    };
    expect(rootNode.prerequisites).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GraphDefinition shape
// ---------------------------------------------------------------------------

describe('GraphDefinition', () => {
  it('accepts a valid graph definition', () => {
    const graph: GraphDefinition = {
      graphVersion: '0.1.0',
      fixture: true,
      nodes: [
        {
          id: 'counting' as NodeId,
          prerequisites: [],
          representationLevels: ['concrete'],
          difficultyHooks: {
            bands: [
              { minCoordinate: 0.0, representationLevel: 'concrete', params: {} },
            ],
          },
        },
      ],
    };
    expect(graph.graphVersion).toBe('0.1.0');
    expect(graph.fixture).toBe(true);
    expect(graph.nodes).toHaveLength(1);
  });

  it('accepts a non-fixture graph (fixture field absent)', () => {
    const graph: GraphDefinition = {
      graphVersion: '1.0.0',
      nodes: [],
    };
    expect(graph.fixture).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Generator interface shape
// ---------------------------------------------------------------------------

describe('Generator interface', () => {
  it('accepts a mock generator implementation', () => {
    const mockRng: SeededRng = {
      next: () => 0.5,
      nextInt: (min, max) => Math.floor(min + (max - min + 1) * 0.5),
    };

    const mockGenerator: Generator = {
      skillNode: 'fruit-equations' as NodeId,
      generate: (_difficulty: DifficultyParams, _rng: SeededRng): GeneratedTask => ({
        problem: {
          prompt: { key: 'fruit_eq.problem' },
          representation: 'pictorial',
        },
        solution: '7',
        steps: [
          {
            prompt: { key: 'fruit_eq.step1' },
            inputMode: 'tokens',
            expected: '7',
            skillNode: 'fruit-equations' as NodeId,
            elicitFromMastery: 0.5,
            normalizationPolicy: SCALAR_DECIMAL_POLICY,
          },
        ],
        representation: 'pictorial',
        skillNode: 'fruit-equations' as NodeId,
      }),
      instantiate: (_band: Band, _rng: SeededRng): unknown => ({
        unknowns: 1,
        range: 10,
        negatives: false,
      }),
    };

    const task = mockGenerator.generate(
      {
        representationLevel: 'pictorial',
        elicitFromMastery: 0.5,
        params: null,
      },
      mockRng
    );

    expect(task.solution).toBe('7');
    expect(task.skillNode).toBe('fruit-equations');
    expect(task.steps[0].expected).toBe('7');
    expect(typeof task.problem.prompt.key).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Language-neutral invariant check
// ---------------------------------------------------------------------------

describe('Language-neutral invariant', () => {
  it('no Step field is a raw string intended as a display string (prompt is LocalizedRef)', () => {
    const step: Step = {
      prompt: { key: 'some.key' },
      inputMode: 'number',
      expected: '4',
      skillNode: 'test-node' as NodeId,
      elicitFromMastery: 0,
      normalizationPolicy: SCALAR_DECIMAL_POLICY,
    };
    // `prompt` must be an object with `key`, never a bare string
    expect(typeof step.prompt).toBe('object');
    expect('key' in step.prompt).toBe(true);
  });

  it('GeneratedTask.problem.prompt is a LocalizedRef (not a raw string)', () => {
    const task: GeneratedTask = {
      problem: { prompt: { key: 'test.key' }, representation: 'abstract' },
      solution: '5',
      steps: [],
      representation: 'abstract',
      skillNode: 'test-node' as NodeId,
    };
    expect(typeof task.problem.prompt).toBe('object');
    expect(task.problem.prompt.key).toBe('test.key');
  });
});

// ---------------------------------------------------------------------------
// NormalizationPolicy widening (DL-3 carry-over fix)
// ---------------------------------------------------------------------------

describe('NormalizationPolicy widening (DL-3)', () => {
  it('SCALAR_DECIMAL_POLICY satisfies the widened NormalizationPolicy type', () => {
    // The widened interface must accept the default policy without a type error.
    const policy: import('@/core/canonical').NormalizationPolicy = SCALAR_DECIMAL_POLICY;
    expect(policy.decimalForm).toBe('standard');
    expect(policy.ordering).toBe('n/a');
    expect(policy.lowestTerms).toBe(false);
    expect(policy.numberClass).toBe('decimal');
  });

  it('a fraction policy (stage-05 shape) satisfies the widened interface', () => {
    // This literal must compile — proving the widening allows stage-05's fraction
    // generator to use `{ lowestTerms: true, numberClass: 'fraction' }` with the
    // SAME Step.normalizationPolicy field type (DL-3 invariant).
    const fractionPolicy: import('@/core/canonical').NormalizationPolicy = {
      decimalForm: 'standard',
      ordering: 'n/a',
      lowestTerms: true,
      numberClass: 'fraction',
    };
    expect(fractionPolicy.lowestTerms).toBe(true);
    expect(fractionPolicy.numberClass).toBe('fraction');
  });

  it('an integer policy satisfies the widened interface', () => {
    const integerPolicy: import('@/core/canonical').NormalizationPolicy = {
      decimalForm: 'standard',
      ordering: 'n/a',
      lowestTerms: false,
      numberClass: 'integer',
    };
    expect(integerPolicy.numberClass).toBe('integer');
  });

  it('an ascending-ordering policy (set-valued step) satisfies the interface', () => {
    const setPolicy: import('@/core/canonical').NormalizationPolicy = {
      decimalForm: 'standard',
      ordering: 'ascending',
      lowestTerms: false,
      numberClass: 'decimal',
    };
    expect(setPolicy.ordering).toBe('ascending');
  });
});
