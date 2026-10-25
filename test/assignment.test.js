import test from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../server/rng.js';
import { assignPages } from '../server/assignment.js';

const pages = ['circuit', 'tumbler', 'glyphpad', 'pulse'];
const crew = (n) => ['a', 'b', 'c', 'd', 'e'].slice(0, n);
const noBurden = (ids) => Object.fromEntries(ids.map((i) => [i, { double: 0, lookout: 0 }]));
const run = (ids, over = {}, seed = 1) =>
  assignPages(createRng(seed), { crewIds: ids, pageIds: pages, previous: null, burden: noBurden(ids), ...over });
const sizes = (assignment) => Object.values(assignment).map((p) => p.length).sort((x, y) => y - x);
const canonical = (assignment) =>
  JSON.stringify(Object.fromEntries(Object.entries(assignment).sort().map(([k, v]) => [k, [...v].sort()])));

test('1 crew gets all four pages, no lookout, no extra holder', () => {
  const r = run(crew(1));
  assert.deepEqual([...r.assignment.a].sort(), [...pages].sort());
  assert.equal(r.lookoutId, null);
  assert.equal(r.extraHolderId, null);
});

test('2 crew get two pages each', () => {
  const r = run(crew(2));
  assert.deepEqual(sizes(r.assignment), [2, 2]);
  assert.equal(r.lookoutId, null);
  assert.equal(r.extraHolderId, null);
});

test('3 crew: one gets two, others one; extraHolder is the one with two', () => {
  const r = run(crew(3));
  assert.deepEqual(sizes(r.assignment), [2, 1, 1]);
  assert.equal(r.assignment[r.extraHolderId].length, 2);
  assert.equal(r.lookoutId, null);
});

test('4 crew: one page each', () => {
  const r = run(crew(4));
  assert.deepEqual(sizes(r.assignment), [1, 1, 1, 1]);
  assert.equal(r.lookoutId, null);
  assert.equal(r.extraHolderId, null);
});

test('5 crew: four holders and one lookout with an empty page list', () => {
  const r = run(crew(5));
  assert.ok(crew(5).includes(r.lookoutId));
  assert.deepEqual(r.assignment[r.lookoutId], []);
  const holders = crew(5).filter((i) => i !== r.lookoutId);
  for (const h of holders) assert.equal(r.assignment[h].length, 1);
  assert.equal(r.extraHolderId, null);
});

test('extra page goes to the player with lowest double burden', () => {
  const r = run(crew(3), { burden: { a: { double: 2, lookout: 0 }, b: { double: 0, lookout: 0 }, c: { double: 1, lookout: 0 } } });
  assert.equal(r.extraHolderId, 'b');
});

test('lookout goes to the player with lowest lookout burden', () => {
  const burden = noBurden(crew(5));
  for (const id of crew(5)) burden[id].lookout = 1;
  burden.d.lookout = 0;
  const r = run(crew(5), { burden });
  assert.equal(r.lookoutId, 'd');
});

test('every page assigned exactly once for crew 1..5', () => {
  for (let n = 1; n <= 5; n++) {
    const r = run(crew(n));
    const all = Object.values(r.assignment).flat().sort();
    assert.deepEqual(all, [...pages].sort(), `crew ${n}`);
    assert.deepEqual(Object.keys(r.assignment).sort(), crew(n), `crew ${n} keys`);
  }
});

test('exhaustive: for crew 1..5 and 200 seeds, reassignment differs from previous whenever a different valid assignment exists', () => {
  for (let n = 2; n <= 5; n++) {
    for (let s = 0; s < 200; s++) {
      const first = run(crew(n), {}, s);
      const second = run(crew(n), { previous: first.assignment }, s + 1000);
      assert.notEqual(canonical(second.assignment), canonical(first.assignment), `crew ${n} seed ${s}`);
    }
  }
  // Crew of 1 has exactly one valid assignment, so it may equal previous.
  const only = run(crew(1));
  const again = run(crew(1), { previous: only.assignment }, 2);
  assert.equal(canonical(again.assignment), canonical(only.assignment));
});

test('exhaustive: for crew 1..5 and 200 seeds, sizes match the table and extra/lookout go to the least-burdened player', () => {
  const expected = { 1: [4], 2: [2, 2], 3: [2, 1, 1], 4: [1, 1, 1, 1], 5: [1, 1, 1, 1, 0] };
  for (let n = 1; n <= 5; n++) {
    for (let s = 0; s < 200; s++) {
      const burden = noBurden(crew(n));
      for (const id of crew(n)) {
        burden[id].double = (s + id.charCodeAt(0)) % 3;
        burden[id].lookout = (s * 7 + id.charCodeAt(0)) % 3;
      }
      const r = run(crew(n), { burden }, s);
      assert.deepEqual(sizes(r.assignment), expected[n], `crew ${n} seed ${s}`);
      if (n === 3) {
        const min = Math.min(...crew(n).map((i) => burden[i].double));
        assert.equal(burden[r.extraHolderId].double, min, `crew 3 seed ${s} extra`);
      }
      if (n === 5) {
        const min = Math.min(...crew(n).map((i) => burden[i].lookout));
        assert.equal(burden[r.lookoutId].lookout, min, `crew 5 seed ${s} lookout`);
      }
    }
  }
});

test('burden minimisation over 12 consecutive shuffles with 3 crew: double counts stay within 1 of each other', () => {
  const ids = crew(3);
  const burden = noBurden(ids);
  let previous = null;
  const rng = createRng(4);
  for (let i = 0; i < 12; i++) {
    const r = assignPages(rng, { crewIds: ids, pageIds: pages, previous, burden });
    burden[r.extraHolderId].double += 1;
    previous = r.assignment;
  }
  const doubles = ids.map((i) => burden[i].double);
  assert.ok(Math.max(...doubles) - Math.min(...doubles) <= 1, `doubles ${doubles}`);
  assert.equal(doubles.reduce((x, y) => x + y, 0), 12);
});

test('does not mutate inputs', () => {
  const ids = crew(3);
  const burden = noBurden(ids);
  const before = JSON.stringify(burden);
  const prevPages = pages.slice();
  assignPages(createRng(1), { crewIds: ids, pageIds: prevPages, previous: null, burden });
  assert.equal(JSON.stringify(burden), before);
  assert.deepEqual(prevPages, pages);
});
