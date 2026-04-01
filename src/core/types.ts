export type ProjectType = "greenfield" | "brownfield";
export type FeatureDimensionName = "goal" | "constraints" | "criteria" | "context";
export type ArchitectDimensionName =
  | "domain_scope"
  | "work_units"
  | "team_topology"
  | "verification_strategy"
  | "user_operating_style";
export type DimensionName = FeatureDimensionName;
export type InterviewStatus = "in_progress" | "completed";
export type LoopStatus = "pending" | "running" | "blocked" | "completed" | "reopen_required";
export type Verdict = "APPROVE" | "REJECT";
export type InterviewLane = "feature" | "architect";
export type RejectionCategory =
  | "implementation_gap"
  | "requirement_ambiguity"
  | "harness_design_gap";

export interface DimensionAssessment {
  score: number;
  justification: string;
  gap: string;
}

export interface AmbiguityBreakdown {
  goal: DimensionAssessment;
  constraints: DimensionAssessment;
  criteria: DimensionAssessment;
  context?: DimensionAssessment;
}

export interface ArchitectAmbiguityBreakdown {
  domain_scope: DimensionAssessment;
  work_units: DimensionAssessment;
  team_topology: DimensionAssessment;
  verification_strategy: DimensionAssessment;
  user_operating_style: DimensionAssessment;
}

export interface BrownfieldContext {
  projectType: ProjectType;
  scannedAt: string;
  summary: string;
  signals: string[];
  files: string[];
}

export interface HarnessSnapshot {
  slug: string;
  harnessGoal: string;
  workUnits: string[];
  teamTopology: string[];
  verificationStrategy: string[];
  verificationEmphasis: string[];
  agentNames: string[];
  skillNames: string[];
  sourceSeedId: string;
  sourceBlueprintId: string;
  activatedAt: string;
}

export interface RepoProfile {
  profileId: string;
  scannedAt: string;
  summary: string;
  stack: string[];
  packageManager: string;
  scripts: Record<string, string>;
  topLevelDirectories: string[];
  likelyBoundaries: string[];
  conventions: string[];
  riskSurfaces: string[];
  relevantFiles: string[];
}

export interface AdaptiveInterviewRound<TDimension extends string, TBreakdown> {
  roundNumber: number;
  targeting: TDimension;
  rationale: string;
  question: string;
  answer: string;
  askedAt: string;
  answeredAt: string;
  ambiguity: number;
  breakdown: TBreakdown;
  weakestDimension: TDimension;
  weakestDimensionRationale: string;
}

export interface InterviewRound
  extends AdaptiveInterviewRound<FeatureDimensionName, AmbiguityBreakdown> {}

export interface ArchitectInterviewRound
  extends AdaptiveInterviewRound<ArchitectDimensionName, ArchitectAmbiguityBreakdown> {}

export interface BaseAdaptiveInterviewState<TLane extends InterviewLane, TDimension extends string, TRound> {
  interviewId: string;
  lane: TLane;
  status: InterviewStatus;
  initialIdea: string;
  threshold: number;
  currentAmbiguity: number;
  dimensions: TDimension[];
  weights: Partial<Record<TDimension, number>>;
  rounds: TRound[];
  createdAt: string;
  updatedAt: string;
}

export interface InterviewState
  extends BaseAdaptiveInterviewState<"feature", FeatureDimensionName, InterviewRound> {
  projectType: ProjectType;
  brownfieldContext?: BrownfieldContext;
  activeHarness?: HarnessSnapshot | null;
}

export interface ArchitectInterviewState
  extends BaseAdaptiveInterviewState<"architect", ArchitectDimensionName, ArchitectInterviewRound> {
  repoProfileId: string;
  repoProfileSummary: string;
}

export interface QuestionDraft {
  targeting: FeatureDimensionName;
  rationale: string;
  question: string;
}

export interface ArchitectQuestionDraft {
  targeting: ArchitectDimensionName;
  rationale: string;
  question: string;
}

export interface ScoreDraft {
  goal: DimensionAssessment;
  constraints: DimensionAssessment;
  criteria: DimensionAssessment;
  context?: DimensionAssessment;
  weakestDimension: DimensionName;
  weakestDimensionRationale: string;
}

export interface FeatureRoundInput {
  targeting: FeatureDimensionName;
  rationale: string;
  question: string;
  answer: string;
  breakdown: AmbiguityBreakdown;
  weakestDimension: FeatureDimensionName;
  weakestDimensionRationale: string;
}

export interface ArchitectScoreDraft {
  domain_scope: DimensionAssessment;
  work_units: DimensionAssessment;
  team_topology: DimensionAssessment;
  verification_strategy: DimensionAssessment;
  user_operating_style: DimensionAssessment;
  weakestDimension: ArchitectDimensionName;
  weakestDimensionRationale: string;
}

export interface ArchitectRoundInput {
  targeting: ArchitectDimensionName;
  rationale: string;
  question: string;
  answer: string;
  breakdown: ArchitectAmbiguityBreakdown;
  weakestDimension: ArchitectDimensionName;
  weakestDimensionRationale: string;
}

export interface OntologyEntity {
  name: string;
  type: string;
  fields: string[];
  relationships: string[];
}

export interface SeedBlueprint {
  title: string;
  goal: string;
  constraints: string[];
  nonGoals: string[];
  acceptanceCriteria: string[];
  transcriptSummary: string[];
  technicalContext: string[];
  ontology: OntologyEntity[];
}

export interface AgentBlueprint {
  name: string;
  role: string;
  responsibilities: string[];
}

