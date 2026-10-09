// Seed data. Used by the offline mock backend and to generate supabase/seed.sql (npm run gen:seed).
import { APP_NAME, UNLOCK_PRICE, FREE_EXPLANATIONS, MARKS } from '../shared/rules.js'
export { APP_NAME, UNLOCK_PRICE, FREE_EXPLANATIONS, MARKS }

const q = (o) => ({ difficulty: 'Medium', marks: 4, status: 'published', video: null, ...o })

export const initialQuestions = [
  q({
    id: 'q1', subject: 'Botany', chapter: 'Photosynthesis in Higher Plants',
    text: 'The reaction centre chlorophyll a of Photosystem II absorbs light maximally at:',
    options: ['700 nm', '680 nm', '640 nm', '450 nm'], correct: 1,
    ncert: 'Class 11 · Photosynthesis in Higher Plants',
    explanation: 'Photosystem II has a reaction centre chlorophyll a that absorbs best at 680 nm, so it is called P680. It sits at the start of the light reaction and is linked to the splitting of water.',
    whyWrong: ['700 nm is P700, the reaction centre of Photosystem I.', '', '640 nm is close to the red peak of chlorophyll b, not a reaction centre.', '450 nm is a blue-region peak that several pigments share. It does not name a reaction centre.'],
    recap: { concept: 'The number in P680 and P700 is the wavelength in nm that the reaction centre absorbs best.', mistake: 'Mixing up which photosystem is which. PS II is 680, PS I is 700.' },
    caption: 'PS II uses P680 and starts the Z-scheme by splitting water.',
    socratic: [
      { ask: 'Photosystems are named P680 and P700. What does the number stand for?', keys: ['wavelength', 'nm', 'absorb', 'light'], hint: 'The number is a measurement of light.', good: 'Yes. It is the wavelength in nm that the reaction centre absorbs best.', sample: 'the wavelength of light it absorbs' },
      { ask: 'Which photosystem acts first in the Z-scheme and is linked to water splitting?', keys: ['ii', 'two', '2', '680', 'water'], hint: 'The names are historical, not in order of action. Think of where water is split.', good: 'PS II (P680) acts first and is linked to water splitting.', sample: 'PS II' },
    ],
  }),
  q({
    id: 'q2', subject: 'Botany', chapter: 'Photosynthesis in Higher Plants',
    text: 'In C4 plants, the primary acceptor of CO2 in the mesophyll cells is:',
    options: ['RuBP', 'Phosphoenolpyruvate (PEP)', 'Oxaloacetic acid', '3-phosphoglyceric acid'], correct: 1,
    ncert: 'Class 11 · Photosynthesis in Higher Plants',
    explanation: 'In the mesophyll of C4 plants, PEP carboxylase fixes CO2 onto the 3-carbon molecule PEP to form 4-carbon oxaloacetic acid. The Calvin cycle then runs in the bundle sheath cells.',
    whyWrong: ['RuBP is the CO2 acceptor of the Calvin cycle, which runs in the bundle sheath here.', '', 'Oxaloacetic acid is the first stable product, not the acceptor.', '3-PGA is the first stable product of the C3 pathway.'],
    recap: { concept: 'C4: PEP (3C) + CO2 gives OAA (4C) in the mesophyll, then Calvin cycle in the bundle sheath.', mistake: 'Calling OAA the acceptor. It is the product.' },
    caption: 'C4 plants split carbon fixation across two cell types.',
    socratic: [
      { ask: 'In a C4 leaf, which cells run the Calvin cycle: mesophyll or bundle sheath?', keys: ['bundle', 'sheath'], hint: 'Kranz anatomy puts the Calvin cycle in the inner ring of cells.', good: 'Correct, the bundle sheath cells.', sample: 'bundle sheath' },
      { ask: 'So which 3-carbon molecule in the mesophyll picks up CO2 first and makes a 4-carbon acid?', keys: ['pep', 'phosphoenol'], hint: 'The enzyme is PEP carboxylase. Name its substrate.', good: 'That is PEP, phosphoenolpyruvate.', sample: 'PEP' },
    ],
  }),
  q({
    id: 'q3', subject: 'Botany', chapter: 'Cell Cycle and Cell Division', difficulty: 'Easy',
    text: 'DNA replication in the cell cycle takes place during:',
    options: ['G1 phase', 'S phase', 'G2 phase', 'M phase'], correct: 1,
    ncert: 'Class 11 · Cell Cycle and Cell Division',
    explanation: 'DNA is replicated in the S (synthesis) phase of interphase. The DNA content doubles from 2C to 4C, but the chromosome number stays the same.',
    whyWrong: ['G1 is a growth phase with no DNA synthesis.', '', 'G2 is preparation for mitosis. DNA is already doubled.', 'M phase is mitosis, which divides the already replicated DNA.'],
    recap: { concept: 'S phase: DNA content 2C to 4C. Chromosome number unchanged.', mistake: 'Thinking chromosome number doubles in S phase.' },
    caption: 'Interphase is G1, S and G2. DNA doubles in S.',
    socratic: [
      { ask: 'One phase of interphase is named for synthesis. Which letter is it?', keys: ['s phase', 's-phase', 'synthesis'], hint: 'Write the phase as "S phase" if you are sure.', good: 'Yes, the S (synthesis) phase.', sample: 'S phase' },
      { ask: 'At G2, does the cell have half, the same or double the DNA of G1?', keys: ['double', 'twice', '4c', 'two times'], hint: 'DNA was just copied in the previous phase.', good: 'Double: 2C becomes 4C.', sample: 'double' },
    ],
  }),
  q({
    id: 'q4', subject: 'Botany', chapter: 'Sexual Reproduction in Flowering Plants',
    text: 'The primary endosperm nucleus (PEN) in angiosperms is:',
    options: ['Haploid', 'Diploid', 'Triploid', 'Tetraploid'], correct: 2,
    ncert: 'Class 12 · Sexual Reproduction in Flowering Plants',
    explanation: 'In double fertilisation one male gamete fuses with the egg (zygote) and the other fuses with the two polar nuclei in the central cell. Haploid + haploid + haploid makes the triploid PEN, which grows into the endosperm.',
    whyWrong: ['Haploid is a gamete or a single polar nucleus.', 'Diploid is the zygote.', '', 'Tetraploid does not arise in normal double fertilisation.'],
    recap: { concept: 'Syngamy gives a diploid zygote. Triple fusion gives a triploid PEN.', mistake: 'Forgetting that the central cell has two polar nuclei.' },
    caption: 'Double fertilisation: syngamy plus triple fusion.',
    socratic: [
      { ask: 'In double fertilisation one male gamete fuses with the egg. What does the other fuse with?', keys: ['polar', 'central cell'], hint: 'It is in the large central cell of the embryo sac.', good: 'The two polar nuclei of the central cell.', sample: 'the two polar nuclei' },
      { ask: 'Each gamete and each polar nucleus is n. How many sets of chromosomes after that fusion?', keys: ['3', '3n', 'three', 'triploid'], hint: 'One male gamete plus two polar nuclei.', good: '3n, so triploid.', sample: '3n' },
    ],
  }),
  q({
    id: 'q5', subject: 'Botany', chapter: 'Plant Growth and Development', difficulty: 'Easy',
    text: 'Bolting in rosette plants such as cabbage is induced by:',
    options: ['Auxin', 'Gibberellin', 'Cytokinin', 'Abscisic acid'], correct: 1,
    ncert: 'Class 11 · Plant Growth and Development',
    explanation: 'Bolting is the sudden elongation of the flowering stalk in rosette plants. Gibberellins promote internode elongation, so spraying them induces bolting.',
    whyWrong: ['Auxin mainly causes apical dominance and cell elongation, not bolting.', '', 'Cytokinin promotes cell division and delays senescence.', 'ABA is a growth inhibitor linked to dormancy and stress.'],
    recap: { concept: 'Gibberellins: internode elongation, bolting, seed germination.', mistake: 'Choosing auxin because it is linked to elongation.' },
    caption: 'Gibberellin spray makes a rosette plant bolt.',
    socratic: [
      { ask: 'Bolting is the rapid elongation of which plant part?', keys: ['stem', 'internode', 'stalk', 'elong'], hint: 'Rosette plants have very short internodes.', good: 'Right, the stem internodes and flowering stalk.', sample: 'the stem' },
      { ask: 'Which hormone is best known for promoting stem elongation in dwarf plants?', keys: ['gibberell', 'ga3'], hint: 'It was first found in a fungus that made rice seedlings grow too tall.', good: 'Gibberellin.', sample: 'gibberellin' },
    ],
  }),
  q({
    id: 'q6', subject: 'Zoology', chapter: 'Human Reproduction', difficulty: 'Easy',
    text: 'In the human male, sperms are stored and finish maturing in the:',
    options: ['Seminiferous tubules', 'Epididymis', 'Vas deferens', 'Prostate gland'], correct: 1,
    ncert: 'Class 12 · Human Reproduction',
    explanation: 'Sperms are made in the seminiferous tubules and move to the epididymis, where they gain motility and the ability to fertilise, and are stored.',
    whyWrong: ['Seminiferous tubules are the site of sperm formation, not storage.', '', 'The vas deferens carries sperms toward the urethra.', 'The prostate adds secretion to the seminal plasma.'],
    recap: { concept: 'Formation: seminiferous tubules. Maturation and storage: epididymis.', mistake: 'Choosing the site of formation.' },
    caption: 'The sperm path: testis, epididymis, vas deferens, urethra.',
    socratic: [
      { ask: 'Where are sperms produced?', keys: ['seminiferous', 'testis', 'testes'], hint: 'Inside the testis, in coiled tubules.', good: 'The seminiferous tubules.', sample: 'seminiferous tubules' },
      { ask: 'After that, a long coiled tube on the testis surface gives them motility. What is it called?', keys: ['epididym'], hint: 'It starts with "epi", meaning on top of the testis.', good: 'The epididymis.', sample: 'epididymis' },
    ],
  }),
  q({
    id: 'q7', subject: 'Zoology', chapter: 'Human Reproduction',
    text: 'Ovulation in the human menstrual cycle is triggered by a surge of:',
    options: ['FSH', 'LH', 'Progesterone', 'Oestrogen'], correct: 1,
    ncert: 'Class 12 · Human Reproduction',
    explanation: 'A mid-cycle surge of LH, the LH surge, causes the Graafian follicle to rupture and release the ovum. Rising oestrogen from the follicle triggers the surge by positive feedback.',
    whyWrong: ['FSH stimulates follicle growth earlier in the cycle.', '', 'Progesterone is made by the corpus luteum after ovulation.', 'Oestrogen triggers the surge but does not itself cause the follicle to rupture.'],
    recap: { concept: 'High oestrogen leads to an LH surge, which leads to ovulation around day 14.', mistake: 'Picking oestrogen because it comes first in the chain.' },
    caption: 'The LH surge is the immediate trigger for ovulation.',
    socratic: [
      { ask: 'Which anterior pituitary hormone surges at mid-cycle, around day 14?', keys: ['lh', 'luteinizing', 'luteinising'], hint: 'Its name starts with L and it later helps form the corpus luteum.', good: 'LH, luteinising hormone.', sample: 'LH' },
      { ask: 'Which rising hormone from the growing follicle gives positive feedback to cause that surge?', keys: ['oestrogen', 'estrogen', 'estradiol'], hint: 'It is made by the granulosa cells of the follicle.', good: 'Oestrogen. It drives the surge, and LH does the rupturing.', sample: 'oestrogen' },
    ],
  }),
  q({
    id: 'q8', subject: 'Zoology', chapter: 'Principles of Inheritance and Variation',
    text: 'A test cross of a dihybrid (AaBb × aabb) gives the phenotypic ratio:',
    options: ['9:3:3:1', '1:1:1:1', '3:1', '1:2:1'], correct: 1,
    ncert: 'Class 12 · Principles of Inheritance and Variation',
    explanation: 'AaBb makes four gamete types (AB, Ab, aB, ab) in equal numbers by independent assortment. The recessive parent only gives ab, so the offspring show 1:1:1:1.',
    whyWrong: ['9:3:3:1 is the F2 ratio of a dihybrid cross (AaBb × AaBb).', '', '3:1 is a monohybrid F2 phenotypic ratio.', '1:2:1 is the monohybrid genotypic ratio.'],
    recap: { concept: 'Test cross ratio reflects the gamete ratio of the tested parent.', mistake: 'Using the F2 ratio 9:3:3:1.' },
    caption: 'The recessive parent reveals the gametes of the other parent.',
    socratic: [
      { ask: 'What gamete types does AaBb make, assuming independent assortment?', keys: ['four', '4', 'ab, ab, ab'], hint: 'Pick one allele of each gene in every combination.', good: 'AB, Ab, aB and ab.', sample: 'AB, Ab, aB, ab' },
      { ask: 'The aabb parent makes only ab. What does that do to the ratio of offspring?', keys: ['equal', '1:1', 'same', 'each'], hint: 'Each offspring type matches one gamete of the first parent.', good: 'The offspring ratio copies the gamete ratio, so 1:1:1:1.', sample: 'equal for all four' },
    ],
  }),
  q({
    id: 'q9', subject: 'Zoology', chapter: 'Excretory Products and their Elimination',
    text: 'Which part of the loop of Henle is impermeable to water?',
    options: ['Descending limb', 'Ascending limb', 'Proximal convoluted tubule', 'Collecting duct'], correct: 1,
    ncert: 'Class 11 · Excretory Products and their Elimination',
    explanation: 'The ascending limb is impermeable to water but lets electrolytes move out, so the filtrate gets diluted as it rises. The descending limb is permeable to water, which makes the filtrate concentrated.',
    whyWrong: ['The descending limb is permeable to water.', '', 'The PCT reabsorbs most of the water and solutes.', 'The collecting duct is permeable to water, regulated by ADH.'],
    recap: { concept: 'Descending limb: water out, filtrate concentrates. Ascending limb: salts out, no water.', mistake: 'Swapping the two limbs.' },
    caption: 'The two limbs create the medullary gradient.',
    socratic: [
      { ask: 'As the filtrate goes down the descending limb, does water leave or enter?', keys: ['leave', 'out', 'concentrat'], hint: 'The medulla is very concentrated.', good: 'Water leaves, so the filtrate gets concentrated.', sample: 'water leaves' },
      { ask: 'In the ascending limb, salts move out. Can water follow them?', keys: ['no', 'not', 'impermeable', 'cannot'], hint: 'Think about why the filtrate becomes dilute here.', good: 'No. The ascending limb is impermeable to water.', sample: 'no, water cannot follow' },
    ],
  }),
  q({
    id: 'q10', subject: 'Zoology', chapter: 'Body Fluids and Circulation', difficulty: 'Easy',
    text: 'The pacemaker of the human heart is the:',
    options: ['AV node', 'SA node', 'Bundle of His', 'Purkinje fibres'], correct: 1,
    ncert: 'Class 11 · Body Fluids and Circulation',
    explanation: 'The sinoatrial (SA) node in the right atrium generates the highest rate of spontaneous impulses, so it sets the heart rate. The AV node, bundle of His and Purkinje fibres conduct the impulse to the ventricles.',
    whyWrong: ['The AV node delays and relays the impulse. It is a backup pacemaker at a slower rate.', '', 'The bundle of His conducts to the ventricles.', 'Purkinje fibres spread the impulse through the ventricular muscle.'],
    recap: { concept: 'The tissue that fires fastest sets the rhythm. In the heart that is the SA node.', mistake: 'Choosing the AV node because it sits in the middle of the conduction path.' },
    caption: 'SA node, AV node, bundle of His, Purkinje fibres.',
    socratic: [
      { ask: 'In which chamber of the heart is the SA node located?', keys: ['right atrium', 'upper right'], hint: 'It is in the upper wall of one atrium.', good: 'The right atrium.', sample: 'right atrium' },
      { ask: 'Why does the node with the fastest spontaneous rate end up in charge of the heartbeat?', keys: ['fast', 'highest', 'rate', 'first'], hint: 'Whichever part fires first sets the pace for the others.', good: 'It fires first and fastest, so the others follow.', sample: 'it fires fastest' },
    ],
  }),
]

