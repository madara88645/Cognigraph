// 28 brain regions used by all modes. Fields: id, name, group, one_liner, functions[], key_connections[], lesion_effects, famous_case_or_evidence, approx_location.
// Source: research/research.json (mechanically transcribed 2026-09-06), then hand-edited.
export const REGIONS = [
  {
    "id": "v1",
    "name": "Primary Visual Cortex (V1)",
    "group": "occipital lobe",
    "one_liner": "The first cortical stop for vision; builds a retinotopic map of edges, contrast and orientation.",
    "functions": [
      "Retinotopic mapping of the visual field",
      "Edge, contrast and orientation detection (simple/complex cells)",
      "Feeds the ventral ('what') and dorsal ('where/how') visual streams"
    ],
    "lesion_effects": "Damage causes a scotoma (blind patch) in the corresponding part of the visual field; bilateral destruction causes cortical blindness, sometimes with 'blindsight' — unconscious residual visual responding via spared subcortical routes.",
    "approx_location": "Posterior pole of the occipital lobe, along the calcarine sulcus, bilateral.",
    "key_connections": [
      "Thalamus (LGN)",
      "V4",
      "MT/V5",
      "Posterior parietal cortex"
    ],
    "famous_case_or_evidence": "Blindsight patients (e.g., patient D.B., studied by Weiskrantz) respond to stimuli in a subjectively 'blind' field, showing vision without V1-based awareness."
  },
  {
    "id": "v4",
    "name": "Visual Area V4",
    "group": "occipito-temporal (ventral stream)",
    "one_liner": "Ventral-stream specialist for color constancy and intermediate shape/form.",
    "functions": [
      "Color processing and color constancy",
      "Curvature and intermediate shape-feature coding",
      "Feeds object- and face-recognition areas downstream"
    ],
    "lesion_effects": "Damage can cause cerebral achromatopsia — loss of color perception (the world looks gray) despite otherwise intact vision and acuity.",
    "approx_location": "Ventral occipito-temporal cortex, anterior to V1/V2, bilateral.",
    "key_connections": [
      "V1",
      "FFA/fusiform gyrus",
      "Posterior parietal cortex"
    ]
  },
  {
    "id": "mt_v5",
    "name": "Middle Temporal Area (MT/V5)",
    "group": "occipito-temporal (dorsal stream)",
    "one_liner": "Dorsal-stream motion specialist computing direction and speed of moving stimuli.",
    "functions": [
      "Motion direction and speed detection",
      "Optic-flow processing for self-motion",
      "Supports smooth-pursuit eye movements"
    ],
    "lesion_effects": "Bilateral damage produces akinetopsia ('motion blindness') — the world appears as a series of static snapshots rather than continuous motion.",
    "approx_location": "Posterior temporal cortex at the temporo-parieto-occipital junction, bilateral.",
    "famous_case_or_evidence": "Patient L.M. (Zihl, von Cramon & Mai, 1983) with bilateral MT-area damage could not perceive continuous motion (e.g., poured liquid looked frozen in successive positions)."
  },
  {
    "id": "ffa",
    "name": "Fusiform Face Area (FFA)",
    "group": "temporal lobe (ventral)",
    "one_liner": "Specializes in fast, holistic recognition of individual faces (and, in an adjacent patch, visual word forms).",
    "functions": [
      "Face detection and holistic/configural structural encoding",
      "Discriminating individual identities from facial structure",
      "Contributes strongly to the face-selective N170 ERP response"
    ],
    "lesion_effects": "Damage causes prosopagnosia (face blindness) — inability to recognize familiar faces by sight, while other object recognition and person identification via voice/gait can remain intact.",
    "approx_location": "Lateral fusiform gyrus, ventral temporal lobe, with a right-hemisphere bias.",
    "famous_case_or_evidence": "Simultaneous fMRI-EEG work (Gao et al., 2019, Psychophysiology) identifies the fusiform gyrus/FFA as a primary — though likely not the sole — contributor to the N170; intracranial studies also implicate the occipital face area and superior temporal sulcus, so the field has not converged on a single generator. Acquired prosopagnosia cases support the region's importance for face identity."
  },
  {
    "id": "a1",
    "name": "Primary Auditory Cortex (A1)",
    "group": "temporal lobe",
    "one_liner": "First cortical relay for sound, mapping sound frequency tonotopically.",
    "functions": [
      "Tonotopic (frequency) mapping of sound",
      "Basic pitch, loudness and timing encoding",
      "Feeds language (Wernicke's area) and auditory 'what/where' streams"
    ],
    "lesion_effects": "Unilateral damage causes only mild contralateral hearing deficits (because subcortical relays are bilateral); bilateral destruction can cause cortical deafness.",
    "approx_location": "Superior temporal gyrus / Heschl's gyrus, bilateral."
  },
  {
    "id": "wernicke",
    "name": "Wernicke's Area",
    "group": "temporal lobe (language-dominant hemisphere)",
    "one_liner": "Supports language comprehension — turning heard or read words into meaning.",
    "functions": [
      "Auditory/lexical comprehension",
      "Semantic access for words and sentences",
      "Monitoring one's own speech for sense"
    ],
    "lesion_effects": "Causes Wernicke's (fluent/receptive) aphasia: fluent, grammatical-sounding but often meaningless speech (paraphasias, neologisms) with poor comprehension; patients are often unaware of their own errors.",
    "approx_location": "Posterior superior temporal gyrus, left hemisphere in roughly 95-99% of right-handers.",
    "key_connections": [
      "Broca's area (via arcuate fasciculus)",
      "A1"
    ],
    "famous_case_or_evidence": "Carl Wernicke's 1874 description of patients with fluent but incoherent speech and poor comprehension, contrasting with Broca's earlier cases. Caveat: the classic Broca-production / Wernicke-comprehension double dissociation is a teaching simplification, not settled fact — modern lesion, imaging and tractography work describes language as a distributed fronto-temporo-parietal network served by several tracts (arcuate, uncinate, inferior fronto-occipital, middle longitudinal), not two boxes joined by one cable (Tremblay & Dick, 2016, Brain and Language, 'Broca and Wernicke are dead')."
  },
  {
    "id": "broca",
    "name": "Broca's Area",
    "group": "frontal lobe (language-dominant hemisphere)",
    "one_liner": "Supports speech production and grammatical sentence construction.",
    "functions": [
      "Articulatory planning for speech",
      "Syntactic/grammatical processing",
      "Coordinating language output with motor cortex"
    ],
    "lesion_effects": "Causes Broca's (non-fluent/expressive) aphasia: slow, effortful, agrammatic ('telegraphic') speech with relatively preserved comprehension; patients are typically aware of and frustrated by the deficit.",
    "approx_location": "Posterior inferior frontal gyrus (pars opercularis/triangularis), typically left hemisphere.",
    "key_connections": [
      "Wernicke's area (via arcuate fasciculus)",
      "M1 (orofacial region)"
    ],
    "famous_case_or_evidence": "Paul Broca's patient 'Tan' (Leborgne, 1861) could only utter the syllable 'tan' but understood language — the case that anchored expressive speech to the left frontal lobe. Caveat: MRI re-analysis of Leborgne's preserved brain (Dronkers et al., 2007) shows the lesion extended well beyond the area later named for Broca, into the insula and subcortical white matter, and the classic production/comprehension split is now treated as a teaching simplification rather than settled fact (Tremblay & Dick, 2016)."
  },
  {
    "id": "s1",
    "name": "Primary Somatosensory Cortex (S1)",
    "group": "parietal lobe",
    "one_liner": "Maps touch, pressure, temperature and body position onto a distorted 'body map' (the sensory homunculus).",
    "functions": [
      "Tactile and proprioceptive processing",
      "Somatotopic (homunculus) body mapping",
      "Fine touch discrimination (e.g., two-point discrimination)"
    ],
    "lesion_effects": "Causes contralateral loss of fine touch/proprioception and astereognosis (inability to identify objects by touch alone); pain/temperature sensation is more diffusely represented and less selectively lost.",
    "approx_location": "Postcentral gyrus, parietal lobe, immediately posterior to the central sulcus."
  },
  {
    "id": "m1",
    "name": "Primary Motor Cortex (M1)",
    "group": "frontal lobe",
    "one_liner": "Generates direct commands for voluntary, skilled movement via a somatotopic 'motor homunculus'.",
    "functions": [
      "Voluntary movement execution",
      "Somatotopic control of muscle groups",
      "A major source (with premotor and supplementary motor cortex) of the corticospinal tract"
    ],
    "lesion_effects": "Causes contralateral weakness or paralysis (hemiparesis/hemiplegia), classically from stroke; some recovery can occur over time via plasticity in surrounding cortex.",
    "approx_location": "Precentral gyrus, frontal lobe, immediately anterior to the central sulcus."
  },
  {
    "id": "ppc",
    "name": "Posterior Parietal Cortex (PPC)",
    "group": "parietal lobe",
    "one_liner": "Integrates senses to build a spatial map of body and world, guiding attention and reaching.",
    "functions": [
      "Spatial attention allocation",
      "Sensorimotor integration for reaching/grasping",
      "Multisensory representation of body-in-space"
    ],
    "lesion_effects": "Right PPC damage (especially right inferior parietal lobule/temporo-parietal junction) classically causes hemispatial neglect — inattention to the left side of space despite intact vision and no primary sensory loss.",
    "approx_location": "Posterior parietal lobe around the intraparietal sulcus; spatial-attention functions are often right-lateralized.",
    "famous_case_or_evidence": "Classic neglect patients fail to draw the left half of a clock or eat food from the left side of a plate (reviewed in Heilman & Mesulam's work on neglect)."
  },
  {
    "id": "dlpfc",
    "name": "Dorsolateral Prefrontal Cortex (dlPFC)",
    "group": "frontal lobe",
    "one_liner": "Executive-control hub: holds information in mind, plans, and flexibly switches strategies.",
    "functions": [
      "Working-memory maintenance and manipulation",
      "Cognitive flexibility and rule-switching",
      "Planning and inhibitory control"
    ],
    "lesion_effects": "Causes 'dysexecutive syndrome': poor planning, perseveration (e.g., impaired Wisconsin Card Sorting performance), and working-memory deficits, while personality and social behavior are relatively spared (contrast with vmPFC damage).",
    "approx_location": "Lateral surface of the frontal lobe, anterior to premotor cortex, bilateral."
  },
  {
    "id": "vmpfc_ofc",
    "name": "Ventromedial Prefrontal Cortex / Orbitofrontal Cortex (vmPFC/OFC)",
    "group": "frontal lobe",
    "one_liner": "Assigns emotional/subjective value to options and integrates 'gut feeling' into decisions.",
    "functions": [
      "Value-based decision making (a 'common currency' for comparing options)",
      "Integrating emotional/interoceptive signals into choice",
      "Regulating impulse control and social behavior"
    ],
    "lesion_effects": "Causes impaired real-life decision-making and personality change (impulsivity, poor foresight, blunted social/emotional judgment) despite normal IQ and intact working memory.",
    "approx_location": "Ventral and medial surface of the frontal lobe, above the orbits.",
    "key_connections": [
      "Amygdala",
      "Striatum",
      "ACC"
    ],
    "famous_case_or_evidence": "Phineas Gage (1848 railroad-spike injury to ventromedial/orbitofrontal cortex) is the textbook case of post-injury personality change — but treat it as illustrative, not documentation: the vivid 'foul-mouthed, unreliable drifter' story rests on one short secondhand account by Harlow and was progressively embellished by later textbooks (Macmillan, 2000). The better-evidenced modern cases are Damasio's 'somatic marker' patients (e.g., patient EVR), who show real-world decision deficits despite intact intellect."
  },
  {
    "id": "acc",
    "name": "Anterior Cingulate Cortex (ACC)",
    "group": "frontal lobe / limbic",
    "one_liner": "Monitors conflict and errors, and links effort and pain to motivation.",
    "functions": [
      "Conflict monitoring (e.g., Stroop interference)",
      "Error detection (error-related negativity, ~50-100ms post-error)",
      "Pain affect and effort-based motivation"
    ],
    "lesion_effects": "Bilateral damage can cause akinetic mutism — profound apathy and reduced spontaneous movement/speech despite preserved physical ability; partial damage can blunt error sensitivity and motivation.",
    "approx_location": "Medial frontal cortex, wrapping around the anterior corpus callosum."
  },
  {
    "id": "insula",
    "name": "Insula",
    "group": "frontal/temporal (folded cortex)",
    "one_liner": "The body's interoceptive hub — senses internal states and links them to emotion.",
    "functions": [
      "Interoception (internal bodily awareness, e.g., heartbeat)",
      "Disgust processing",
      "Integrating bodily state with subjective feeling and risk perception"
    ],
    "lesion_effects": "Linked to impaired disgust recognition/experience and altered risk-taking (reduced 'gut feeling' warning signals); insular stroke can also disrupt pain/temperature perception or cardiac regulation.",
    "approx_location": "Folded deep within the lateral sulcus, between the frontal, temporal and parietal opercula."
  },
  {
    "id": "corpus_callosum",
    "name": "Corpus Callosum",
    "group": "white matter / commissure",
    "one_liner": "The brain's largest fiber bridge, carrying information between the left and right hemispheres.",
    "functions": [
      "Interhemispheric transfer of sensory, motor and cognitive information",
      "Coordinating bilateral movements",
      "Unifying left- and right-hemisphere processing"
    ],
    "lesion_effects": "Surgical section ('split-brain') or damage causes disconnection syndromes — e.g., an object felt only by the left hand cannot be verbally named, because right-hemisphere information can't reach left-hemisphere language areas.",
    "approx_location": "Midline, beneath the cingulate cortex, arching between the two cerebral hemispheres.",
    "famous_case_or_evidence": "Roger Sperry and Michael Gazzaniga's split-brain patient studies (1960s-70s; Sperry received the 1981 Nobel Prize) revealed hemisphere-specific processing. Note: the callosum is not the only bridge — the much smaller anterior commissure also carries interhemispheric traffic (notably olfactory and some limbic/temporal information), which is part of why split-brain effects are partial rather than absolute. It is not modeled here."
  },
  {
    "id": "thalamus",
    "name": "Thalamus",
    "group": "diencephalon",
    "one_liner": "The brain's central relay and gatekeeper, routing almost all sensory (and some motor) signals to cortex.",
    "functions": [
      "Sensory relay to cortex (vision via LGN, hearing via MGN, touch via VPL/VPM)",
      "Motor relay from basal ganglia/cerebellum to M1",
      "Regulating arousal and consciousness via thalamocortical loops"
    ],
    "lesion_effects": "Can cause contralateral sensory loss and thalamic pain syndrome (Dejerine-Roussy syndrome — chronic burning pain); damage to intralaminar/central nuclei can impair arousal and consciousness, even causing coma.",
    "approx_location": "Paired egg-shaped structures deep in the brain's center, flanking the third ventricle."
  },
  {
    "id": "hypothalamus",
    "name": "Hypothalamus",
    "group": "diencephalon",
    "one_liner": "The body's homeostasis control center — regulating hunger, thirst, temperature, sleep drive and hormones.",
    "functions": [
      "Homeostatic regulation (hunger, thirst, temperature)",
      "Control of the pituitary/endocrine axis (HPA axis)",
      "Circadian rhythm coordination via the suprachiasmatic nucleus"
    ],
    "lesion_effects": "Damage to specific nuclei produces distinct syndromes: classic animal studies showed ventromedial hypothalamus lesions cause overeating/obesity and lateral hypothalamus lesions reduce feeding, and human hypothalamic damage (e.g., tumors) can cause obesity, temperature dysregulation, or disrupted sleep-wake cycles. Caveat: the tidy 'satiety centre vs. feeding centre' reading of those lesions is historical. Since leptin was identified in 1994 the field has moved to a distributed model in which the arcuate nucleus integrates circulating hormone signals (leptin, ghrelin) through POMC and AgRP neurons projecting across several hypothalamic nuclei and beyond.",
    "approx_location": "Below the thalamus, above the brainstem, surrounding the floor of the third ventricle."
  },
  {
    "id": "amygdala",
    "name": "Amygdala",
    "group": "limbic/subcortical (temporal lobe)",
    "one_liner": "Rapid threat/emotional-salience detector, central to fear learning and emotional memory tagging.",
    "functions": [
      "Fear conditioning and threat detection",
      "Emotional salience tagging of memories (modulates hippocampal consolidation)",
      "Reading emotional facial expressions"
    ],
    "lesion_effects": "Bilateral damage impairs recognition of fear in others' faces and reduces the subjective experience/physiological expression of fear, while other emotions remain more intact.",
    "approx_location": "Almond-shaped nucleus in the anterior medial temporal lobe, just anterior to the hippocampus.",
    "key_connections": [
      "Thalamus (fast subcortical route)",
      "Hippocampus",
      "vmPFC/OFC",
      "Hypothalamus"
    ],
    "famous_case_or_evidence": "Patient S.M. (Urbach-Wiethe disease causing bilateral amygdala calcification), studied by Adolphs & Tranel, showed impaired fear recognition and reduced real-world fear, though she could still be induced to panic via CO2 inhalation — showing the amygdala isn't the sole fear pathway."
  },
  {
    "id": "hippocampus",
    "name": "Hippocampus",
    "group": "limbic/subcortical (temporal lobe)",
    "one_liner": "Forms new explicit (episodic/declarative) memories and supports spatial navigation, then gradually 'teaches' them to cortex.",
    "functions": [
      "Encoding new episodic/declarative memories",
      "Spatial mapping (place cells, 'cognitive map')",
      "Pattern separation/completion for memory retrieval",
      "Sharp-wave ripple replay during sleep for consolidation"
    ],
    "lesion_effects": "Bilateral damage causes profound anterograde amnesia — inability to form new long-term declarative memories — while procedural/skill learning and short-term/working memory remain intact; old, well-consolidated memories are often relatively preserved (temporally graded retrograde amnesia).",
    "approx_location": "Curved structure in the medial temporal lobe, bilateral.",
    "famous_case_or_evidence": "Patient H.M. (Henry Molaison), after bilateral medial temporal lobectomy in 1953 for epilepsy, became severely amnesic — the foundational case (studied by Brenda Milner, later Suzanne Corkin) for localizing declarative memory formation to the hippocampus."
  },
  {
    "id": "striatum",
    "name": "Striatum (Caudate + Putamen)",
    "group": "basal ganglia",
    "one_liner": "Input hub of the basal ganglia; learns which actions/habits to select based on reward history.",
    "functions": [
      "Action-selection gating (balancing direct/indirect pathways)",
      "Habit and procedural learning",
      "Receiving dopaminergic input signaling reward prediction error"
    ],
    "lesion_effects": "Progressive degeneration (especially of the caudate) causes Huntington's disease — involuntary jerky movements (chorea), cognitive decline and personality change.",
    "approx_location": "Caudate (arcs around the thalamus) and putamen, deep subcortical, lateral to the thalamus."
  },
  {
    "id": "globus_pallidus",
    "name": "Globus Pallidus (GPe/GPi)",
    "group": "basal ganglia",
    "one_liner": "Output gate of the basal ganglia; its internal segment tonically inhibits the thalamus to suppress unwanted movement until released.",
    "functions": [
      "External segment (GPe) relays the indirect pathway to the subthalamic nucleus",
      "Internal segment (GPi) is a major basal-ganglia output nucleus inhibiting the thalamus",
      "Net gating of movement initiation"
    ],
    "lesion_effects": "GPi is a common deep-brain-stimulation target for Parkinson's disease and dystonia; pathological damage here can disturb movement initiation and cause abnormal postures, while therapeutic lesioning/stimulation can relieve rigidity.",
    "approx_location": "Medial to the putamen, deep subcortical, split into external (GPe) and internal (GPi) segments."
  },
  {
    "id": "stn",
    "name": "Subthalamic Nucleus (STN)",
    "group": "basal ganglia",
    "one_liner": "Small but powerful 'brake' in the indirect pathway that excites output nuclei to suppress competing movements.",
    "functions": [
      "Excitatory driver of GPi/SNr output (indirect and 'hyperdirect' pathways)",
      "Action-selection braking to prevent premature or competing movements",
      "Contributes to impulse control"
    ],
    "lesion_effects": "Damage causes hemiballismus — violent, involuntary flinging movements of the contralateral limbs; the STN is also the most common deep-brain-stimulation target for Parkinson's disease, where stimulation improves motor symptoms but can sometimes increase impulsivity.",
    "approx_location": "Small lens-shaped nucleus just below the thalamus, adjacent to the substantia nigra."
  },
  {
    "id": "nucleus_accumbens",
    "name": "Nucleus Accumbens",
    "group": "basal ganglia (ventral striatum) / limbic",
    "one_liner": "Core of the brain's reward circuit — translates motivation and pleasure signals into approach behavior.",
    "functions": [
      "Reward processing and reinforcement learning",
      "Translating motivational 'wanting' into action",
      "Integrating limbic input (amygdala/hippocampus) with dopaminergic (VTA) signals"
    ],
    "lesion_effects": "Central to addiction: drugs of abuse hijack this dopamine-driven circuit; animal lesion/inactivation studies show reduced motivation for both natural and drug rewards and reduced cue-triggered 'wanting' behavior.",
    "approx_location": "Ventral striatum, below the caudate/putamen junction."
  },
  {
    "id": "vta",
    "name": "Ventral Tegmental Area (VTA)",
    "group": "brainstem/midbrain",
    "one_liner": "Major dopamine source signaling reward prediction and driving motivation and reinforcement learning.",
    "functions": [
      "Dopaminergic reward-prediction-error signaling (phasic bursts for better-than-expected outcomes)",
      "Projecting to nucleus accumbens/PFC (mesolimbic and mesocortical pathways)",
      "Motivation and incentive salience"
    ],
    "lesion_effects": "Damage/dysfunction reduces motivation and reward-driven learning; VTA dysfunction is implicated in addiction and studied in depression (anhedonia), mostly via animal lesion/optogenetic work rather than clean human lesion cases.",
    "approx_location": "Ventral midbrain, near the substantia nigra."
  },
  {
    "id": "substantia_nigra",
    "name": "Substantia Nigra (pars compacta)",
    "group": "brainstem/midbrain (basal-ganglia associated)",
    "one_liner": "Dopamine source for the motor loop; its loss is the hallmark of Parkinson's disease.",
    "functions": [
      "Dopaminergic modulation of the striatum (nigrostriatal pathway)",
      "Facilitating the direct pathway / suppressing the indirect pathway to enable movement",
      "Reinforcement signaling for motor learning"
    ],
    "lesion_effects": "Progressive loss of these dopaminergic neurons causes Parkinson's disease: bradykinesia, rigidity, resting tremor and postural instability — motor symptoms typically appear late, after roughly 50-60% of the pigmented substantia nigra dopamine neurons are already lost. A separate and higher figure, often quoted around 70-80%, refers to depletion of dopamine at the striatal terminals — two different measurements that are easily conflated into one range.",
    "approx_location": "Midbrain, dorsal to the cerebral peduncles; pars compacta is the pigmented, dopamine-producing part."
  },
  {
    "id": "cerebellum",
    "name": "Cerebellum",
    "group": "cerebellum",
    "one_liner": "Fine-tunes movement timing and accuracy, and calibrates motor learning through error correction.",
    "functions": [
      "Motor coordination and timing",
      "Error-based motor learning/calibration using sensory feedback",
      "Contributes to some cognitive and timing tasks"
    ],
    "lesion_effects": "Causes ataxia (uncoordinated movement), dysmetria (over/undershooting targets), intention tremor, and impaired motor adaptation (e.g., poor adjustment to prism-shifted vision or novel force fields), while raw muscle strength remains normal.",
    "approx_location": "Posterior fossa, below the occipital lobe, dorsal to the brainstem."
  },
  {
    "id": "locus_coeruleus",
    "name": "Locus Coeruleus",
    "group": "brainstem (pons)",
    "one_liner": "The brain's primary noradrenaline source; drives arousal, vigilance and response to novelty/stress.",
    "functions": [
      "Noradrenergic modulation of arousal and alertness",
      "Phasic firing tied to attention/orienting toward salient or novel stimuli",
      "Modulating cortical signal-to-noise ratio during stress"
    ],
    "lesion_effects": "Locus coeruleus neurons are among the earliest to degenerate in both Alzheimer's and Parkinson's disease, often before hallmark pathology appears in cortex/substantia nigra; loss is linked to disrupted arousal, attention and sleep regulation.",
    "approx_location": "Small nucleus in the dorsal pons, near the fourth ventricle, bilateral."
  },
  {
    "id": "raphe_nuclei",
    "name": "Raphe Nuclei",
    "group": "brainstem (midline, midbrain to medulla)",
    "one_liner": "Chain of midline nuclei and the brain's main serotonin source, shaping mood, sleep and impulse control.",
    "functions": [
      "Serotonergic modulation of mood and anxiety",
      "Regulating sleep-wake architecture (contributes to REM sleep regulation)",
      "Influencing impulsivity and pain modulation"
    ],
    "lesion_effects": "Dysfunction is strongly associated with depression and anxiety (the target of SSRIs, which block serotonin reuptake); animal lesion studies show disrupted sleep architecture and increased impulsive/aggressive behavior, though clean human lesion evidence is rare since damage is seldom isolated to the raphe alone.",
    "approx_location": "Midline of the brainstem, spanning midbrain to medulla (e.g., the dorsal raphe nucleus in the midbrain)."
  }
];
