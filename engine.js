export const DAY = 86400000;
export const KEY = 'habit-lab-progress-v1';
export function schedule(previous, rating, now = Date.now()) {
  const old = previous?.stage || 0;
  const stage = rating === 'again' ? 0 : rating === 'hard' ? Math.max(0, old - 1) : Math.min(4, old + 1);
  const delay = rating === 'again' ? 600000 : rating === 'hard' ? DAY : [1, 3, 7, 14][stage - 1] * DAY;
  if (!['again', 'hard', 'good'].includes(rating)) throw new Error('Unknown rating');
  return {stage, due: now + delay, last: now, reviews: (previous?.reviews || 0) + 1, rating};
}
export function validProgress(value, ids) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, p]) => ids.has(id) && p && Number.isFinite(p.due) && Number.isFinite(p.last) && Number.isInteger(p.stage) && p.stage >= 0 && p.stage <= 4 && Number.isInteger(p.reviews) && p.reviews > 0));
}
export function makeQueue(exercises, progress, {topic = 'all', level = 'all', mode = 'all', dueOnly = false, limit = 8, now = Date.now()} = {}) {
  const pool = exercises.filter(e => (topic === 'all' || e.topic === topic) && (level === 'all' || e.level === level) && (mode === 'all' || e.type === mode) && (!dueOnly || (progress[e.id] && progress[e.id].due <= now)))
    .map((e, order) => ({e, order, group: progress[e.id] ? progress[e.id].due <= now ? 0 : 3 : e.level === 'B1' ? 1 : 2}))
    .sort((a,b) => a.group-b.group || (a.group === 0 ? progress[a.e.id].due-progress[b.e.id].due : a.order-b.order));
  const result=[], types={}, topics={};
  while(pool.length && result.length < limit){
    const group=pool[0].group;
    let pick=0;
    if(group!==0){
      const weight=x=>(types[x.e.type]||0)*2+(topics[x.e.topic]||0);
      for(let i=1;i<pool.length && pool[i].group===group;i++)if(weight(pool[i])<weight(pool[pick]))pick=i;
    }
    const {e}=pool.splice(pick,1)[0];result.push(e);types[e.type]=(types[e.type]||0)+1;topics[e.topic]=(topics[e.topic]||0)+1;
  }
  return result;
}
export function isCorrect(exercise, option) { return exercise.type === 'choose' && exercise.correct.includes(option); }
export function hashText(text) { let h = 2166136261; for (const b of new TextEncoder().encode(text)) h = Math.imul(h ^ b, 16777619); return (h >>> 0).toString(16).padStart(8,'0'); }