const T = (o) => ({ published: true, ...o })
export const initialTests = [
  T({ id: 't1', title: 'Biology Mock 1', kind: 'Full mock', qids: ['q1','q2','q3','q4','q5','q6','q7','q8','q9','q10'], duration: 10, price: UNLOCK_PRICE }),
  T({ id: 't2', title: 'Botany Sprint', kind: 'Botany', qids: ['q1','q2','q3','q4','q5'], duration: 5, price: UNLOCK_PRICE }),
  T({ id: 't3', title: 'Zoology Sprint', kind: 'Zoology', qids: ['q6','q7','q8','q9','q10'], duration: 5, price: UNLOCK_PRICE }),
]

// Static sample numbers shown in admin screens. Clearly marked as sample in the UI.
export const sampleUsers = [
  { name: 'Ibomcha S.', phone: '98xxxxxx21', plan: 'Free', unlocked: 0 },
  { name: 'Thoibi L.', phone: '70xxxxxx64', plan: 'Paid', unlocked: 2 },
  { name: 'Rahul K.', phone: '99xxxxxx08', plan: 'Free', unlocked: 0 },
  { name: 'Memcha N.', phone: '87xxxxxx45', plan: 'Paid', unlocked: 1 },
]

// Tap-to-answer options for each guiding question (key: questionId:stepIndex). Shown shuffled.
// Questions created in Admin have none; the tutor (Claude) can supply them, or the student types.
export const CHOICES = {
  'q1:0': ['The wavelength of light it absorbs best', 'The number of pigment molecules', 'The order of discovery', 'The charge of the reaction centre'],
  'q1:1': ['PS II', 'PS I', 'Both at the same moment', 'Neither, the dark reaction does'],
  'q2:0': ['Bundle sheath cells', 'Mesophyll cells', 'Guard cells', 'Epidermal cells'],
  'q2:1': ['PEP', 'RuBP', 'Pyruvic acid', 'Glucose'],
  'q3:0': ['S phase', 'G1 phase', 'M phase', 'G0 phase'],
  'q3:1': ['Double', 'Half', 'The same', 'Four times'],
  'q4:0': ['The two polar nuclei', 'The antipodals', 'The synergids', 'The egg again'],
  'q4:1': ['3n', '2n', 'n', '4n'],
  'q5:0': ['Stem internodes', 'Roots', 'Leaves', 'Seeds'],
  'q5:1': ['Gibberellin', 'Auxin', 'Cytokinin', 'Abscisic acid'],
  'q6:0': ['Seminiferous tubules', 'Epididymis', 'Prostate', 'Vas deferens'],
  'q6:1': ['Epididymis', 'Seminal vesicle', 'Urethra', 'Prostate'],
  'q7:0': ['LH', 'FSH', 'Prolactin', 'Progesterone'],
  'q7:1': ['Oestrogen', 'Progesterone', 'Testosterone', 'Oxytocin'],
  'q8:0': ['All four: AB, Ab, aB, ab', 'Two types: AB and ab', 'Two types: Ab and aB', 'One type: AB'],
  'q8:1': ['Equal numbers of all four types', '3 to 1', '9 : 3 : 3 : 1', 'Only one type'],
  'q9:0': ['Water leaves, filtrate concentrates', 'Water enters, filtrate dilutes', 'Nothing moves', 'Only urea is removed'],
  'q9:1': ['No, it is impermeable to water', 'Yes, water follows freely', 'Only when ADH is high', 'Only at night'],
  'q10:0': ['Right atrium', 'Left ventricle', 'Interventricular septum', 'Left atrium'],
  'q10:1': ['It fires fastest, so the others follow', 'It is the largest node', 'It is closest to the aorta', 'It is controlled by the lungs'],
}
