export type AssetRef = {
  id: string;
  nodeId: string;
  filename: string;
  kind: "image" | "pdf";
  url: string;
};

export type NodeData = {
  id: string; // simple auto-increment, ex. N1, N2…
  uuid: string; // internal stable reference
  date: string; // ISO

  title?: string;
  objectType?: string;
  source?: string;
  concept?: string;
  sketch?: string;
  artefact?: string;

  action?: "Exploring" | "Designing" | "Making";

  mainArea?: "Speculation" | "Interaction" | "Communication";

  area?: string[]; // e.g. History, Postcolonial Studies, Bio-Art, Philosophy of Technology, HCI, Cognitive Science, Critical Theory, Environmental Humanities, Computational Aesthetics, Synthetic Biology, Machine Learning, Gender Studies, Electronic Music Composition…

  tags?: string[];

  description?: string;

  links?: string[];

  files?: AssetRef[];

  // React Flow specific
  position: { x: number; y: number };
  type?: string;
};

export type EdgeData = {
  id: string;
  source: string; // node.uuid
  target: string; // node.uuid
  sourceHandle?: string;
  targetHandle?: string;
};

export type GraphDocument = {
  nodes: NodeData[];
  edges: EdgeData[];
  createdAt: string;
  updatedAt: string;
};

export type AreaOption =
  | "History"
  | "Postcolonial Studies"
  | "Bio-Art"
  | "Philosophy of Technology"
  | "HCI"
  | "Cognitive Science"
  | "Critical Theory"
  | "Environmental Humanities"
  | "Computational Aesthetics"
  | "Synthetic Biology"
  | "Machine Learning"
  | "Gender Studies"
  | "Electronic Music Composition";

export const AREA_OPTIONS: AreaOption[] = [
  "History",
  "Postcolonial Studies",
  "Bio-Art",
  "Philosophy of Technology",
  "HCI",
  "Cognitive Science",
  "Critical Theory",
  "Environmental Humanities",
  "Computational Aesthetics",
  "Synthetic Biology",
  "Machine Learning",
  "Gender Studies",
  "Electronic Music Composition",
];

export const ACTION_OPTIONS = ["Exploring", "Designing", "Making"] as const;
export const MAIN_AREA_OPTIONS = [
  "Speculation",
  "Interaction",
  "Communication",
] as const;
