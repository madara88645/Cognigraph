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
        "what_happens": "The face reaches primary visual cortex via the retina and thalamus, which pulls out edges, contrast and orientation in a retinotopic map.",
        "why_it_matters": "This is the first cortical stage of seeing anything: without intact V1, no conscious visual image of the face can form.",
        "evidence_or_method": "Human visual evoked potential (C1 component) and macaque LGN/V1 latencies (~20-30ms onset in monkeys; longer human conduction distance implies ~50-70ms)."
      },
      {
        "region_ids": [
          "v4"
        ],
        "approx_ms": 95,
        "what_happens": "Ventral-stream area V4 refines colour and mid-level shape, starting to lift the face's form off the background.",
        "why_it_matters": "Builds the shape/color scaffolding that face-specific processing depends on.",
        "evidence_or_method": "Macaque V4 shape/color-tuned single-unit response timing; precise human latency is inferred, not directly measured non-invasively."
      },
      {
        "region_ids": [
          "ffa"
        ],
        "approx_ms": 170,
        "what_happens": "The fusiform face area encodes the face's structure holistically, separating it from other object categories.",
        "why_it_matters": "This is the brain's dedicated specialization for face shape — damage here causes prosopagnosia even with otherwise normal vision.",
        "evidence_or_method": "N170 ERP component (occipito-temporal electrodes); simultaneous fMRI-EEG points to the fusiform gyrus/FFA as a primary, though likely not the sole, contributor (Gao et al., 2019, Psychophysiology), with the occipital face area and superior temporal sulcus also implicated."
      },
      {
        "region_ids": [
          "hippocampus",
          "amygdala"
        ],
        "approx_ms": 300,
        "what_happens": "The medial temporal lobe matches the identity against stored memories while the amygdala tags its emotional significance.",
        "why_it_matters": "Recognizing THAT something is a face and recognizing WHO it is are separable steps that can be selectively impaired independently.",
        "evidence_or_method": "fMRI studies of familiar-face recognition implicate medial-temporal/hippocampal regions; timing is estimated from MEG/intracranial familiarity effects rather than one sharp ERP marker."
      },
      {
        "region_ids": [
          "vmpfc_ofc",
          "dlpfc"
        ],
        "approx_ms": 400,
        "what_happens": "Prefrontal regions fuse identity and emotional tag into a conscious, nameable recognition: 'that's my friend Alex'.",
        "why_it_matters": "This step converts a visual/memory match into a usable, reportable social recognition.",
        "evidence_or_method": "fMRI/EEG studies of person-identification implicate prefrontal integration; this final stage is the least precisely time-locked step in the sequence."
      }
    ],
    "accuracy_caveats": "Millisecond values are group averages from lab EEG/MEG/fMRI tasks, not measurements of one real glance. The N170 (step 3) marks detecting a face, not knowing whose it is; steps 4-5 are estimates, not established components."
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
        "what_happens": "A retrieval cue ('what was her name?') starts a strategic search run by prefrontal and parietal control regions.",
        "why_it_matters": "Retrieval is an active search process that can succeed, fail, or stall — as in the 'tip-of-the-tongue' state.",
        "evidence_or_method": "fMRI studies of directed memory search show dorsolateral prefrontal and parietal engagement during retrieval effort."
      },
      {
        "region_ids": [
          "hippocampus"
        ],
        "approx_ms": 400,
        "what_happens": "The hippocampus performs pattern completion: a partial cue reactivates the full memory trace spread across cortex.",
        "why_it_matters": "This computation lets a small hint (a face, a context) unlock a whole memory.",
        "evidence_or_method": "Computational memory models (Marr, 1971; O'Reilly & McClelland, 1994) and hippocampal lesion/imaging studies; exact human timing is inferred from ERP 'old/new' effects, not measured directly for this specific computation."
      },
      {
        "region_ids": [
          "thalamus",
          "hippocampus"
        ],
        "approx_ms": 450,
        "what_happens": "A frontally-generated familiarity signal can arrive ('I know this person') before full recollection does.",
        "why_it_matters": "Familiarity and full recollection are dissociable memory processes with different reliability.",
        "evidence_or_method": "Frontal/early old-new ERP effect associated with familiarity, roughly 300-500ms post-cue (Rugg & Curran, 2007 review)."
      },
      {
        "region_ids": [
          "ppc"
        ],
        "approx_ms": 650,
        "what_happens": "If retrieval succeeds, a later parietal signal marks full recollection, recovering the specific context.",
        "why_it_matters": "Distinguishes vague familiarity from rich, detailed remembering, explaining why some memories 'come back in a flash' with context and others stay vague.",
        "evidence_or_method": "Parietal old/new ERP effect, roughly 500-800ms post-cue, associated with recollection (Rugg & Curran, 2007)."
      },
      {
        "region_ids": [
          "broca",
          "wernicke"
        ],
        "approx_ms": 800,
        "what_happens": "Language areas turn the retrieved concept into the actual word or name and ready it for speech.",
        "why_it_matters": "This lexical-retrieval step is exactly where 'tip-of-the-tongue' failures happen — the concept/face can be known without accessing its word form.",
        "evidence_or_method": "Tip-of-the-tongue research (Brown & McNeill, 1966) and neuroimaging implicating left insula/frontal regions in successful word-form retrieval."
      }
    ],
    "accuracy_caveats": "Retrieval timings are averaged ERP windows, not checkpoints, and they shift enormously with how well-learned the memory is. Broca's and Wernicke's areas are labelled the classic way for teaching only: word retrieval draws on a distributed fronto-temporo-parietal network (Tremblay & Dick, 2016)."
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
        "what_happens": "A crude, low-resolution version of the scene runs through the thalamus toward the amygdala on a fast subcortical shortcut.",
        "why_it_matters": "This 'quick and dirty' route can trigger a protective reaction before you've consciously identified what you saw.",
        "evidence_or_method": "MEG gamma-band work reports thalamic/hypothalamic engagement roughly 10-20 ms after a threatening face (Luo et al., 2007, NeuroImage 34(2):839-847). A faster amygdala figure from the same method is left out: source-localising a small deep structure with MEG is contested, and the thalamo-amygdala shortcut is established by rodent tract-tracing and only inferred in humans."
      },
      {
        "region_ids": [
          "amygdala"
        ],
        "approx_ms": 80,
        "what_happens": "The amygdala evaluates that coarse input for threat and can already start a defensive response.",
        "why_it_matters": "This speed advantage — acting before full visual analysis finishes — is thought to be adaptive: better a false alarm than a fatal delay.",
        "evidence_or_method": "Human intracranial amygdala recordings show responses to fearful faces beginning ~74-88ms post-stimulus (Méndez-Bértolo et al., 2016, Nature Neuroscience)."
      },
      {
        "region_ids": [
          "hypothalamus"
        ],
        "approx_ms": 150,
        "what_happens": "The amygdala engages the hypothalamus, which triggers the sympathetic fight-or-flight cascade: stress hormones, heart rate, blood to muscles.",
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
        "what_happens": "In parallel, the slower cortical 'high road' finishes the detailed analysis: real snake, or curved stick?",
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
        "what_happens": "If the detail says harmless, ventromedial prefrontal cortex helps damp the amygdala down while insula and ACC register the bodily signals.",
        "why_it_matters": "This regulation step is impaired in some anxiety disorders — an overactive amygdala without adequate prefrontal 'braking' can produce persistent or excessive fear.",
        "evidence_or_method": "vmPFC-amygdala functional connectivity and its role in fear regulation/extinction is documented in human fMRI (e.g., Phelps et al., 2004, Neuron), though exact millisecond timing of this regulatory step is not precisely established."
      }
    ],
    "accuracy_caveats": "The fast subcortical 'low road' to the amygdala is established by tract-tracing in rodents and only inferred, and actively debated, in humans. The amygdala figure used here is the intracranial 74-88 ms onset; the hypothalamic and autonomic timings are extrapolated, not measured in humans."
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
        "what_happens": "Ventromedial prefrontal/orbitofrontal cortex gives each option a subjective value from past experience and current state.",
        "why_it_matters": "This 'common currency' computation lets you compare completely different things (candy vs. chips) on one internal value scale.",
        "evidence_or_method": "Single-neuron recordings in macaque OFC encoding relative subjective value (Padoa-Schioppa & Assad, 2006, Nature) and human fMRI value-correlate studies (Rangel and colleagues)."
      },
      {
        "region_ids": [
          "dlpfc",
          "acc"
        ],
        "approx_ms": 300,
        "what_happens": "Dorsolateral prefrontal cortex holds the options in working memory while the ACC watches for conflict between close values.",
        "why_it_matters": "Close-call decisions take measurably longer and engage more conflict-monitoring activity — why difficult decisions feel effortful.",
        "evidence_or_method": "ACC conflict-monitoring literature (Botvinick et al., 2001) and P300 latency increasing with decision difficulty."
      },
      {
        "region_ids": [
          "striatum",
          "ppc"
        ],
        "approx_ms": 400,
        "what_happens": "Evidence for each option accumulates in striatal and parietal circuits (a drift-diffusion-like process) until one crosses a threshold.",
        "why_it_matters": "Explains the classic speed-accuracy tradeoff: rushing lowers the threshold and raises errors; deliberation raises accuracy at the cost of time.",
        "evidence_or_method": "Centro-parietal positivity ('CPP') tracks evidence accumulation to threshold, roughly 250-500ms depending on difficulty (O'Connell et al., 2012, Nature Neuroscience); drift-diffusion modeling (Ratcliff & McKoon, 2008)."
      },
      {
        "region_ids": [
          "m1"
        ],
        "approx_ms": 500,
        "what_happens": "Once the threshold is crossed, primary motor cortex executes the chosen action and reaches for the snack.",
        "why_it_matters": "This is the irreversible commitment point — before this, the 'decision' is still internally revisable.",
        "evidence_or_method": "Motor-evoked potential and reaction-time studies linking decision commitment to movement onset."
      }
    ],
    "accuracy_caveats": "These figures come from simple two-alternative lab decisions. Real choices with more options, social context or higher stakes take much longer, and the numbers shift with difficulty and confidence."
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
        "what_happens": "A patch of fusiform gyrus, the 'visual word form area', recognises the letter string as a familiar word shape whatever the font.",
        "why_it_matters": "This is why skilled readers recognize whole familiar words almost instantly rather than sounding out every letter.",
        "evidence_or_method": "Visual word form area studies (Dehaene & Cohen, 2011, Trends in Cognitive Sciences) report word-selective responses in a ~150-200ms window, in a region adjacent to but distinct from the face-selective N170 source."
      },
      {
        "region_ids": [
          "wernicke"
        ],
        "approx_ms": 400,
        "what_happens": "Wernicke's area and nearby temporal regions retrieve the word's meaning, and an unexpected next word leaves a distinctive signature.",
        "why_it_matters": "Shows the brain actively predicts upcoming words from context rather than processing them in isolation.",
        "evidence_or_method": "N400 ERP component, peaking ~400ms, larger for semantically unexpected words (Kutas & Hillyard, 1980, Science)."
      },
      {
        "region_ids": [
          "broca"
        ],
        "approx_ms": 500,
        "what_happens": "Broca's area parses the sentence's grammar and, if you are reading aloud, prepares the articulation plan.",
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
    "accuracy_caveats": "This is one influential sequence; real reading also runs a parallel phonological route and can overlap or skip stages. The Broca/Wernicke split is labelled the classic way for teaching but modern aphasiology treats it as obsolete (Tremblay & Dick, 2016; Dronkers et al., 2007)."
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
        "what_happens": "Early attempts are slow and effortful: prefrontal and parietal control regions steer every part of the movement.",
        "why_it_matters": "Explains why a brand-new skill feels mentally exhausting even though the movements themselves are simple — you're using effortful general-purpose control, not a specialized motor circuit yet.",
        "evidence_or_method": "Doyon et al. (2003, 2018) models of motor sequence learning describe an early 'fast learning' stage with strong prefrontal/associative involvement."
      },
      {
        "region_ids": [
          "cerebellum"
        ],
        "approx_ms": 5000,
        "what_happens": "The cerebellum compares the predicted sensory outcome against what happened and turns the mismatch into a correction.",
        "why_it_matters": "This trial-by-trial error correction is the core mechanism of motor learning — why immediate feedback speeds learning dramatically.",
        "evidence_or_method": "Cerebellar internal/forward-model theory of motor learning (Wolpert, Miall & Kawato, 1998, Trends in Cognitive Sciences)."
      },
      {
        "region_ids": [
          "striatum",
          "globus_pallidus"
        ],
        "approx_ms": 15000,
        "what_happens": "As the sequence gets reliable, control shifts toward the striatum, which encodes the whole thing as one learned chunk.",
        "why_it_matters": "This chunking is why a practiced serve eventually feels like one smooth motion rather than separate decisions.",
        "evidence_or_method": "Striatal associative-to-sensorimotor shift with automaticity, and action-sequence chunking (Yin & Knowlton, 2006, Nature Reviews Neuroscience; Graybiel, 1998)."
      },
      {
        "region_ids": [
          "substantia_nigra",
          "striatum"
        ],
        "approx_ms": 20000,
        "what_happens": "Dopamine from the substantia nigra reinforces the patterns that worked, strengthening the corticostriatal connections behind them.",
        "why_it_matters": "This reward-based strengthening is why skills improve faster with clear success/failure feedback.",
        "evidence_or_method": "Nigrostriatal dopamine's role in reinforcement learning and corticostriatal plasticity (Schultz, 1998, and later studies)."
      },
      {
        "region_ids": [
          "m1",
          "cerebellum"
        ],
        "approx_ms": 30000,
        "what_happens": "With enough practice the skill runs largely automatically, with minimal conscious prefrontal involvement.",
        "why_it_matters": "Procedural memories are famously robust — they survive even severe declarative-memory damage, showing they are stored differently from facts and events.",
        "evidence_or_method": "Amnesic patient H.M. learned and retained new motor skills (e.g., mirror-tracing) at a normal rate despite no explicit memory of practicing them (Milner, 1962; Corkin, 1968)."
      }
    ],
    "accuracy_caveats": "Skill learning unfolds over sessions and weeks, so the numbers here are a SCHEMATIC animation order, not measured latencies. The fast/slow-stage model is broadly supported but simplified: real circuits overlap throughout learning rather than handing off cleanly."
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
        "what_happens": "Attention is captured and reoriented to the ball, visible as a lateralised signal over the opposite side of the scalp.",
        "why_it_matters": "This attention 'grab' is largely automatic and hard to suppress — it lets us react to sudden hazards even while focused on something else.",
        "evidence_or_method": "N2pc ERP component (attention-related lateralized negativity), peaking roughly 200-250ms post-onset (Eimer, 1996; Luck & Hillyard, 1994)."
      },
      {
        "region_ids": [
          "locus_coeruleus"
        ],
        "approx_ms": 250,
        "what_happens": "The locus coeruleus fires a phasic burst of noradrenaline, raising the gain of cortical circuits brain-wide.",
        "why_it_matters": "This is the neural basis of the sudden 'jolt' of alertness — a brief, brain-wide shift into a more vigilant mode.",
        "evidence_or_method": "Adaptive gain theory linking phasic locus coeruleus activity to attention/orienting and the P300 component (Aston-Jones & Cohen, 2005, Annual Review of Neuroscience) — based largely on animal electrophysiology, with human evidence more indirect (pupil dilation, fMRI proxies)."
      },
      {
        "region_ids": [
          "acc",
          "m1"
        ],
        "approx_ms": 350,
        "what_happens": "The anterior cingulate cortex helps override the ongoing action while motor cortex executes the braking.",
        "why_it_matters": "This conflict-resolution/override step allows rapid, appropriate behavioral correction instead of continuing a now-inappropriate action.",
        "evidence_or_method": "ACC's role in action monitoring/override in conflict paradigms (Botvinick et al., 2001); driving-simulator studies cite additional reaction-time cost above pure perceptual latency for braking responses."
      }
    ],
    "accuracy_caveats": "This maps a lab attention-capture effect onto a real driving scene. Commonly cited brake-reaction times run roughly 0.7-1.5 seconds, so this region-by-region breakdown is illustrative, not a validated decomposition."
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
        "what_happens": "While you study, the hippocampus binds new episodic traces fast, often in a single exposure.",
        "why_it_matters": "This fast-binding capacity lets you learn new facts in minutes, but these fresh traces are initially fragile and hippocampus-dependent.",
        "evidence_or_method": "Complementary Learning Systems theory (McClelland, McNaughton & O'Reilly, 1995) — hippocampus as fast learner vs. neocortex as slow learner."
      },
      {
        "region_ids": [
          "thalamus"
        ],
        "approx_ms": 3000,
        "what_happens": "In NREM slow-wave sleep the thalamus generates sleep spindles, brief ~12-15Hz bursts that gate out sensory input.",
        "why_it_matters": "Spindles are believed to open a temporal window that helps synchronize cortical and hippocampal activity for memory transfer.",
        "evidence_or_method": "Sleep spindle-memory correlations reviewed in Diekelmann & Born (2010, Nature Reviews Neuroscience)."
      },
      {
        "region_ids": [
          "hippocampus"
        ],
        "approx_ms": 4000,
        "what_happens": "The hippocampus fires sharp-wave ripples: brief ~150-250Hz bursts that replay the day's activity patterns in compressed form.",
        "why_it_matters": "This replay is thought to be the literal mechanism by which the day's experiences get rehearsed for storage — a fast-forwarded highlight reel played to the rest of the brain.",
        "evidence_or_method": "Hippocampal sharp-wave ripple replay during sleep, extensively documented in rodents (Wilson & McNaughton, 1994, Science), with converging human intracranial/fMRI evidence."
      },
      {
        "region_ids": [
          "hippocampus",
          "thalamus"
        ],
        "approx_ms": 4500,
        "what_happens": "Ripples lock onto cortical slow oscillations (~1Hz) and thalamic spindles, a triple coupling thought to time the transfer to cortex.",
        "why_it_matters": "The precision of this coupling (ripples nested in spindles nested in slow-oscillation up-states) predicts overnight retention in some studies.",
        "evidence_or_method": "Slow oscillation-spindle-ripple coupling literature (Staresina et al., 2015, Nature Neuroscience)."
      },
      {
        "region_ids": [
          "dlpfc",
          "ppc"
        ],
        "approx_ms": 8000,
        "what_happens": "Across repeated replay the trace spreads into neocortical networks and leans less on the hippocampus.",
        "why_it_matters": "This 'systems consolidation' explains why old memories can survive hippocampal damage (as in H.M.), while very recent memories cannot.",
        "evidence_or_method": "Systems consolidation theory and temporally graded retrograde amnesia in hippocampal amnesia patients (Squire & Alvarez, 1995); whether cortex ever becomes fully hippocampus-independent remains debated (multiple trace theory offers a competing account)."
      }
    ],
    "accuracy_caveats": "All values here are SCHEMATIC order and spacing, not elapsed time: consolidation runs across whole nights and further nights. REM's specific causal role is still debated and deliberately left out, and systems consolidation competes with multiple trace theory."
  }
];
