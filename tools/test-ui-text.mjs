import {test} from 'node:test';
import assert from 'node:assert/strict';
import {taskCount, reviewNote, answeredNote} from '../ui-text.js';

const cases = [
  [0, 'заданий'], [1, 'задание'], [2, 'задания'], [3, 'задания'],
  [4, 'задания'], [5, 'заданий'], [10, 'заданий'], [11, 'заданий'],
  [12, 'заданий'], [13, 'заданий'], [14, 'заданий'], [20, 'заданий'],
  [21, 'задание'], [22, 'задания'], [24, 'задания'], [25, 'заданий'],
  [101, 'задание'], [111, 'заданий'], [112, 'заданий'], [114, 'заданий'],
];

for (const [count, noun] of cases) {
  test(`Russian task counts and complete UI strings: ${count}`, () => {
    assert.equal(taskCount(count), `${count} ${noun}`);
    assert.equal(answeredNote(count), `Вы разобрали ${count} ${noun}.`);
    if (count > 0) {
      const verb = noun === 'задание' ? 'ждёт' : 'ждут';
      assert.equal(reviewNote(count, count), `${count} ${noun} ${verb} повторения.`);
      assert.equal(reviewNote(0, count), `${count} ${noun} уже в вашем повторении.`);
    }
  });
}

test('new learner sees onboarding; due tasks take precedence over total seen', () => {
  assert.equal(reviewNote(0, 0), 'Начните с простых ситуаций B1. Сложность B2 можно выбрать в практике.');
  assert.equal(reviewNote(3, 25), '3 задания ждут повторения.');
  assert.equal(reviewNote(1, 25), '1 задание ждёт повторения.');
});
