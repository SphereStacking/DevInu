export interface Env {
  // シークレット（wrangler secret put で設定）
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  ANTHROPIC_API_KEY: string;

  // Durable Object バインディング
  PR_REVIEW: DurableObjectNamespace;
  TOKEN_CACHE: DurableObjectNamespace;

  // Container バインディング
  CONTAINER: unknown;

  // 設定変数
  MIN_SEVERITY: string;
  MAX_BUDGET_USD: string;
  LANGUAGE: string;
  GITHUB_SERVER_URL?: string;
}

export interface CachedToken {
  token: string;
  expiresAt: string; // ISO 8601
}

export interface GitHubWebhookPayload {
  action?: string;
  installation?: {
    id: number;
  };
  pull_request?: {
    number: number;
    draft?: boolean;
    labels?: Array<{ name: string }>;
    state?: string;
  };
  requested_reviewer?: {
    login: string;
    type: string;
  };
  issue?: {
    number: number;
    pull_request?: unknown;
  };
  comment?: {
    body: string;
    user: {
      login: string;
    };
  };
  repository?: {
    full_name: string;
    owner: {
      login: string;
    };
    name: string;
  };
  sender?: {
    login: string;
  };
}

export interface InstallationAccessTokenResponse {
  token: string;
  expires_at: string;
}

export interface ReviewState {
  prKey: string;
  containerId: string;
  status: "running" | "completed" | "cancelled";
  startedAt: string; // ISO 8601
  webhookDeliveryId: string;
}
