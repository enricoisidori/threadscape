import { useState, useMemo } from "react";
import type { NodeData } from "../types";
import { useGraphStore } from "../store/graphStore";

const NodeList: React.FC = () => {
  const { nodes, selectedNodeId, setSelectedNode } = useGraphStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterField, setFilterField] = useState<keyof NodeData>("title");

  const filteredNodes = useMemo(() => {
    if (!searchTerm.trim()) return nodes;

    return nodes.filter((node) => {
      const fieldValue = node[filterField];
      if (!fieldValue) return false;

      if (Array.isArray(fieldValue)) {
        return fieldValue.some((value) =>
          value.toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      return String(fieldValue)
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
    });
  }, [nodes, searchTerm, filterField]);

  const handleNodeClick = (nodeId: string) => {
    setSelectedNode(nodeId);
  };

  const getNodePreview = (node: NodeData) => {
    const preview = [];

    if (node.title) preview.push(node.title);
    if (node.objectType) preview.push(node.objectType);
    if (node.action) preview.push(node.action);
    if (node.mainArea) preview.push(node.mainArea);
    if (node.tags && node.tags.length > 0)
      preview.push(node.tags.slice(0, 2).join(", "));

    return preview.join(" • ") || "No metadata";
  };

  const getNodeIcon = (node: NodeData) => {
    if (node.files && node.files.length > 0) {
      const hasImages = node.files.some((f) => f.kind === "image");
      const hasPdfs = node.files.some((f) => f.kind === "pdf");

      if (hasImages && hasPdfs) return "📁";
      if (hasImages) return "🖼️";
      if (hasPdfs) return "📄";
    }

    if (node.action === "Exploring") return "🔍";
    if (node.action === "Designing") return "✏️";
    if (node.action === "Making") return "🔨";

    return "📝";
  };

  return (
    <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-gray-100 mb-3">Nodes</h3>

        {/* Search */}
        <div className="space-y-2">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search nodes..."
            className="input w-full"
          />

          {/* Filter Field Selector */}
          <select
            value={filterField}
            onChange={(e) => setFilterField(e.target.value as keyof NodeData)}
            className="input w-full text-sm"
          >
            <option value="title">Title</option>
            <option value="objectType">Object Type</option>
            <option value="source">Source</option>
            <option value="concept">Concept</option>
            <option value="action">Action</option>
            <option value="mainArea">Main Area</option>
            <option value="tags">Tags</option>
            <option value="description">Description</option>
          </select>
        </div>

        {/* Node Count */}
        <div className="text-sm text-gray-400 mt-2">
          {filteredNodes.length} of {nodes.length} nodes
        </div>
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto">
        {filteredNodes.length === 0 ? (
          <div className="p-4 text-center text-gray-400">
            {searchTerm ? "No nodes found" : "No nodes yet"}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredNodes.map((node) => (
              <div
                key={node.uuid}
                onClick={() => handleNodeClick(node.uuid)}
                className={`p-3 rounded-lg cursor-pointer transition-colors duration-200 ${
                  selectedNodeId === node.uuid
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 hover:bg-gray-600 text-gray-100"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="text-lg flex-shrink-0">
                    {getNodeIcon(node)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-sm">{node.id}</div>
                      <div className="text-xs opacity-75">
                        {new Date(node.date).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="text-sm opacity-90 truncate">
                      {getNodePreview(node)}
                    </div>

                    {/* Quick Stats */}
                    <div className="flex items-center space-x-3 mt-2 text-xs opacity-75">
                      {node.tags && node.tags.length > 0 && (
                        <span>🏷️ {node.tags.length}</span>
                      )}
                      {node.files && node.files.length > 0 && (
                        <span>📎 {node.files.length}</span>
                      )}
                      {node.links && node.links.length > 0 && (
                        <span>🔗 {node.links.length}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeList;
