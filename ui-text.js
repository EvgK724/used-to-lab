const plurals = new Intl.PluralRules('ru');
const taskForms = {one: 'задание', few: 'задания', many: 'заданий'};

export function taskCount(count) {
  return `${count} ${taskForms[plurals.select(count)]}`;
}

export function reviewNote(dueCount, seenCount) {
  if (dueCount) {
    const verb = plurals.select(dueCount) === 'one' ? 'ждёт' : 'ждут';
    return `${taskCount(dueCount)} ${verb} повторения.`;
  }
  return seenCount
    ? `${taskCount(seenCount)} уже в вашем повторении.`
    : 'Начните с простых ситуаций B1. Сложность B2 можно выбрать в практике.';
}

export function answeredNote(count) {
  return `Вы разобрали ${taskCount(count)}.`;
}
