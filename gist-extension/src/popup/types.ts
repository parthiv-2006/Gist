export interface GistItem {
  id?:           string;
  original_text: string;
  explanation:   string;
  mode:          string;
  url:           string;
  category:      string;
  created_at:    string;
  score?:        number;
  tags?:         string[];
}

export interface TagCount {
  tag:   string;
  count: number;
}

export interface AskResult {
  answer:  string;
  sources: GistItem[];
}

export type AskState = "idle" | "searching" | "done" | "error";

export type DashboardRoute = "home" | "library" | "synapse" | "settings" | "recall";

export interface SynapseNode {
  id:         string;
  x:          number;
  y:          number;
  cluster_id: number;
  category:   string;
  mode:       string;
  title:      string;
  snippet:    string;
  created_at: string;
  url:        string;
}

export interface SynapseEdge {
  source: string;
  target: string;
  weight: number;
}

export interface SynapseCluster {
  id:       number;
  label:    string;
  size:     number;
  centroid: { x: number; y: number };
}

export interface SynapseGraph {
  nodes:    SynapseNode[];
  edges:    SynapseEdge[];
  clusters: SynapseCluster[];
  canvas:   { width: number; height: number };
}

export interface SynapseMeta {
  computed_at:         string;
  indexed_count:       number;
  rendered_count:      number;
  missing_embeddings:  number;
  cluster_count:       number;
  edge_count:          number;
}

export interface SynapseResponse {
  graph:  SynapseGraph;
  stale?: boolean;
  meta:   SynapseMeta;
}
