// Generates tests/segment_vectors.json from the REAL TypeScript implementation (src/lib/segment.ts),
// so tests/test_process_lesson.py can check that process_lesson.py gives identical results.
//
// Run from the repo root (Node 22.18+ / 24, which runs .ts files directly):
//   node tests/gen_segment_vectors.mjs
// Re-run it whenever splitSentences / findSilences / alignSentences change.
import { writeFileSync } from 'node:fs'

const seg = await import(new URL('../src/lib/segment.ts', import.meta.url).href)

const splitInputs = [
  'Hello there. How are you? I am fine!',
  '  One   two.\n\nThree four  ',
  '',
  '   \n ',
  'When the morning sun finally rose over the quiet hills, the farmers walked slowly to the fields, and the children ran to school.',
  'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen.',
  'I live in Washington, D.C. and I like it very much.',
  'I live in Washington, D.C. Anna lives there too.',
  'Mr. Smith and Dr. Lee arrive at 9 a.m. today.',
  'It is 5 p.m. We go home.',
  'She works in the U.S.',
  'She works in the U.S. He works in the U.K.',
  'Eat fruit, e.g. Apples are good.',
  'It is cheap, i.e. Free.',
  'Cats vs. Dogs is a game.',
  'Martin Luther King Jr. Was kind.',
  'We eat rice, fish, etc. and drink tea.',
  'We eat rice, fish, etc. Then we sleep.',
  'He said "I live in D.C." Then he left.',
  '[He is in the U.S. now.] She is here.',
  'Is it 5 p.m.? Yes! Mr. Lee is late.',
  'When Dr. Lee arrived at the old station in Washington, D.C. at nine a.m. today, the tired workers were already waiting, and the children ran to school.',
  'The ticket costs 5.5 dollars.',
  'It is $3.50. We leave at 9.30 sharp.',
  'Pi is 3.14159. It is long.',
  'I am 25. You are 30.',
  'My new apartment,',
  'Well, Anna with two Ns. Welcome to 1400 Irving Street!',
  'No ending punctuation here',
  'A very long sentence, with several commas, and semicolons; and also colons: that goes on and on for many many words, until it ends.',
  'Hi, are you Anna? Yes, hi there, are you Pete? I am Pete. Nice to meet you.',
  'First: one thing; second: another thing, third: yet another thing that is long enough to be chunked into pieces for sure.',
  'Wait... what? Really!? Yes.',
  'He is Jr. and she is Sr. but they are both Dr. Smith.',
  'The U.S.A. is big. The U.K. is small.',
  'a.m. is morning. p.m. is evening.',
  'Dr. Who? Mrs. Who? Ms. Who?',
]

const alignScenarios = [
  { texts: ['First sentence here.', 'Second one.', 'A third, rather longer sentence.', 'End.'], duration: 20, silences: [] },
  { texts: ['First sentence here.', 'Second one.', 'A third, rather longer sentence.', 'End.'], duration: 20, silences: [3.1, 6, 12.5, 15] },
  { texts: Array.from({ length: 8 }, (_, i) => `Sentence number ${i}.`), duration: 3.6, silences: [0.1, 0.2, 3.5] },
  { texts: Array.from({ length: 10 }, (_, i) => `Sentence ${i}.`), duration: 2, silences: [] },
  { texts: ['Only one.'], duration: 5, silences: [] },
  { texts: [], duration: 5, silences: [] },
  { texts: ['Hi, are you Anna?', 'Yes, hi there, are you Pete?', 'I am Pete.', 'Nice to meet you.', "Let's try that again."], duration: 29.545556, silences: [2.31, 4.3, 5.52, 6.9, 8.1, 9.95, 14.2, 20.15] },
  { texts: ['A.', 'B.', 'C.'], duration: 1.2, silences: [0.4, 0.8] },
  { texts: ['Aaa bbb.', 'Ccc ddd eee.', 'Fff.'], duration: 7.777, silences: [1.234, 5.678] },
  { texts: ['Long one here with many words in it.', 'Short.', 'Medium length sentence.'], duration: 12.3456, silences: [0.05, 11.9] },
  { texts: ['x'.repeat(13), 'y'.repeat(7), 'z'.repeat(29), 'w'.repeat(3)], duration: 10.005, silences: [] },
]

// Deterministic synthetic signal; tests/test_process_lesson.py uses the same formula.
function signal(sampleRate, segments) {
  const out = []
  let i = 0
  for (const [seconds, amp] of segments) {
    const n = Math.round(seconds * sampleRate)
    for (let k = 0; k < n; k++, i++) out.push(amp * Math.sin(i * 0.37))
  }
  return new Float32Array(out)
}
const signals = [
  { sr: 1000, segments: [[1, 0.3], [0.5, 0.001], [2, 0.3], [0.2, 0.001], [1, 0.3], [0.35, 0.0], [1.5, 0.25], [0.8, 0.001]] },
  { sr: 16000, segments: [[0.5, 0.2], [0.4, 0.0005], [0.5, 0.2], [0.3, 0.0005], [0.3, 0.2]] },
  { sr: 1000, segments: [[3, 0.2]] },
  { sr: 1000, segments: [[0.5, 0.001]] },
  // very quiet speech: the absolute floor (0.004) decides, not the mean-based threshold
  { sr: 1000, segments: [[1, 0.01], [0.5, 0.0008], [1, 0.01], [0.4, 0.0008], [1, 0.01]] },
]

const out = {
  split: splitInputs.map((text) => ({ text, out: seg.splitSentences(text) })),
  align: alignScenarios.map((s) => ({
    ...s,
    out: seg.alignSentences(s.texts, s.duration, s.silences).map(({ text, start, end }) => ({ text, start, end })),
  })),
  silences: signals.map((s) => ({ ...s, out: seg.findSilences(signal(s.sr, s.segments), s.sr) })),
}

const target = process.argv[2] ?? new URL('./segment_vectors.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
writeFileSync(target, JSON.stringify(out, null, 1) + '\n')
console.log(`wrote ${target}: ${out.split.length} split, ${out.align.length} align, ${out.silences.length} silence cases`)
