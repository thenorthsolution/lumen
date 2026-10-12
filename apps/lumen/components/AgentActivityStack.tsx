"use client";

import ApprovalCard, { type ApprovalQuestion } from "@lumen/ui/primitives/ApprovalCard";
import RecommendationCard, { type RecommendationOption } from "@lumen/ui/primitives/RecommendationCard";
import TaskRows, { type TaskRow } from "@lumen/ui/primitives/TaskRows";

export interface AgentActivityStackProps {
  tasks?: TaskRow[];
  approval?: {
    questions: ApprovalQuestion[];
    onSubmitted?: (answers: Record<number, number[]>) => void;
  };
  recommendation?: {
    options: RecommendationOption[];
  };
}

export function AgentActivityStack({ tasks, approval, recommendation }: AgentActivityStackProps) {
  if (!tasks?.length && !approval && !recommendation) return null;

  return (
    <div className="agentActivityStack" aria-label="Lumen-activiteit">
      {tasks?.length ? (
        <TaskRows
          className="agentTaskRows"
          labels={{ completed: "Afgerond", failed: "Mislukt" }}
          rows={tasks}
          variant="List"
        />
      ) : null}
      {approval ? (
        <ApprovalCard
          labels={{ skip: "Overslaan", continue: "Doorgaan", send: "Bevestigen", customPlaceholder: "Anders…", sentMessage: "Antwoorden verstuurd" }}
          onSubmitted={approval.onSubmitted}
          questions={approval.questions}
          resettable={false}
        />
      ) : null}
      {recommendation ? (
        <RecommendationCard
          labels={{ title: "Aanbevolen vervolgstap", alternatives: "Alternatieven", otherOptions: "Andere opties", accepted: "Geaccepteerd" }}
          options={recommendation.options}
        />
      ) : null}
    </div>
  );
}
