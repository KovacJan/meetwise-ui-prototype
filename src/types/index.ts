export interface User {
  id: string;
  email: string;
  team_id: string | null;
  is_manager: boolean;
  hourly_rate?: number;
  microsoft_refresh_token?: string;
  outlook_connected?: boolean;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  team_code: string;
  manager_id: string;
  hourly_rate: number;
  plan?: "free" | "pro";
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  plan_expires_at?: string | null;
  created_at: string;
}

export interface Meeting {
  id: string;
  user_id: string;
  team_id: string;
  outlook_event_id: string;
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  actual_duration_minutes?: number;
  participant_count: number;
  cost?: number;
  ai_insight?: string;
  efficiency_score?: number;
  poll_sent?: boolean;
  poll_sent_at?: string;
  created_at: string;
}

export interface PollResponse {
  id: string;
  meeting_id: string;
  user_id: string | null;
  was_useful: "yes" | "partially" | "no";
  actual_duration_minutes: number;
  submitted_at: string;
}

