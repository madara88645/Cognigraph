// 8 cognitive pathway scenarios.
// Fields: id, timeline ('ms' = approximate measured latencies | 'schematic' = order only, not milliseconds),
// title, scenario_sentence, steps[]{region_ids[], approx_ms, what_happens, why_it_matters, evidence_or_method}, accuracy_caveats.
// Source: research/research.json (mechanically transcribed 2026-09-06), then hand-edited.
export const PATHWAYS = [
  {
    "id": "recognize_face",
    "timeline": "ms",
    "title": "Recognizing a Face",
    "scenario_sentence": "You glance across a crowded room and instantly recognize a friend's face.",
    "steps": [
      {
        "region_ids": [
          "v1"
        ],
        "approx_ms": 55,
        "what_happens": "Light patterns from the face reach the retina and are relayed via the thalamus (LGN) to primary visual cortex, where basic edges, contrast and orientation are extracted in a retinotopic map.",
        "why_it_matters": "This is the first cortical stage of 'seeing' anything — without intact V1, no conscious visual image of the face can form.",
        "evidence_or_method": "Human visual evoked potential (C1 component) and macaque LGN/V1 latencies (~20-30ms onset in monkeys; longer human conduction distance implies ~50-70ms)."
      },
      {
        "region_ids": [
          "v4"
        ],
        "approx_ms": 95,
        "what_happens": "Ventral-stream area V4 refines color and mid-level shape/contour information, beginning to separate the face's form from the background.",
        "why_it_matters": "Builds the shape/color scaffolding that face-specific processing depends on.",
        "evidence_or_method": "Macaque V4 shape/color-tuned single-unit response timing; precise human latency is inferred, not directly measured non-invasively."
      },
      {
        "region_ids": [
          "ffa"
        ],
        "approx_ms": 170,
        "what_happens": "The fusiform face area performs fast, holistic structural encoding of the face, distinguishing it from other object categories.",
        "why_it_matters": "This is the brain's dedicated specialization for face shape — damage here causes prosopagnosia even with otherwise normal vision.",
        "evidence_or_method": "N170 ERP component (occipito-temporal electrodes); simultaneous fMRI-EEG identifies the fusiform gyrus/FFA as a primary — though likely not the sole — contributor to it (Gao et al., 2019, Psychophysiology), with the occipital face area and superior temporal sulcus also implicated in intracranial work."
      },
      {
        "region_ids": [
          "hippocampus",
          "amygdala"
        ],
        "approx_ms": 300,
        "what_happens": "The specific facial identity is matched against stored memories in the medial temporal lobe/hippocampus while the amygdala tags any emotional significance.",
        "why_it_matters": "Recognizing THAT something is a face and recognizing WHO it is are separable steps that can be selectively impaired independently.",
        "evidence_or_method": "fMRI studies of familiar-face recognition implicate medial-temporal/hippocampal regions; timing is estimated from MEG/intracranial familiarity effects rather than one sharp ERP marker."
      },
      {
        "region_ids": [
          "vmpfc_ofc",
          "dlpfc"
        ],
        "approx_ms": 400,
        "what_happens": "Prefrontal regions integrate identity and emotional tag into a conscious, nameable recognition ('that's my friend Alex').",
        "why_it_matters": "This step converts a visual/memory match into a usable, reportable social recognition.",
        "evidence_or_method": "fMRI/EEG studies of person-identification implicate prefrontal integration; this final stage is the least precisely time-locked step in the sequence."
      }
    ],
    "accuracy_caveats": "Millisecond values are approximate averages from group-level EEG/MEG/fMRI studies using simplified lab tasks, not measurements of a single real-world glance. The N170 (step 3) indexes detecting face-like structure, not full personal-identity recognition, which likely takes longer and is less precisely time-locked (steps 4-5 are estimates, not established ERP components)."
  },
  {
    "id": "recall_word",
    "timeline": "ms",
    "title": "Recalling a Word or Name",
    "scenario_sentence": "You try to remember the name of an old classmate.",
    "steps": [
      {
        "region_ids": [
          "dlpfc",
          "ppc"
        ],
        "approx_ms": 200,
        "what_happens": "A retrieval cue ('what was her name?') triggers a strategic search, coordinated by prefrontal and parietal executive regions.",
        "why_it_matters": "Retrieval is an active search process that can succeed, fail, or stall — as in the 'tip-of-the-tongue' state.",
        "evidence_or_method": "fMRI studies of directed memory search show dorsolateral prefrontal and parietal engagement during retrieval effort."
      },
      {
        "region_ids": [
          "hippocampus"
        ],
        "approx_ms": 400,
        "what_happens": "The hippocampus performs 'pattern completion' — using a partial cue to reactivate the full memory trace distributed across cortex.",
        "why_it_matters": "This computation lets a small hint (a face, a context) unlock a whole memory.",
        "evidence_or_method": "Computational memory models (Marr, 1971; O'Reilly & McClelland, 1994) and hippocampal lesion/imaging studies; exact human timing is inferred from ERP 'old/new' effects, not measured directly for this specific computation."
      },
      {
        "region_ids": [
          "thalamus",
          "hippocampus"
        ],
        "approx_ms": 450,
        "what_happens": "A frontally-generated 'familiarity' signal can arise ('I know this person') even before full recollection occurs.",
        "why_it_matters": "Familiarity and full recollection are dissociable memory processes with different reliability.",
        "evidence_or_method": "Frontal/early old-new ERP effect associated with familiarity, roughly 300-500ms post-cue (Rugg & Curran, 2007 review)."
      },
      {
        "region_ids": [
          "ppc"
        ],
        "approx_ms": 650,
        "what_happens": "If retrieval succeeds, a later parietal signal reflects full recollection — recovering specific contextual detail.",
        "why_it_matters": "Distinguishes vague familiarity from rich, detailed remembering, explaining why some memories 'come back in a flash' with context and others stay vague.",
        "evidence_or_method": "Parietal old/new ERP effect, roughly 500-800ms post-cue, associated with recollection (Rugg & Curran, 2007)."
      },
      {
        "region_ids": [
          "broca",
          "wernicke"
        ],
        "approx_ms": 800,
        "what_happens": "Once the concept is retrieved, language areas convert it into the specific word/name and prepare it for speech output.",
        "why_it_matters": "This lexical-retrieval step is exactly where 'tip-of-the-tongue' failures happen — the concept/face can be known without accessing its word form.",
        "evidence_or_method": "Tip-of-the-tongue research (Brown & McNeill, 1966) and neuroimaging implicating left insula/frontal regions in successful word-form retrieval."
      }
    ],
    "accuracy_caveats": "Most memory-retrieval timing here comes from group-averaged ERP 'old/new' effects, not sharp single events — the numbers mark typical windows, not fixed checkpoints, and vary enormously with how well-learned the memory is and how strong the retrieval cue is. The final step labels Broca's and Wernicke's areas for teaching convenience: the classic 'Broca produces, Wernicke comprehends' double dissociation is a simplification, and word retrieval in modern accounts draws on a distributed fronto-temporo-parietal network (Tremblay & Dick, 2016; Broca's own patient Leborgne had damage well beyond the area named for him)."
  },
  {
    "id": "fear_response",
    "timeline": "ms",
    "title": "Fear Response to a Sudden Threat",
    "scenario_sentence": "You spot what might be a snake on the path in front of you.",
    "steps": [
      {
        "region_ids": [
          "thalamus"
        ],
        "approx_ms": 20,
        "what_happens": "A crude, low-resolution version of the scene is relayed through the thalamus toward the amygdala via a fast subcortical shortcut, in parallel with the slower cortical route.",
        "why_it_matters": "This 'quick and dirty' route can trigger a protective reaction before you've consciously identified what you saw.",
        "evidence_or_method": "MEG gamma-band synchronization work reports thalamic/hypothalamic engagement roughly 10-20 ms after a threatening face (Luo, Holroyd, Jones, Hendler & Blair, 2007, NeuroImage 34(2):839-847). An even faster amygdala figure from the same MEG method is deliberately not quoted here: source-localizing a small deep structure with MEG is itself contested, and the intracranial number in the next step is the better-grounded one. The monosynaptic thalamo-amygdala shortcut itself is established by tract-tracing in rodents and only inferred in humans — treat its human speed as an open research question."
      },
      {
        "region_ids": [
          "amygdala"
        ],
        "approx_ms": 80,
        "what_happens": "The amygdala performs rapid threat evaluation on the coarse input (shape, low spatial-frequency contrast) and can begin triggering a defensive response.",
        "why_it_matters": "This speed advantage — acting before full visual analysis finishes — is thought to be adaptive: better a false alarm than a fatal delay.",
        "evidence_or_method": "Human intracranial amygdala recordings show responses to fearful faces beginning ~74-88ms post-stimulus (Méndez-Bértolo et al., 2016, Nature Neuroscience)."
      },
      {
        "region_ids": [
          "hypothalamus"
        ],
        "approx_ms": 150,
        "what_happens": "The amygdala engages the hypothalamus, which triggers the sympathetic 'fight-or-flight' cascade — stress hormones and bodily readiness (heart rate, blood flow to muscles).",
        "why_it_matters": "This converts a brain signal into the felt bodily experience of fear before you've consciously decided how to react.",
        "evidence_or_method": "Amygdala-hypothalamic-brainstem fear circuitry established mainly in animal lesion/stimulation studies (LeDoux and colleagues); precise human millisecond timing for this autonomic cascade is not directly measurable non-invasively and is estimated here."
      },
      {
        "region_ids": [
          "v1",
          "v4",
          "ffa"
        ],
        "approx_ms": 200,
        "what_happens": "In parallel, the slower, detailed cortical ('high road') visual pathway finishes analyzing the object properly — is it really a snake, or a curved stick?",
        "why_it_matters": "This slower but more accurate pathway can override or confirm the fast amygdala-driven alarm.",
        "evidence_or_method": "Standard visual object-recognition timing; full object categorization ERP effects typically emerge ~150-250ms."
      },
      {
        "region_ids": [
          "vmpfc_ofc",
          "acc",
          "insula"
        ],
        "approx_ms": 350,
        "what_happens": "The ventromedial prefrontal cortex evaluates the detailed information and, if the 'threat' is harmless, helps down-regulate the amygdala, while the insula and ACC register bodily sensations and any conflict.",
        "why_it_matters": "This regulation step is impaired in some anxiety disorders — an overactive amygdala without adequate prefrontal 'braking' can produce persistent or excessive fear.",
        "evidence_or_method": "vmPFC-amygdala functional connectivity and its role in fear regulation/extinction is documented in human fMRI (e.g., Phelps et al., 2004, Neuron), though exact millisecond timing of this regulatory step is not precisely established."
      }
    ],
    "accuracy_caveats": "The 'fast subcortical low road vs. slow cortical high road' model of fear was established by tract-tracing in rodents (LeDoux). In humans it is only inferred, from EEG/MEG/intracranial timing, and it is actively debated — several researchers argue the human low road is weaker, slower or less direct than the rodent one. The amygdala latency used here is the intracranial ~74-88 ms onset (Méndez-Bértolo et al., 2016); much faster MEG-based amygdala estimates exist but rest on source-localizing a small deep structure, a genuinely contested method, so they are not mixed into this sequence. Hypothalamic/autonomic timings are extrapolated from general fear-circuit knowledge, not timed non-invasively in humans."
  },
  {
    "id": "making_decision",
    "timeline": "ms",
    "title": "Making a Decision",
    "scenario_sentence": "You're deciding between two snacks at a vending machine.",
    "steps": [
      {
        "region_ids": [
          "v1",
          "ppc"
        ],
        "approx_ms": 100,
        "what_happens": "Visual information about both options is processed and spatial attention is allocated to compare them.",
        "why_it_matters": "You can't weigh options you haven't perceptually registered — attention determines what enters the decision process.",
        "evidence_or_method": "Standard visual latency (V1 ~50-70ms) plus parietal attention engagement."
      },
      {
        "region_ids": [
          "vmpfc_ofc"
        ],
        "approx_ms": 250,
        "what_happens": "The ventromedial prefrontal/orbitofrontal cortex assigns a subjective value to each option, incorporating past experience and current state (e.g., hunger).",
        "why_it_matters": "This 'common currency' computation lets you compare completely different things (candy vs. chips) on one internal value scale.",
        "evidence_or_method": "Single-neuron recordings in macaque OFC encoding relative subjective value (Padoa-Schioppa & Assad, 2006, Nature) and human fMRI value-correlate studies (Rangel and colleagues)."
      },
      {
        "region_ids": [
          "dlpfc",
          "acc"
        ],
        "approx_ms": 300,
        "what_happens": "Dorsolateral prefrontal cortex holds the options and values in working memory while the anterior cingulate cortex monitors for conflict if the values are close.",
        "why_it_matters": "Close-call decisions take measurably longer and engage more conflict-monitoring activity — why difficult decisions feel effortful.",
        "evidence_or_method": "ACC conflict-monitoring literature (Botvinick et al., 2001) and P300 latency increasing with decision difficulty."
      },
      {
        "region_ids": [
          "striatum",
          "ppc"
        ],
        "approx_ms": 400,
        "what_happens": "Evidence for each option accumulates (a drift-diffusion-like process) until one option crosses a decision threshold, involving striatal and parietal circuits.",
        "why_it_matters": "Explains the classic speed-accuracy tradeoff: rushing lowers the threshold and raises errors; deliberation raises accuracy at the cost of time.",
        "evidence_or_method": "Centro-parietal positivity ('CPP') tracks evidence accumulation to threshold, roughly 250-500ms depending on difficulty (O'Connell et al., 2012, Nature Neuroscience); drift-diffusion modeling (Ratcliff & McKoon, 2008)."
      },
      {
        "region_ids": [
          "m1"
        ],
        "approx_ms": 500,
        "what_happens": "Once threshold is crossed, primary motor cortex executes the chosen action (reaching for the snack).",
        "why_it_matters": "This is the irreversible commitment point — before this, the 'decision' is still internally revisable.",
        "evidence_or_method": "Motor-evoked potential and reaction-time studies linking decision commitment to movement onset."
      }
    ],
    "accuracy_caveats": "These figures describe simple, well-studied lab decisions (two-alternative forced-choice tasks); real-world decisions with more options, social context, or higher stakes take much longer, and the exact millisecond figures shift substantially with decision difficulty and confidence."
  },
  {
    "id": "reading_sentence",
    "timeline": "ms",
    "title": "Reading a Sentence",
    "scenario_sentence": "You read the sentence: 'The tired cat sat on the...' and predict what comes next.",
    "steps": [
      {
        "region_ids": [
          "v1"
        ],
        "approx_ms": 60,
        "what_happens": "Visual cortex registers the basic shapes of the printed letters.",
        "why_it_matters": "Reading starts as pure vision, before any letter or word knowledge is applied.",
        "evidence_or_method": "Standard V1 visual evoked potential latency."
      },
      {
        "region_ids": [
          "ffa"
        ],
        "approx_ms": 180,
        "what_happens": "A specialized patch of the fusiform gyrus (the 'visual word form area', adjacent to face-processing cortex) recognizes the letter string as a familiar written word shape, independent of font or case.",
        "why_it_matters": "This is why skilled readers recognize whole familiar words almost instantly rather than sounding out every letter.",
        "evidence_or_method": "Visual word form area studies (Dehaene & Cohen, 2011, Trends in Cognitive Sciences) report word-selective responses in a ~150-200ms window, in a region adjacent to but distinct from the face-selective N170 source."
      },
      {
        "region_ids": [
          "wernicke"
        ],
        "approx_ms": 400,
        "what_happens": "Wernicke's area and surrounding temporal/semantic regions access the word's meaning; an unexpected next word ('...on the moon' instead of '...on the mat') produces a distinctive brain signature.",
        "why_it_matters": "Shows the brain actively predicts upcoming words from context rather than processing them in isolation.",
        "evidence_or_method": "N400 ERP component, peaking ~400ms, larger for semantically unexpected words (Kutas & Hillyard, 1980, Science)."
      },
      {
        "region_ids": [
          "broca"
        ],
        "approx_ms": 500,
        "what_happens": "Broca's area parses the sentence's grammatical structure and, if reading aloud, prepares the articulatory motor plan.",
        "why_it_matters": "Grammar processing and speech planning are separable from word meaning — why Broca's aphasia patients understand meaning but struggle to produce fluent, grammatical sentences.",
        "evidence_or_method": "Syntactic ERP effects (e.g., P600, linked to grammatical reanalysis) and classic Broca's-aphasia lesion-symptom mapping."
      },
      {
        "region_ids": [
          "m1"
        ],
        "approx_ms": 600,
        "what_happens": "If reading aloud, primary motor cortex (orofacial region) executes the speech articulation.",
        "why_it_matters": "Converts the linguistic plan into physical sound.",
        "evidence_or_method": "Standard motor execution timing following articulatory planning."
      }
    ],
    "accuracy_caveats": "This describes one influential (broadly dual-route-inspired) sequence; real reading also uses a parallel phonological route via parietal/temporal regions for unfamiliar or nonsense words, and skilled silent reading can overlap or shortcut several stages rather than running them strictly in series. The Wernicke and Broca steps are labeled the classic way for teaching, but that double dissociation is now regarded as obsolete in modern aphasiology — comprehension and syntax draw on a distributed network served by several white-matter tracts, not two areas joined by the arcuate fasciculus alone (Tremblay & Dick, 2016; Dronkers et al., 2007)."
  },
  {
    "id": "motor_skill_learning",
    "timeline": "schematic",
    "title": "Learning a New Motor Skill",
    "scenario_sentence": "You practice a new tennis serve over several training sessions.",
    "steps": [
      {
        "region_ids": [
          "dlpfc",
          "ppc",
          "m1"
        ],
        "approx_ms": 0,
        "what_happens": "Early attempts are slow and effortful — prefrontal and parietal executive regions are heavily engaged to consciously control each part of the movement.",
        "why_it_matters": "Explains why a brand-new skill feels mentally exhausting even though the movements themselves are simple — you're using effortful general-purpose control, not a specialized motor circuit yet.",
        "evidence_or_method": "Doyon et al. (2003, 2018) models of motor sequence learning describe an early 'fast learning' stage with strong prefrontal/associative involvement."
      },
      {
        "region_ids": [
          "cerebellum"
        ],
        "approx_ms": 5000,
        "what_happens": "With each attempt, the cerebellum compares the predicted sensory outcome (an internal 'forward model') against what actually happened, computing an error signal to adjust the next attempt.",
        "why_it_matters": "This trial-by-trial error correction is the core mechanism of motor learning — why immediate feedback speeds learning dramatically.",
        "evidence_or_method": "Cerebellar internal/forward-model theory of motor learning (Wolpert, Miall & Kawato, 1998, Trends in Cognitive Sciences)."
      },
      {
        "region_ids": [
          "striatum",
          "globus_pallidus"
        ],
        "approx_ms": 15000,
        "what_happens": "As the sequence becomes more reliable, control shifts toward the basal ganglia (striatum), which increasingly encodes the whole sequence as one learned 'chunk'.",
        "why_it_matters": "This chunking is why a practiced serve eventually feels like one smooth motion rather than separate decisions.",
        "evidence_or_method": "Striatal associative-to-sensorimotor shift with automaticity, and action-sequence chunking (Yin & Knowlton, 2006, Nature Reviews Neuroscience; Graybiel, 1998)."
      },
      {
        "region_ids": [
          "substantia_nigra",
          "striatum"
        ],
        "approx_ms": 20000,
        "what_happens": "Dopaminergic signals from the substantia nigra reinforce successful movement patterns, strengthening the corticostriatal connections that produced a good outcome.",
        "why_it_matters": "This reward-based strengthening is why skills improve faster with clear success/failure feedback.",
        "evidence_or_method": "Nigrostriatal dopamine's role in reinforcement learning and corticostriatal plasticity (Schultz, 1998, and later studies)."
      },
      {
        "region_ids": [
          "m1",
          "cerebellum"
        ],
        "approx_ms": 30000,
        "what_happens": "With enough practice, the skill becomes largely automatic ('procedural memory') — executable with minimal conscious prefrontal involvement.",
        "why_it_matters": "Procedural memories are famously robust — they survive even severe declarative-memory damage, showing they are stored differently from facts and events.",
        "evidence_or_method": "Amnesic patient H.M. learned and retained new motor skills (e.g., mirror-tracing) at a normal rate despite no explicit memory of practicing them (Milner, 1962; Corkin, 1968)."
      }
    ],
    "accuracy_caveats": "Motor skill learning unfolds over minutes, sessions and days/weeks, not milliseconds. The approx_ms values above are a SCHEMATIC animation timeline only (relative order/spacing within a compressed practice montage), not measured neural latencies — treat this pathway's timing as ORDER of engagement, not literal figures. The Doyon fast/slow-stage model and cortical-to-subcortical shift are broadly supported but simplified here; real circuits overlap throughout learning rather than handing off cleanly."
  },
  {
    "id": "attention_shift",
    "timeline": "ms",
    "title": "Shifting Attention to a Sudden Event",
    "scenario_sentence": "While driving, a ball suddenly rolls into the street ahead of you.",
    "steps": [
      {
        "region_ids": [
          "v1"
        ],
        "approx_ms": 60,
        "what_happens": "The sudden motion and contrast change registers in visual cortex as a salient, bottom-up event.",
        "why_it_matters": "Sudden, high-contrast, moving stimuli automatically grab visual processing resources before you consciously 'decide' to look.",
        "evidence_or_method": "Standard early visual response latency (V1 ~50-70ms); subcortical salience circuits (superior colliculus/pulvinar, not separately modeled here) also contribute to this capture."
      },
      {
        "region_ids": [
          "mt_v5"
        ],
        "approx_ms": 100,
        "what_happens": "MT/V5 rapidly computes the object's motion direction and speed.",
        "why_it_matters": "Fast motion computation is essential for predicting where a moving hazard will be a moment from now, not just where it is.",
        "evidence_or_method": "MT/V5 motion-selective response latencies in primate electrophysiology, generally in the 80-120ms range."
      },
      {
        "region_ids": [
          "ppc"
        ],
        "approx_ms": 220,
        "what_happens": "Attention is captured and reoriented toward the ball's location, visible as a lateralized attention signal over posterior scalp contralateral to the object.",
        "why_it_matters": "This attention 'grab' is largely automatic and hard to suppress — it lets us react to sudden hazards even while focused on something else.",
        "evidence_or_method": "N2pc ERP component (attention-related lateralized negativity), peaking roughly 200-250ms post-onset (Eimer, 1996; Luck & Hillyard, 1994)."
      },
      {
        "region_ids": [
          "locus_coeruleus"
        ],
        "approx_ms": 250,
        "what_happens": "The locus coeruleus fires a phasic burst of noradrenaline in response to the salient event, boosting the gain/responsiveness of relevant cortical circuits brain-wide.",
        "why_it_matters": "This is the neural basis of the sudden 'jolt' of alertness — a brief, brain-wide shift into a more vigilant mode.",
        "evidence_or_method": "Adaptive gain theory linking phasic locus coeruleus activity to attention/orienting and the P300 component (Aston-Jones & Cohen, 2005, Annual Review of Neuroscience) — based largely on animal electrophysiology, with human evidence more indirect (pupil dilation, fMRI proxies)."
      },
      {
        "region_ids": [
          "acc",
          "m1"
        ],
        "approx_ms": 350,
        "what_happens": "The anterior cingulate cortex helps override the ongoing action if needed, and motor cortex executes the corrective response (braking).",
        "why_it_matters": "This conflict-resolution/override step allows rapid, appropriate behavioral correction instead of continuing a now-inappropriate action.",
        "evidence_or_method": "ACC's role in action monitoring/override in conflict paradigms (Botvinick et al., 2001); driving-simulator studies cite additional reaction-time cost above pure perceptual latency for braking responses."
      }
    ],
    "accuracy_caveats": "This pathway compresses a well-studied lab phenomenon (covert attentional capture in simple visual-search displays) onto a more complex real-world scenario (driving). Real hazard-braking reaction times vary widely — commonly cited overall brake-reaction times in driving research are roughly 0.7-1.5 seconds, depending on expectancy, distraction and individual differences — so this region-by-region breakdown is illustrative, not a validated decomposition of real driving reaction time."
  },
  {
    "id": "sleep_consolidation",
    "timeline": "schematic",
    "title": "Sleep and Memory Consolidation",
    "scenario_sentence": "You study for an exam in the evening, sleep, and remember the material better the next morning.",
    "steps": [
      {
        "region_ids": [
          "hippocampus"
        ],
        "approx_ms": 0,
        "what_happens": "During studying (while awake), the hippocampus rapidly encodes new episodic memory traces, acting as a 'fast learner' that can bind new information in a single exposure.",
        "why_it_matters": "This fast-binding capacity lets you learn new facts in minutes, but these fresh traces are initially fragile and hippocampus-dependent.",
        "evidence_or_method": "Complementary Learning Systems theory (McClelland, McNaughton & O'Reilly, 1995) — hippocampus as fast learner vs. neocortex as slow learner."
      },
      {
        "region_ids": [
          "thalamus"
        ],
        "approx_ms": 3000,
        "what_happens": "Entering NREM slow-wave sleep, the thalamus generates sleep spindles (brief ~12-15Hz oscillation bursts) that help gate out sensory input and coordinate cortical activity.",
        "why_it_matters": "Spindles are believed to open a temporal window that helps synchronize cortical and hippocampal activity for memory transfer.",
        "evidence_or_method": "Sleep spindle-memory correlations reviewed in Diekelmann & Born (2010, Nature Reviews Neuroscience)."
      },
      {
        "region_ids": [
          "hippocampus"
        ],
        "approx_ms": 4000,
        "what_happens": "The hippocampus generates sharp-wave ripples — brief (~50-100ms), fast (~150-250Hz) oscillatory bursts during which recently learned activity patterns are 'replayed' in compressed, accelerated form.",
        "why_it_matters": "This replay is thought to be the literal mechanism by which the day's experiences get rehearsed for storage — a fast-forwarded highlight reel played to the rest of the brain.",
        "evidence_or_method": "Hippocampal sharp-wave ripple replay during sleep, extensively documented in rodents (Wilson & McNaughton, 1994, Science), with converging human intracranial/fMRI evidence."
      },
      {
        "region_ids": [
          "hippocampus",
          "thalamus"
        ],
        "approx_ms": 4500,
        "what_happens": "Hippocampal ripples become temporally coupled with cortical slow oscillations (~0.5-1Hz) and thalamic spindles, forming coordinated 'triple coupling' thought to time information transfer to cortex.",
        "why_it_matters": "The precision of this coupling (ripples nested in spindles nested in slow-oscillation up-states) predicts overnight retention in some studies.",
        "evidence_or_method": "Slow oscillation-spindle-ripple coupling literature (Staresina et al., 2015, Nature Neuroscience)."
      },
      {
        "region_ids": [
          "dlpfc",
          "ppc"
        ],
        "approx_ms": 8000,
        "what_happens": "Over repeated replay across the night (and following nights), the memory trace becomes gradually distributed across neocortical networks, including prefrontal and parietal regions, and less dependent on the hippocampus.",
        "why_it_matters": "This 'systems consolidation' explains why old memories can survive hippocampal damage (as in H.M.), while very recent memories cannot.",
        "evidence_or_method": "Systems consolidation theory and temporally graded retrograde amnesia in hippocampal amnesia patients (Squire & Alvarez, 1995); whether cortex ever becomes fully hippocampus-independent remains debated (multiple trace theory offers a competing account)."
      }
    ],
    "accuracy_caveats": "All approx_ms values in this pathway are SCHEMATIC (representing order and relative spacing within a compressed overnight animation), not real elapsed times — consolidation actually unfolds over multiple sleep cycles across a full night and further nights. The specific causal role of REM sleep (versus NREM/slow-wave sleep) in consolidation remains actively debated and is deliberately not included as a distinct step here. 'Systems consolidation' is a leading model, but multiple trace theory and trace transformation theory offer competing accounts of how completely and quickly hippocampal dependence is lost."
  }
];
