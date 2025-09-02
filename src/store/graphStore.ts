import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { set, get } from "idb-keyval";
import JSZip from "jszip";
import type { NodeData, EdgeData, GraphDocument, AssetRef } from "../types";

interface GraphState {
  nodes: NodeData[];
  edges: EdgeData[];
  selectedNodeId: string | null;
  nextNodeId: number;

  // Actions
  addNode: (position: { x: number; y: number }) => void;
  updateNode: (uuid: string, updates: Partial<NodeData>) => void;
  deleteNode: (uuid: string) => void;
  addEdge: (source: string, target: string) => void;
  deleteEdge: (id: string) => void;
  setSelectedNode: (id: string | null) => void;

  // File handling
  addFileToNode: (nodeId: string, file: File) => Promise<void>;
  removeFileFromNode: (nodeId: string, fileId: string) => void;

  // Persistence
  saveToIndexedDB: () => Promise<void>;
  loadFromIndexedDB: () => Promise<void>;
  exportToZIP: () => Promise<void>;
  importFromZIP: (file: File) => Promise<void>;

  // Initialize
  initialize: () => Promise<void>;
}

const generateUUID = (): string => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const generateNodeId = (nextId: number): string => {
  return `N${nextId}`;
};

export const useGraphStore = create<GraphState>()(
  subscribeWithSelector((setState, get) => ({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    nextNodeId: 1,

    addNode: (position) => {
      const { nextNodeId } = get();
      const newNode: NodeData = {
        id: generateNodeId(nextNodeId),
        uuid: generateUUID(),
        date: new Date().toISOString(),
        position,
        title: `Node ${nextNodeId}`,
        tags: [],
        area: [],
        links: [],
        files: [],
      };

      setState((state) => ({
        nodes: [...state.nodes, newNode],
        nextNodeId: nextNodeId + 1,
      }));
    },

    updateNode: (uuid, updates) => {
      setState((state) => ({
        nodes: state.nodes.map((node) =>
          node.uuid === uuid ? { ...node, ...updates } : node
        ),
      }));
    },

    deleteNode: (uuid) => {
      const { edges } = get();
      setState((state) => ({
        nodes: state.nodes.filter((node) => node.uuid !== uuid),
        edges: edges.filter(
          (edge) => edge.source !== uuid && edge.target !== uuid
        ),
        selectedNodeId:
          state.selectedNodeId === uuid ? null : state.selectedNodeId,
      }));
    },

    addEdge: (source, target) => {
      const newEdge: EdgeData = {
        id: generateUUID(),
        source,
        target,
        sourceHandle: "right",
        targetHandle: "left",
      };

      setState((state) => ({
        edges: [...state.edges, newEdge],
      }));
    },

    deleteEdge: (id) => {
      setState((state) => ({
        edges: state.edges.filter((edge) => edge.id !== id),
      }));
    },

    setSelectedNode: (id) => {
      setState({ selectedNodeId: id });
    },

    addFileToNode: async (nodeId, file) => {
      const { nodes } = get();
      const node = nodes.find((n) => n.uuid === nodeId);
      if (!node) return;

      const fileId = generateUUID();
      const kind = file.type.startsWith("image/") ? "image" : "pdf";

      // Convert file to data URL for storage
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const dataUrl = `data:${file.type};base64,${base64}`;

      const assetRef: AssetRef = {
        id: fileId,
        nodeId,
        filename: file.name,
        kind,
        url: dataUrl,
      };

      setState((state) => ({
        nodes: state.nodes.map((n) =>
          n.uuid === nodeId
            ? { ...n, files: [...(n.files || []), assetRef] }
            : n
        ),
      }));
    },

    removeFileFromNode: (nodeId, fileId) => {
      setState((state) => ({
        nodes: state.nodes.map((n) =>
          n.uuid === nodeId
            ? { ...n, files: (n.files || []).filter((f) => f.id !== fileId) }
            : n
        ),
      }));
    },

    saveToIndexedDB: async () => {
      const { nodes, edges } = get();
      const document: GraphDocument = {
        nodes,
        edges,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await set("dag-graph", document);
    },

    loadFromIndexedDB: async () => {
      try {
        const document = (await get("dag-graph")) as GraphDocument;
        if (document) {
          setState({
            nodes: document.nodes,
            edges: document.edges,
            nextNodeId:
              Math.max(
                ...document.nodes.map((n) => parseInt(n.id.slice(1))),
                0
              ) + 1,
          });
        }
      } catch (error) {
        console.error("Failed to load from IndexedDB:", error);
      }
    },

    exportToZIP: async () => {
      const { nodes, edges } = get();
      const document: GraphDocument = {
        nodes,
        edges,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const zip = new JSZip();

      // Add graph data
      zip.file("graph.json", JSON.stringify(document, null, 2));

      // Add assets
      const assetsFolder = zip.folder("assets");
      if (assetsFolder) {
        for (const node of nodes) {
          if (node.files) {
            for (const file of node.files) {
              const response = await fetch(file.url);
              const blob = await response.blob();
              assetsFolder.file(file.filename, blob);
            }
          }
        }
      }

      // Generate and download ZIP
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dag-graph-${new Date().toISOString().split("T")0}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    },

    importFromZIP: async (file) => {
      try {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        // Load graph data
        const graphFile = zipContent.file("graph.json");
        if (!graphFile) throw new Error("No graph.json found in ZIP");

        const graphContent = await graphFile.async("string");
        const document: GraphDocument = JSON.parse(graphContent);

        // Load assets
        const assetsFolder = zipContent.folder("assets");
        if (assetsFolder) {
          for (const node of document.nodes) {
            if (node.files) {
              for (const fileRef of node.files) {
                const assetFile = assetsFolder.file(fileRef.filename);
                if (assetFile) {
                  const blob = await assetFile.async("blob");
                  const dataUrl = URL.createObjectURL(blob);
                  fileRef.url = dataUrl;
                }
              }
            }
          }
        }

        setState({
          nodes: document.nodes,
          edges: document.edges,
          nextNodeId:
            Math.max(...document.nodes.map((n) => parseInt(n.id.slice(1))), 0) +
            1,
        });
      } catch (error) {
        console.error("Failed to import from ZIP:", error);
        throw error;
      }
    },

    initialize: async () => {
      await get().loadFromIndexedDB();
    },
  }))
);
