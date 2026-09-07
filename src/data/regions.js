// 28 brain regions used by all modes. Fields: id, name, group, one_liner, functions[], key_connections[], lesion_effects, famous_case_or_evidence, approx_location.
// Source: research/research.json (mechanically transcribed 2026-09-06), then hand-edited.
export const REGIONS = [
  {
    "id": "v1",
    "name": "Primary Visual Cortex (V1)",
    "group": "occipital lobe",
    "one_liner": "First cortical stop for vision; maps edges, contrast and orientation.",
    "functions": [
      "Retinotopic mapping of the visual field",
      "Edge, contrast and orientation detection",
      "Feeds the ventral and dorsal visual streams"
    ],
    "lesion_effects": "Damage causes a scotoma, a blind patch in the matching part of the visual field. Bilateral destruction causes cortical blindness, sometimes with 'blindsight': responding without awareness.",
    "approx_location": "Posterior pole of the occipital lobe, along the calcarine sulcus, bilateral.",
    "key_connections": [
      "Thalamus (LGN)",
      "V4",
      "MT/V5",
      "Posterior parietal cortex"
    ],
    "famous_case_or_evidence": "Blindsight patients (e.g., D.B., studied by Weiskrantz) respond to stimuli in a subjectively blind field: vision without V1-based awareness."
  },
  {
    "id": "v4",
    "name": "Visual Area V4",
    "group": "occipito-temporal (ventral stream)",
    "one_liner": "Ventral-stream specialist for colour constancy and intermediate shape.",
    "functions": [
      "Colour processing and colour constancy",
      "Curvature and intermediate shape coding",
      "Feeds object- and face-recognition areas"
    ],
    "lesion_effects": "Damage can cause cerebral achromatopsia: colour perception is lost (the world looks grey) while acuity stays intact.",
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
    "one_liner": "Dorsal-stream motion specialist: direction and speed of moving things.",
    "functions": [
      "Motion direction and speed detection",
      "Optic-flow processing for self-motion",
      "Supports smooth-pursuit eye movements"
    ],
    "lesion_effects": "Bilateral damage produces akinetopsia, 'motion blindness': the world looks like a series of static snapshots.",
    "approx_location": "Posterior temporal cortex at the temporo-parieto-occipital junction, bilateral.",
    "famous_case_or_evidence": "Patient L.M. (Zihl et al., 1983), with bilateral MT damage, saw poured liquid frozen in successive positions rather than flowing."
  },
  {
    "id": "ffa",
    "name": "Fusiform Face Area (FFA)",
    "group": "temporal lobe (ventral)",
    "one_liner": "Fast, holistic recognition of individual faces, and next door of word forms.",
    "functions": [
      "Face detection and holistic structural encoding",
      "Telling individual identities apart",
      "Contributes strongly to the face-selective N170"
    ],
    "lesion_effects": "Damage causes prosopagnosia, face blindness: familiar faces cannot be recognised by sight, though recognising people by voice can stay intact.",
    "approx_location": "Lateral fusiform gyrus, ventral temporal lobe, with a right-hemisphere bias.",
    "famous_case_or_evidence": "Simultaneous fMRI-EEG (Gao et al., 2019) makes the fusiform gyrus/FFA a primary, though not the sole, contributor to the N170; the occipital face area and superior temporal sulcus are also implicated."
  },
  {
    "id": "a1",
    "name": "Primary Auditory Cortex (A1)",
    "group": "temporal lobe",
    "one_liner": "First cortical relay for sound, mapping frequency tonotopically.",
    "functions": [
      "Tonotopic mapping of sound frequency",
      "Basic pitch, loudness and timing coding",
      "Feeds language and auditory what/where streams"
    ],
    "lesion_effects": "Unilateral damage causes only mild hearing loss on the opposite side, because subcortical relays are bilateral. Bilateral destruction can cause cortical deafness.",
    "approx_location": "Superior temporal gyrus / Heschl's gyrus, bilateral."
  },
  {
    "id": "wernicke",
    "name": "Wernicke's Area",
    "group": "temporal lobe (language-dominant hemisphere)",
    "one_liner": "Supports language comprehension: turning heard or read words into meaning.",
    "functions": [
      "Auditory and lexical comprehension",
      "Semantic access for words and sentences",
      "Monitoring one's own speech for sense"
    ],
    "lesion_effects": "Causes Wernicke's (fluent) aphasia: fluent, grammatical-sounding speech that slides into nonsense words, with poor comprehension and little awareness of the errors.",
    "approx_location": "Posterior superior temporal gyrus, left hemisphere in roughly 95-99% of right-handers.",
    "key_connections": [
      "Broca's area (via arcuate fasciculus)",
      "A1"
    ],
    "famous_case_or_evidence": "Wernicke's 1874 patients spoke fluently but incoherently, with poor comprehension. Caveat: the Broca/Wernicke double dissociation is a teaching simplification — language is a distributed fronto-temporo-parietal network (Tremblay & Dick, 2016)."
  },
  {
    "id": "broca",
    "name": "Broca's Area",
    "group": "frontal lobe (language-dominant hemisphere)",
    "one_liner": "Supports speech production and building grammatical sentences.",
    "functions": [
      "Articulatory planning for speech",
      "Syntactic and grammatical processing",
      "Coordinating language output with motor cortex"
    ],
    "lesion_effects": "Causes Broca's (non-fluent) aphasia: slow, effortful, telegraphic speech, with comprehension largely preserved and the patient usually aware of it.",
    "approx_location": "Posterior inferior frontal gyrus, typically left hemisphere.",
    "key_connections": [
      "Wernicke's area (via arcuate fasciculus)",
      "M1 (orofacial region)"
    ],
    "famous_case_or_evidence": "Broca's patient 'Tan' (Leborgne, 1861) said one syllable yet understood language. Caveat: his lesion went far beyond the area named for him, and the production/comprehension split is now a teaching simplification (Dronkers et al., 2007; Tremblay & Dick, 2016)."
  },
  {
    "id": "s1",
    "name": "Primary Somatosensory Cortex (S1)",
    "group": "parietal lobe",
    "one_liner": "Maps touch, temperature and body position onto a distorted body map.",
    "functions": [
      "Tactile and proprioceptive processing",
      "Somatotopic body mapping (the homunculus)",
      "Fine touch discrimination"
    ],
    "lesion_effects": "Causes loss of fine touch and proprioception on the opposite side, plus astereognosis: objects cannot be identified by touch alone. Pain and temperature are more diffusely represented.",
    "approx_location": "Postcentral gyrus, parietal lobe, immediately posterior to the central sulcus."
  },
  {
    "id": "m1",
    "name": "Primary Motor Cortex (M1)",
    "group": "frontal lobe",
    "one_liner": "Issues the direct commands for voluntary movement, via a motor homunculus.",
    "functions": [
      "Voluntary movement execution",
      "Somatotopic control of muscle groups",
      "Major corticospinal source (with premotor and SMA)"
    ],
    "lesion_effects": "Causes weakness or paralysis on the opposite side, classically after a stroke. Some recovery can follow through plasticity in the surrounding cortex.",
    "approx_location": "Precentral gyrus, frontal lobe, immediately anterior to the central sulcus."
  },
  {
    "id": "ppc",
    "name": "Posterior Parietal Cortex (PPC)",
    "group": "parietal lobe",
    "one_liner": "Builds a spatial map of body and world, guiding attention and reaching.",
    "functions": [
      "Spatial attention allocation",
      "Sensorimotor integration for reaching and grasping",
      "Multisensory map of the body in space"
    ],
    "lesion_effects": "Right PPC damage classically causes hemispatial neglect: the left side of space is ignored despite intact vision and no primary sensory loss.",
    "approx_location": "Posterior parietal lobe around the intraparietal sulcus; spatial-attention functions are often right-lateralized.",
    "famous_case_or_evidence": "Neglect patients famously leave the left half of a drawn clock blank and eat only from the right of the plate."
  },
  {
    "id": "dlpfc",
    "name": "Dorsolateral Prefrontal Cortex (dlPFC)",
    "group": "frontal lobe",
    "one_liner": "Executive-control hub: holds things in mind, plans, and switches strategy.",
    "functions": [
      "Working-memory maintenance and manipulation",
      "Cognitive flexibility and rule-switching",
      "Planning and inhibitory control"
    ],
    "lesion_effects": "Causes a dysexecutive syndrome: poor planning, perseveration and working-memory deficits. Personality and social behaviour are relatively spared, unlike after vmPFC damage.",
    "approx_location": "Lateral surface of the frontal lobe, anterior to premotor cortex, bilateral."
  },
  {
    "id": "vmpfc_ofc",
    "name": "Ventromedial Prefrontal Cortex / Orbitofrontal Cortex (vmPFC/OFC)",
    "group": "frontal lobe",
    "one_liner": "Puts a subjective value on options and folds gut feeling into decisions.",
    "functions": [
      "Value-based decision making",
      "Bringing emotional signals into choice",
      "Impulse control and social behaviour"
    ],
    "lesion_effects": "Causes impaired real-life decision-making and personality change — impulsivity, poor foresight, blunted social judgement — despite normal IQ.",
    "approx_location": "Ventral and medial surface of the frontal lobe, above the orbits.",
    "key_connections": [
      "Amygdala",
      "Striatum",
      "ACC"
    ],
    "famous_case_or_evidence": "Phineas Gage (1848) is the textbook case, but it is illustrative only: the vivid 'foul-mouthed drifter' story rests on one secondhand report and grew in the retelling (Macmillan, 2000). Damasio's patient EVR is the better-evidenced modern case."
  },
  {
    "id": "acc",
    "name": "Anterior Cingulate Cortex (ACC)",
    "group": "frontal lobe / limbic",
    "one_liner": "Monitors conflict and errors, and ties effort and pain to motivation.",
    "functions": [
      "Conflict monitoring, as in the Stroop task",
      "Error detection (error-related negativity)",
      "Pain affect and effort-based motivation"
    ],
    "lesion_effects": "Bilateral damage can cause akinetic mutism: profound apathy with little spontaneous movement or speech, despite preserved physical ability. Partial damage can blunt error sensitivity and motivation.",
    "approx_location": "Medial frontal cortex, wrapping around the anterior corpus callosum."
  },
  {
    "id": "insula",
    "name": "Insula",
    "group": "frontal/temporal (folded cortex)",
    "one_liner": "The body's interoceptive hub: senses internal states and links them to feeling.",
    "functions": [
      "Interoception, such as sensing your heartbeat",
      "Disgust processing",
      "Linking bodily state to feeling and risk"
    ],
    "lesion_effects": "Linked to impaired disgust recognition and altered risk-taking as the 'gut feeling' warning weakens. Insular stroke can also disrupt pain and temperature perception or cardiac regulation.",
    "approx_location": "Folded deep within the lateral sulcus, between the frontal, temporal and parietal opercula."
  },
  {
    "id": "corpus_callosum",
    "name": "Corpus Callosum",
    "group": "white matter / commissure",
    "one_liner": "The brain's largest fibre bridge, carrying traffic between the hemispheres.",
    "functions": [
      "Interhemispheric transfer of sensory and cognitive information",
      "Coordinating bilateral movements",
      "Unifying left- and right-hemisphere processing"
    ],
    "lesion_effects": "Surgical section ('split-brain') or damage causes disconnection syndromes: an object felt only by the left hand cannot be named, because the information never reaches left-hemisphere language areas.",
    "approx_location": "Midline, beneath the cingulate cortex, arching between the two cerebral hemispheres.",
    "famous_case_or_evidence": "Sperry and Gazzaniga's split-brain studies (1960s-70s) revealed hemisphere-specific processing. Note: the smaller anterior commissure also carries interhemispheric traffic, part of why split-brain effects are partial; it is not modelled here."
  },
  {
    "id": "thalamus",
    "name": "Thalamus",
    "group": "diencephalon",
    "one_liner": "Central relay and gatekeeper, routing almost all sensory signals to cortex.",
    "functions": [
      "Sensory relay to cortex (LGN, MGN, VPL)",
      "Motor relay to primary motor cortex",
      "Regulating arousal via thalamocortical loops"
    ],
    "lesion_effects": "Can cause sensory loss on the opposite side and thalamic pain syndrome, a chronic burning pain (Dejerine-Roussy). Damage to intralaminar/central nuclei can impair arousal and consciousness, even causing coma.",
    "approx_location": "Paired egg-shaped structures deep in the brain's center, flanking the third ventricle."
  },
  {
    "id": "hypothalamus",
    "name": "Hypothalamus",
    "group": "diencephalon",
    "one_liner": "Homeostasis control centre: hunger, thirst, temperature, sleep and hormones.",
    "functions": [
      "Homeostatic regulation of hunger and temperature",
      "Control of the pituitary and HPA axis",
      "Circadian timing via the suprachiasmatic nucleus"
    ],
    "lesion_effects": "Classic animal lesions showed ventromedial damage causing overeating and lateral damage reducing feeding; human hypothalamic damage can cause obesity, temperature dysregulation or disrupted sleep. Caveat: that tidy 'satiety vs feeding centre' reading is historical, and since leptin (1994) appetite is described as a distributed hormonal network.",
    "approx_location": "Below the thalamus, above the brainstem, surrounding the floor of the third ventricle."
  },
  {
    "id": "amygdala",
    "name": "Amygdala",
    "group": "limbic/subcortical (temporal lobe)",
    "one_liner": "Rapid threat and salience detector, central to fear learning.",
    "functions": [
      "Fear conditioning and threat detection",
      "Tagging memories with emotional salience",
      "Reading emotional facial expressions"
    ],
    "lesion_effects": "Bilateral damage impairs recognising fear in other people's faces and blunts both the experience and the bodily expression of fear, while other emotions stay more intact.",
    "approx_location": "Almond-shaped nucleus in the anterior medial temporal lobe, just anterior to the hippocampus.",
    "key_connections": [
      "Thalamus (fast subcortical route)",
      "Hippocampus",
      "vmPFC/OFC",
      "Hypothalamus"
    ],
    "famous_case_or_evidence": "Patient S.M. (bilateral amygdala calcification from Urbach-Wiethe disease, studied by Adolphs & Tranel) showed impaired fear recognition and little real-world fear. She could still be made to panic by inhaling CO2, so it is not the sole fear pathway."
  },
  {
    "id": "hippocampus",
    "name": "Hippocampus",
    "group": "limbic/subcortical (temporal lobe)",
    "one_liner": "Forms new explicit memories and maps space, then teaches them to cortex.",
    "functions": [
      "Encoding new episodic and declarative memories",
      "Spatial mapping with place cells",
      "Pattern completion and sleep replay"
    ],
    "lesion_effects": "Bilateral damage causes profound anterograde amnesia: no new long-term declarative memories, while skill learning and working memory stay intact. Old, well-consolidated memories are often relatively preserved.",
    "approx_location": "Curved structure in the medial temporal lobe, bilateral.",
    "famous_case_or_evidence": "Patient H.M. became severely amnesic after a bilateral medial temporal lobectomy in 1953: the foundational case for localising declarative memory to the hippocampus."
  },
  {
    "id": "striatum",
    "name": "Striatum (Caudate + Putamen)",
    "group": "basal ganglia",
    "one_liner": "Input hub of the basal ganglia; learns which actions to pick from reward.",
    "functions": [
      "Action-selection gating",
      "Habit and procedural learning",
      "Receives dopamine reward-prediction-error signals"
    ],
    "lesion_effects": "Progressive degeneration, especially of the caudate, causes Huntington's disease: involuntary jerky movements (chorea), cognitive decline and personality change.",
    "approx_location": "Caudate (arcs around the thalamus) and putamen, deep subcortical, lateral to the thalamus."
  },
  {
    "id": "globus_pallidus",
    "name": "Globus Pallidus (GPe/GPi)",
    "group": "basal ganglia",
    "one_liner": "Output gate of the basal ganglia, holding movement back until released.",
    "functions": [
      "GPe relays the indirect pathway onward",
      "GPi inhibits the thalamus as output",
      "Net gating of movement initiation"
    ],
    "lesion_effects": "GPi is a common deep-brain-stimulation target for Parkinson's disease and dystonia. Damage here can disturb movement initiation and cause abnormal postures, while therapeutic stimulation can relieve rigidity.",
    "approx_location": "Medial to the putamen, split into external (GPe) and internal (GPi) segments."
  },
  {
    "id": "stn",
    "name": "Subthalamic Nucleus (STN)",
    "group": "basal ganglia",
    "one_liner": "Small but powerful brake that suppresses competing movements.",
    "functions": [
      "Excitatory driver of basal-ganglia output nuclei",
      "Braking premature or competing actions",
      "Contributes to impulse control"
    ],
    "lesion_effects": "Damage causes hemiballismus: violent involuntary flinging of the opposite limbs. It is also the commonest deep-brain-stimulation target in Parkinson's, where stimulation helps movement but can raise impulsivity.",
    "approx_location": "Small lens-shaped nucleus just below the thalamus, adjacent to the substantia nigra."
  },
  {
    "id": "nucleus_accumbens",
    "name": "Nucleus Accumbens",
    "group": "basal ganglia (ventral striatum) / limbic",
    "one_liner": "Core of the reward circuit, turning motivation into approach behaviour.",
    "functions": [
      "Reward processing and reinforcement learning",
      "Turning 'wanting' into action",
      "Integrating limbic and dopaminergic input"
    ],
    "lesion_effects": "Central to addiction: drugs of abuse hijack this dopamine-driven circuit. Animal lesion and inactivation studies show reduced motivation for natural and drug rewards alike.",
    "approx_location": "Ventral striatum, below the caudate/putamen junction."
  },
  {
    "id": "vta",
    "name": "Ventral Tegmental Area (VTA)",
    "group": "brainstem/midbrain",
    "one_liner": "Major dopamine source signalling reward prediction and driving motivation.",
    "functions": [
      "Dopaminergic reward-prediction-error signalling",
      "Projecting to nucleus accumbens and prefrontal cortex",
      "Motivation and incentive salience"
    ],
    "lesion_effects": "Dysfunction reduces motivation and reward-driven learning, and is implicated in addiction and in anhedonia. The evidence is mostly animal work, not clean human lesion cases.",
    "approx_location": "Ventral midbrain, near the substantia nigra."
  },
  {
    "id": "substantia_nigra",
    "name": "Substantia Nigra (pars compacta)",
    "group": "brainstem/midbrain (basal-ganglia associated)",
    "one_liner": "Dopamine source for the motor loop; its loss is the hallmark of Parkinson's.",
    "functions": [
      "Dopaminergic modulation of the striatum",
      "Enabling movement via the direct pathway",
      "Reinforcement signalling for motor learning"
    ],
    "lesion_effects": "Losing these dopamine neurons causes Parkinson's disease (bradykinesia, rigidity, resting tremor), with symptoms appearing only after roughly 50-60% are gone. The often-quoted 70-80% figure refers to dopamine depletion at the striatal terminals, a different measurement.",
    "approx_location": "Midbrain; pars compacta is the pigmented, dopamine-producing part."
  },
  {
    "id": "cerebellum",
    "name": "Cerebellum",
    "group": "cerebellum",
    "one_liner": "Fine-tunes movement timing and accuracy, and calibrates motor learning.",
    "functions": [
      "Motor coordination and timing",
      "Error-based motor learning from feedback",
      "Contributes to some cognitive and timing tasks"
    ],
    "lesion_effects": "Causes ataxia, dysmetria and intention tremor, plus poor motor adaptation to prism-shifted vision or novel force fields. Raw muscle strength stays normal.",
    "approx_location": "Posterior fossa, below the occipital lobe, dorsal to the brainstem."
  },
  {
    "id": "locus_coeruleus",
    "name": "Locus Coeruleus",
    "group": "brainstem (pons)",
    "one_liner": "The brain's main noradrenaline source; drives arousal and vigilance.",
    "functions": [
      "Noradrenergic modulation of arousal and alertness",
      "Phasic firing on salient or novel events",
      "Modulating cortical signal-to-noise ratio"
    ],
    "lesion_effects": "Its neurons are among the earliest to degenerate in Alzheimer's and Parkinson's, often before cortex shows hallmark pathology. Loss is linked to disrupted arousal, attention and sleep.",
    "approx_location": "Small nucleus in the dorsal pons, near the fourth ventricle, bilateral."
  },
  {
    "id": "raphe_nuclei",
    "name": "Raphe Nuclei",
    "group": "brainstem (midline, midbrain to medulla)",
    "one_liner": "Midline brainstem chain and the brain's main serotonin source.",
    "functions": [
      "Serotonergic modulation of mood and anxiety",
      "Regulating sleep-wake architecture",
      "Influencing impulsivity and pain"
    ],
    "lesion_effects": "Dysfunction is strongly associated with depression and anxiety, and is the target of SSRIs. Clean human lesion evidence is rare, since damage is seldom isolated to the raphe alone.",
    "approx_location": "Midline of the brainstem, from midbrain to medulla."
  }
];
