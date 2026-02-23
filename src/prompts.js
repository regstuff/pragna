// ============================================================
// PRAGNA — Prompt Templates
// All 8-step prompts with placeholder replacement
// ============================================================

const SYSTEM_STRUCTURING = `You must structure your entire response using strict Markdown headers, with each major section being Level 3 (###). Keep each section under 1200 words.`;

// Step 2: Initial Hypothesis (Fan-out)
export function getStep2Prompt(seed) {
    return `Act as an expert researcher who will be given one or more quests that you must investigate. Your job is to push the frontiers of various fields and search for novel and previously ignored hypothesis and correlations.

Please think freely and without prejudice. You need not limit your hypothesis to just one field of scientific study. You can create correlations and observations that are interdisciplinary. I understand that many of your suggestions may not yet be proven by scientific experimentation, but the point of this brainstorming is to come up with candidates for exploration of rigorous scientific experimentation.

Please give me your entire chain of thought and thinking processes and not just a final hypothesis.

The Task: ${seed}

I am more interested in explanations and hypothesis that focus on physiological effects and not so much on possible psychological or influences on the human psyche.

Please analyse and think deeply and give me all possible hypothesis you can think of.

${SYSTEM_STRUCTURING}`;
}

// Step 3: Synthesis of all Hypotheses
export function getStep3Prompt(seed, step2Outputs) {
    const joined = step2Outputs.map((o, i) => `--- Researcher ${i + 1} ---\n${o}`).join('\n\n');
    return `You are an expert interdisciplinary researcher, heading a group of expert researchers who are individually investigating and coming up with hypotheses that will help to push the frontiers of various fields and search for novel and previously ignored hypothesis and correlations.

The Task Given To Them: ${seed}

Below are the list of all their hypotheses. Your task is to collate and aggregate all their hypotheses into one single list of hypotheses. You must remove all overlapping, redundant pieces of information that appear in multiple hypotheses. You should not make any judgements about the validity of the hypotheses. I am aware that these may not be based on proven scientific information. I only want you to combine and create a single list of hypotheses. If hypotheses are similar across multiple researchers, but if there are differing pieces of information, you must collate all that information under the hypothesis in your final list. Remember that your collated list will be the only document of all these hypotheses going forward, so capture all information. The focus is on comprehensive capture of all information, including scientific details, nomenclature etc. This is NOT a summary. This is a comprehensive collation of all information from the individual reports.

You need not mention the names of individual researchers or refer to them in any other way. You must simply create an anonymized single list of hypotheses.

${SYSTEM_STRUCTURING}

Here are all the hypotheses of the various researchers:

${joined}`;
}

// Step 4: Critique (Fan-out)
export function getStep4Prompt(seed, step3Output) {
    return `Role: You are a Senior Principal Investigator and an expert interdisciplinary researcher. You lead a think-tank of scientists who investigate novel, previously ignored correlations to push the frontiers of various scientific fields.

The Task Given To The Think Tank: ${seed}

Your Task: Conduct a rigorous, comprehensive peer-to-peer review of the hypotheses provided below. Your goal is to help your researchers refine, correct, or drop their hypotheses based on scientific rigor.

Evaluation Constraints:
- No Ultimate Validity Judgments: Do not dismiss a hypothesis simply because it lacks current empirical proof. Acknowledge that these are exploratory.
- Focus on Reasoning: Evaluate the internal logic, chain of causality, and theoretical plausibility.
- Scientific Accuracy: Scrutinize the use of scientific nomenclature, biological/ecological mechanisms, and foundational assumptions.
- Interdisciplinary Lens: Evaluate these through relevant lenses across scientific fields.

Output Format: For each hypothesis provided, structure your critique as follows:
- Logical Consistency: (Is the chain of reasoning sound? Are there leaps in logic?)
- Underlying Assumptions: (What must be true for this hypothesis to hold? Are these assumptions plausible based on historical/traditional contexts?)
- Scientific Terminology & Mechanisms: (Critique the use of scientific concepts. Are the terms used correctly? Is the proposed mechanism scientifically sound in theory?)
- Constructive Feedback: (Specific recommendations on how the researcher can improve, tighten, or pivot the hypothesis to make it stronger).

${SYSTEM_STRUCTURING}

Here are the hypotheses for your review:

${step3Output}`;
}

