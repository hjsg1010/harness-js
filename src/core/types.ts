export type ProjectType = "greenfield" | "brownfield";
export type DimensionName = "goal" | "constraints" | "criteria" | "context";
export type InterviewStatus = "in_progress" | "completed";
export type LoopStatus = "pending" | "running" | "blocked" | "completed";
export type Verdict = "APPROVE" | "REJECT";

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

export interface BrownfieldContext {
  projectType: ProjectType;
  scannedAt: string;
  summary: string;
  signals: string[];
  files: string[];
}

export interface InterviewRound {
  roundNumber: number;
  targeting: DimensionName;
  rationale: string;
  question: string;
  answer: string;
  askedAt: string;
  answeredAt: string;
  ambiguity: number;
  breakdown: AmbiguityBreakdown;
  weakestDimension: DimensionName;
  weakestDimensionRationale: string;
}

export interface InterviewState {
  interviewId: string;
  status: InterviewStatus;
  initialIdea: string;
  projectType: ProjectType;
  threshold: number;
  currentAmbiguity: number;
  brownfieldContext?: BrownfieldContext;
  rounds: InterviewRound[];
  createdAt: string;
  updatedAt: string;
}

export interface QuestionDraft {
  targeting: DimensionName;
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
  followUpStories?: FollowUpStoryDraft[];
}

export interface QaVerdict {
  verdict: Verdict;
  summary: string;
  failureSignature: string | null;
  findings: string[];
  suggestedVerificationCommands?: string[];
}

export interface UserStory {
  id: string;
  title: string;
  acceptanceCriteria: string[];
  verificationCommands: string[];
  passes: boolean;
  attempts: number;
  lastReviewerVerdict: "pending" | "approved" | "rejected" | "blocked";
}

export interface PrdDocument {
  sourceSeedId: string;
  sourceSpecPath: string;
  sourceSeedPath: string;
  status: LoopStatus;
  stories: UserStory[];
}

export interface LoopState {
  runId: string;
  status: LoopStatus;
  currentStoryId: string | null;
  createdAt: string;
  updatedAt: string;
  repeatedFailures: Record<string, { signature: string; count: number }>;
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

export interface CodexExecOptions {
  cwd: string;
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
  model?: string;
}

export interface CodexRunner {
  execText(prompt: string, options: CodexExecOptions): Promise<string>;
  execJson<T>(prompt: string, schema: Record<string, unknown>, options: CodexExecOptions): Promise<T>;
  reviewJson<T>(
    prompt: string,
    schema: Record<string, unknown>,
    options: { cwd: string; model?: string }
  ): Promise<T>;
}
