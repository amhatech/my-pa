const encouragements = [
  'Make today count by starting with the next small thing, not the whole mountain.',
  'You do not need to feel ready; begin, and let momentum meet you on the way.',
  'Keep one promise to yourself today. Small acts of discipline build trust.',
  'Protect your focus for one useful step, then give yourself credit for doing it.',
  'Progress beats a perfect plan. Choose what matters and take the first ten minutes.',
  'When you feel stuck, make the next step so small that starting feels easy.',
  'Your future is shaped by what you practice today. Show up for one thing that matters.',
  'Do the important thing before distractions choose your day for you.',
  'A slower day can still be a successful day. Keep moving with intention.',
  'You are allowed to restart at any moment. Begin again with the next choice.',
  'Consistency is built one ordinary decision at a time. Make your next one count.',
  'Give your best attention to one task, finish a small piece, and build from there.',
  'Do not wait for a perfect mood. A focused first step is enough for now.',
  'Be patient with yourself and firm about the next small action.',
];

export function getDailyEncouragement(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const dayNumber = Number.isNaN(date.getTime())
    ? 0
    : Math.floor(date.getTime() / 86_400_000);
  const index = ((dayNumber % encouragements.length) + encouragements.length) % encouragements.length;
  return encouragements[index];
}
