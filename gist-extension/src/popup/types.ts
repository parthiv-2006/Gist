export interface GistItem {
  id?:           string;
  original_text: string;
  explanation:   string;
  mode:          string;
  url:           string;
  category:      string;
  created_at:    string;
  score?:        number;
}

export interface AskResult {
  answer:  string;
  sources: GistItem[];
}

export type AskState = "idle" | "searching" | "done" | "error";

export type DashboardRoute = "home" | "library" | "settings";
