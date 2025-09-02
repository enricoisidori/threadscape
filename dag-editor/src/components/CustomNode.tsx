import { memo, useState } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { NodeData, AssetRef } from "../types";
import { useGraphStore } from "../store/graphStore";

const CustomNode = memo(({ data, id }: NodeProps<NodeData>) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { setSelectedNode, selectedNodeId } = useGraphStore();
  const isSelected = selectedNodeId === data.uuid;

  const handleNodeClick = () => {
    setSelectedNode(data.uuid);
  };

  const handleDoubleClick = () => {
    setIsExpanded(!isExpanded);
  };

  const renderFilePreview = (file: AssetRef) => {
    if (file.kind === "image") {
      return (
        <img
          key={file.id}
          src={file.url}
          alt={file.filename}
          className="w-full h-20 object-cover rounded border border-gray-600"
        />
      );
    } else if (file.kind === "pdf") {
      return (
        <div
          key={file.id}
          className="w-full h-20 bg-gray-700 rounded border border-gray-600 flex items-center justify-center"
        >
          <div className="text-center">
            <div className="text-red-400 text-2xl mb-1">📄</div>
            <div className="text-xs text-gray-300 truncate px-2">
              {file.filename}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className={`min-w-[200px] max-w-[300px] bg-gray-800 border-2 rounded-lg shadow-lg transition-all duration-200 ${
        isSelected ? "border-blue-500 shadow-blue-500/20" : "border-gray-600"
      }`}
      onClick={handleNodeClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Input Handle (Left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-blue-500 border-2 border-gray-800"
      />

      {/* Node Content */}
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-blue-400 text-sm">{data.id}</div>
          <div className="text-xs text-gray-400">
            {new Date(data.date).toLocaleDateString()}
          </div>
        </div>

        {/* Title */}
        {data.title && (
          <div className="font-semibold text-gray-100 text-sm mb-2 truncate">
            {data.title}
          </div>
        )}

        {/* Basic Info */}
        <div className="space-y-1 mb-2">
          {data.objectType && (
            <div className="text-xs text-gray-300">
              <span className="text-gray-500">Type:</span> {data.objectType}
            </div>
          )}
          {data.action && (
            <div className="text-xs text-gray-300">
              <span className="text-gray-500">Action:</span> {data.action}
            </div>
          )}
          {data.mainArea && (
            <div className="text-xs text-gray-300">
              <span className="text-gray-500">Area:</span> {data.mainArea}
            </div>
          )}
        </div>

        {/* Tags */}
        {data.tags && data.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {data.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
            {data.tags.length > 3 && (
              <span className="text-xs text-gray-500">
                +{data.tags.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Files Preview */}
        {data.files && data.files.length > 0 && (
          <div className="space-y-2 mb-2">
            {data.files.slice(0, 2).map(renderFilePreview)}
            {data.files.length > 2 && (
              <div className="text-xs text-gray-500 text-center">
                +{data.files.length - 2} more files
              </div>
            )}
          </div>
        )}

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-600 space-y-2">
            {data.description && (
              <div className="text-xs text-gray-300">
                <span className="text-gray-500">Description:</span>{" "}
                {data.description}
              </div>
            )}
            {data.area && data.area.length > 0 && (
              <div className="text-xs text-gray-300">
                <span className="text-gray-500">Areas:</span>{" "}
                {data.area.join(", ")}
              </div>
            )}
            {data.links && data.links.length > 0 && (
              <div className="text-xs text-gray-300">
                <span className="text-gray-500">Links:</span>{" "}
                {data.links.length} links
              </div>
            )}
          </div>
        )}

        {/* Expand/Collapse Indicator */}
        <div className="text-center mt-2">
          <div className="text-xs text-gray-500">
            {isExpanded ? "Double-click to collapse" : "Double-click to expand"}
          </div>
        </div>
      </div>

      {/* Output Handle (Right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-green-500 border-2 border-gray-800"
      />
    </div>
  );
});

CustomNode.displayName = "CustomNode";

export default CustomNode;