export interface SkillBlueprint {
  name: string;
  purpose: string;
}

export interface SpecDocument extends SeedBlueprint {
  metadata: {
    specId: string;
    seedId: string;
    interviewId: string;
    ambiguityScore: number;
    forced: boolean;
    projectType: ProjectType;
    createdAt: string;
  };
}

export interface SeedDocument {
  goal: string;
  task_type: "code";
  constraints: string[];
  acceptance_criteria: string[];
  ontology_schema: {
    name: string;
    description: string;
    fields: Array<{
      name: string;
      type: string;
      description: string;
      required: boolean;
    }>;
  };
  metadata: {
    seed_id: string;
    interview_id: string;
    ambiguity_score: number;
    forced: boolean;
    created_at: string;
  };
}

export interface HarnessBlueprint {
  title: string;
  harnessGoal: string;
  repoProfileSummary: string[];
  workUnits: string[];
  teamTopology: string[];
  verificationStrategy: string[];
  userOperatingStyle: string[];
  agentRoster: AgentBlueprint[];
  skillRoster: SkillBlueprint[];
  orchestrationProtocol: string[];
  constraints: string[];
  generationTargets: string[];
}

export interface HarnessBlueprintDocument extends HarnessBlueprint {
  metadata: {
    blueprintId: string;
    seedId: string;
    architectInterviewId: string;
    repoProfileId: string;
    ambiguityScore: number;
    forced: boolean;
    createdAt: string;
  };
}

export interface HarnessSeedDocument {
  harness_goal: string;
  repo_profile: {
    stack: string[];
    package_manager: string;
    scripts: Record<string, string>;
    top_level_directories: string[];
    likely_boundaries: string[];
    conventions: string[];
    risk_surfaces: string[];
    relevant_files: string[];
  };
  work_units: string[];
  agents: AgentBlueprint[];
  skills: SkillBlueprint[];
  verification: {
    strategy: string[];
    emphasis: string[];
  };
  generation_targets: {
    slug: string;
    claude_agents: boolean;
    claude_skills: boolean;
  };
  metadata: {
    seed_id: string;
    blueprint_id: string;
    interview_id: string;
    ambiguity_score: number;
    forced: boolean;
    created_at: string;
  };
}

export interface GeneratedHarnessManifest {
  blueprintId: string;
  seedId: string;
  slug: string;
  generatedAt: string;
  files: Array<{
    path: string;
    sha1: string;
  }>;
  conflicts: string[];
}

export interface ActiveHarnessDocument extends HarnessSnapshot {
  sourceSeedPath: string;
  sourceBlueprintPath: string | null;
}

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface FollowUpStoryDraft {
  title: string;
  acceptanceCriteria: string[];
  verificationCommands?: string[];
}

export interface ReviewVerdict {
  verdict: Verdict;
  summary: string;
  failureSignature: string | null;
  findings: string[];
  rejectionCategory?: RejectionCategory | null;
  followUpStories?: FollowUpStoryDraft[];
  suggestedQuestionFocus?: string[];
  suggestedRepairFocus?: string[];
}

export interface QaVerdict {
  verdict: Verdict;
  summary: string;
  failureSignature: string | null;
  findings: string[];
  suggestedVerificationCommands?: string[];
}

export interface StoryResultInput {
  storyId: string;
  implementerOutput: string;
  changedFiles: string[];
  qaVerdict: QaVerdict;
  reviewerVerdict: ReviewVerdict;
  commandResults: CommandResult[];
  finalCritic?: ReviewVerdict | null;
}

export interface ReopenHistoryEntry {
  target: "feature" | "harness";
  stateId: string;
  reason: RejectionCategory;
  command: string;
  recordedAt: string;
}

export interface UserStory {
  id: string;
  title: string;
  acceptanceCriteria: string[];
  verificationCommands: string[];
  workUnit?: string | null;
  boundaryHints?: string[];
  verificationFocus?: string[];
  expectedArtifacts?: string[];
  handoffContract?: string[];
  passes: boolean;
  attempts: number;
  lastReviewerVerdict: "pending" | "approved" | "rejected" | "blocked";
}

export interface PrdDocument {
  sourceSeedId: string;
  sourceSpecPath: string;
  sourceSeedPath: string;
  goal: string;
  status: LoopStatus;
  activeHarness?: HarnessSnapshot | null;
  stories: UserStory[];
}

export interface LoopState {
  runId: string;
  status: LoopStatus;
  currentStoryId: string | null;
  reopenTarget?: "feature" | "harness" | null;
  reopenStateId?: string | null;
  suggestedNextCommand?: string | null;
  reopenReason?: RejectionCategory | null;
  suggestedQuestionFocus?: string[] | null;
  suggestedRepairFocus?: string[] | null;
  createdAt: string;
  updatedAt: string;
  repeatedFailures: Record<string, { signature: string; count: number }>;
  reopenHistory: ReopenHistoryEntry[];
}

export interface VerificationEntry {
  storyId: string;
  changedFiles: string[];
  implementerOutput: string;
  qaVerdict: QaVerdict;
  reviewerVerdict: ReviewVerdict | null;
  commandResults: CommandResult[];
  recordedAt: string;
}

export interface RunArtifacts {
  prd: PrdDocument;
  loopState: LoopState;
  progress: string;
  verification: VerificationEntry[];
}

export interface OrchestratorRunResult extends RunArtifacts {
  runId: string;
  reopenHistory: ReopenHistoryEntry[];
}
