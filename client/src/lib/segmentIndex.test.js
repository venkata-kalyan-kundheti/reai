import { describe, it, expect } from 'vitest';
import { buildSourceToSegmentIndex, findSegmentById, getWalkthroughSteps } from './segmentIndex.js';

const segs = [
  { segmentId: 's_0', type: 'heading', sources: ['c_1_0'] },
  { segmentId: 's_1', type: 'step', sources: ['r_2_0'] },
  { segmentId: 's_2', type: 'step', sources: ['r_2_1', 'c_2_1'] },
  { segmentId: 's_3', type: 'step', sources: ['c_2_2'] },
];

describe('segmentIndex', () => {
  it('maps chunks to the segments citing them', () => {
    expect(buildSourceToSegmentIndex(segs).get('r_2_1')).toEqual(['s_2']);
  });
  it('finds follow-up segments too (ids never collide with the main ones)', () => {
    const followups = [{ answerSegments: [{ segmentId: 'fs_f_ab_0', text: 'x' }] }];
    expect(findSegmentById(segs, followups, 'fs_f_ab_0').text).toBe('x');
    expect(findSegmentById(segs, followups, 's_1').segmentId).toBe('s_1');
    expect(findSegmentById(segs, followups, 'nope')).toBeNull();
  });
  it('walkthrough = steps that cite figure regions, needs at least two', () => {
    expect(getWalkthroughSteps(segs).map((s) => s.segmentId)).toEqual(['s_1', 's_2']);
    expect(getWalkthroughSteps(segs.slice(0, 2))).toEqual([]);
  });
});
