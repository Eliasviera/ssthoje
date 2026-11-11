export type DdsTopic = {
  id: string;
  title: string;
  summary: string;
  guidance: string;
  verificationQuestion: string;
  riskGroup?: string;
  sourceItem: string;
  status: "draft" | "active" | "superseded";
  reviewer: string;
  reviewedAt: string;
  createdAt: string;
  updatedAt: string;
  history: { action: "created" | "activated" | "superseded" | "updated"; actorUserId: string; occurredAt: string }[];
};

export type DdsTopicCatalog = { topics: DdsTopic[] };