// Step 5: Synthesis of Assessments
export function getStep5Prompt(seed, step4Outputs) {
    const joined = step4Outputs.map((o, i) => `--- Reviewer ${i + 1} ---\n${o}`).join('\n\n');
    return `You are an expert interdisciplinary researcher, heading a group of expert researchers who have individually peer-reviewed and assessed a set of hypotheses that focus on pushing the frontiers of various fields and search for novel and previously ignored hypothesis and correlations.

The Task Given To Them: ${seed}

Below are the list of all their assessments and critiques. Your task is to collate and aggregate all their feedback into one single document of assessments. You must remove all overlapping, redundant pieces of information that appear in multiple assessments. You should not make any judgements beyond what the assessors have provided. You must collate all information comprehensively, including specific scientific details, corrections, and feedback from all assessors. Remember that your collated list will be the only document of all these assessments going forward, so capture all information.

You need not mention the names of individual reviewers or refer to them in any other way. You must simply create an anonymized single set of critiques.

${SYSTEM_STRUCTURING}

Here are all the assessments of the various reviewers:

${joined}`;
}

// Step 6: Revision (Fan-out)
export function getStep6Prompt(seed, step3Output, step5Output) {
    return `Role: You are a Senior Principal Investigator and an expert interdisciplinary researcher leading an interdisciplinary research think tank who are investigating and coming up with hypotheses that will help to push the frontiers of various fields and search for novel and previously ignored hypothesis and correlations.

The Task Given To The Think Tank: ${seed}

Context: The researchers have each come up with various hypotheses, which have been collated into a single list below. Researchers have also evaluated and peer-reviewed each others' hypotheses and given detailed feedback. These have also been collated into a single document of feedback.

Your Task: Review the hypotheses and the feedback provided by the researchers. Modify, expand, or rewrite each hypothesis to maximize its scientific rigor, interdisciplinary depth, and logical soundness, based on the feedback.

You are also required to vote on each hypothesis based on the credibility of the hypothesis. You must provide a number from 1 to 5, where 1 is very low confidence and 5 is very high confidence in its credibility.

**Response Format:** Here is an example of how you must format your response in markdown:

### Hypothesis 1
**Final Hypothesis:** [Write the enhanced, finalized hypothesis here, ensuring it is framed as a rigorous scientific/academic proposition.]
**Changes Made:** [Summarize exactly what you changed from the original hypothesis based on the researchers' feedback and your own interdisciplinary expertise.]
**Final Score:** [1 to 5]

${SYSTEM_STRUCTURING}

Original Hypotheses:

${step3Output}

Peer-Review Feedback:

${step5Output}`;
}

// Step 7: Final Consolidation & Scoring
export function getStep7Prompt(seed, step6Outputs) {
    const joined = step6Outputs.map((o, i) => `--- Researcher ${i + 1} ---\n${o}`).join('\n\n');
    return `Role: You are a Senior Principal Investigator and an expert interdisciplinary researcher leading an interdisciplinary research think tank.

The Task Given To The Think Tank: ${seed}

Context: The researchers have each come up with hypotheses and scored them based on credibility (1-5). Multiple researchers have independently revised each hypothesis and provided their scores.

Your Task: Review the hypotheses and the scores provided by the researchers. Modify, expand, or rewrite each hypothesis to maximize its scientific rigor, interdisciplinary depth, and logical soundness, incorporating all relevant points by different researchers. You need not mention which researcher said what. Just take the final call and integrate and create final hypotheses.

You are also required to give the total score from the vote on each hypothesis by each of the researchers. Add the scores from each researcher to get the total score for each hypothesis.

You must also reorder the hypotheses based on the total score, so that the highest scoring hypotheses are at the top.

**Response Format:**
### Hypothesis 1
**Final Hypothesis:** [Write the enhanced, finalized hypothesis here, ensuring it is framed as a rigorous scientific/academic proposition.]
**Final Score:** Score: [4 to 25]

${SYSTEM_STRUCTURING}

Final Hypotheses & Scores From Think Tank:

${joined}`;
}

// Step 8: Simplify for Layperson
export function getStep8Prompt(step7Output) {
    return `Rewrite this document so that it is accessible to a well-read, well-educated, English speaking lay person in India. You can assume that the person has some background in science but is not a scientist. You can retain scientific terminology and concepts as necessary in order to give the person a full perspective of the content, but you should explain the terminology or concept in language that such a person will understand. Do not eliminate any content solely because it is too technical. Attempt to explain such content in more accessible language. Retain the structure of the document as is.

${SYSTEM_STRUCTURING}

Document to rewrite:

${step7Output}`;
}

// ======================== STEP METADATA ========================

export const STEP_NAMES = [
    'Initialize',
    'Hypothesize',
    'Consolidate',
    'Critique',
    'Assess',
    'Revise',
    'Final Judge',
    'Simplify',
];

export const FAN_OUT_STEPS = [2, 4, 6];
export const CONSOLIDATION_STEPS = [3, 5, 7];
export const SINGLE_STEPS = [1, 8];
