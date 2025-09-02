import { useState, useRef } from "react";
import type {
  NodeData,
  AREA_OPTIONS,
  ACTION_OPTIONS,
  MAIN_AREA_OPTIONS,
} from "../types";
import { useGraphStore } from "../store/graphStore";

const NodeInspector: React.FC = () => {
  const {
    selectedNodeId,
    nodes,
    updateNode,
    addFileToNode,
    removeFileFromNode,
  } = useGraphStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newTag, setNewTag] = useState("");
  const [newLink, setNewLink] = useState("");

  const selectedNode = nodes.find((node) => node.uuid === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className="w-80 bg-gray-800 border-l border-gray-700 p-4">
        <div className="text-gray-400 text-center">
          Select a node to edit its properties
        </div>
      </div>
    );
  }

  const handleFieldChange = (field: keyof NodeData, value: any) => {
    updateNode(selectedNode.uuid, { [field]: value });
  };

  const handleArrayFieldChange = (field: keyof NodeData, value: string[]) => {
    updateNode(selectedNode.uuid, { [field]: value });
  };

  const addTag = () => {
    if (newTag.trim() && !selectedNode.tags?.includes(newTag.trim())) {
      const updatedTags = [...(selectedNode.tags || []), newTag.trim()];
      handleArrayFieldChange("tags", updatedTags);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    const updatedTags =
      selectedNode.tags?.filter((tag) => tag !== tagToRemove) || [];
    handleArrayFieldChange("tags", updatedTags);
  };

  const addLink = () => {
    if (newLink.trim() && !selectedNode.links?.includes(newLink.trim())) {
      const updatedLinks = [...(selectedNode.links || []), newLink.trim()];
      handleArrayFieldChange("links", updatedLinks);
      setNewLink("");
    }
  };

  const removeLink = (linkToRemove: string) => {
    const updatedLinks =
      selectedNode.links?.filter((link) => link !== linkToRemove) || [];
    handleArrayFieldChange("links", updatedLinks);
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith("image/") || file.type === "application/pdf") {
          await addFileToNode(selectedNode.uuid, file);
        }
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileRemove = (fileId: string) => {
    removeFileFromNode(selectedNode.uuid, fileId);
  };

  return (
    <div className="w-80 bg-gray-800 border-l border-gray-700 overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="border-b border-gray-700 pb-3">
          <h3 className="text-lg font-semibold text-gray-100">
            Node Inspector
          </h3>
          <div className="text-sm text-gray-400">{selectedNode.id}</div>
        </div>

        {/* Basic Fields */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={selectedNode.title || ""}
              onChange={(e) => handleFieldChange("title", e.target.value)}
              className="input w-full"
              placeholder="Enter title..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Object Type
            </label>
            <input
              type="text"
              value={selectedNode.objectType || ""}
              onChange={(e) => handleFieldChange("objectType", e.target.value)}
              className="input w-full"
              placeholder="Enter object type..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Source
            </label>
            <input
              type="text"
              value={selectedNode.source || ""}
              onChange={(e) => handleFieldChange("source", e.target.value)}
              className="input w-full"
              placeholder="Enter source..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Concept
            </label>
            <input
              type="text"
              value={selectedNode.concept || ""}
              onChange={(e) => handleFieldChange("concept", e.target.value)}
              className="input w-full"
              placeholder="Enter concept..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Sketch
            </label>
            <input
              type="text"
              value={selectedNode.sketch || ""}
              onChange={(e) => handleFieldChange("sketch", e.target.value)}
              className="input w-full"
              placeholder="Enter sketch..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Artefact
            </label>
            <input
              type="text"
              value={selectedNode.artefact || ""}
              onChange={(e) => handleFieldChange("artefact", e.target.value)}
              className="input w-full"
              placeholder="Enter artefact..."
            />
          </div>
        </div>

        {/* Dropdown Fields */}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Action
            </label>
            <select
              value={selectedNode.action || ""}
              onChange={(e) =>
                handleFieldChange("action", e.target.value || undefined)
              }
              className="input w-full"
            >
              <option value="">Select action...</option>
              {ACTION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Main Area
            </label>
            <select
              value={selectedNode.mainArea || ""}
              onChange={(e) =>
                handleFieldChange("mainArea", e.target.value || undefined)
              }
              className="input w-full"
            >
              <option value="">Select main area...</option>
              {MAIN_AREA_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Multi-select Areas */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Areas
          </label>
          <div className="max-h-32 overflow-y-auto border border-gray-600 rounded p-2">
            {AREA_OPTIONS.map((option) => (
              <label key={option} className="flex items-center space-x-2 py-1">
                <input
                  type="checkbox"
                  checked={selectedNode.area?.includes(option) || false}
                  onChange={(e) => {
                    const currentAreas = selectedNode.area || [];
                    if (e.target.checked) {
                      handleArrayFieldChange("area", [...currentAreas, option]);
                    } else {
                      handleArrayFieldChange(
                        "area",
                        currentAreas.filter((area) => area !== option)
                      );
                    }
                  }}
                  className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-300">{option}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Tags
          </label>
          <div className="flex space-x-2 mb-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addTag()}
              className="input flex-1"
              placeholder="Add tag..."
            />
            <button onClick={addTag} className="btn btn-secondary px-3">
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedNode.tags?.map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-full flex items-center space-x-1"
              >
                <span>{tag}</span>
                <button
                  onClick={() => removeTag(tag)}
                  className="text-gray-400 hover:text-red-400 ml-1"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Description
          </label>
          <textarea
            value={selectedNode.description || ""}
            onChange={(e) => handleFieldChange("description", e.target.value)}
            className="input w-full h-20 resize-none"
            placeholder="Enter description..."
          />
        </div>

        {/* Links */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Links
          </label>
          <div className="flex space-x-2 mb-2">
            <input
              type="text"
              value={newLink}
              onChange={(e) => setNewLink(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addLink()}
              className="input flex-1"
              placeholder="Add link..."
            />
            <button onClick={addLink} className="btn btn-secondary px-3">
              Add
            </button>
          </div>
          <div className="space-y-1">
            {selectedNode.links?.map((link, index) => (
              <div
                key={index}
                className="flex items-center justify-between bg-gray-700 px-2 py-1 rounded"
              >
                <span className="text-sm text-gray-300 truncate">{link}</span>
                <button
                  onClick={() => removeLink(link)}
                  className="text-gray-400 hover:text-red-400 ml-2"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Files */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Files
          </label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-secondary w-full mb-2"
          >
            Add Files (JPG/PDF)
          </button>

          <div className="space-y-2">
            {selectedNode.files?.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between bg-gray-700 p-2 rounded"
              >
                <div className="flex items-center space-x-2">
                  <span className="text-lg">
                    {file.kind === "image" ? "🖼️" : "📄"}
                  </span>
                  <span className="text-sm text-gray-300 truncate">
                    {file.filename}
                  </span>
                </div>
                <button
                  onClick={() => handleFileRemove(file.id)}
                  className="text-gray-400 hover:text-red-400"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Date
          </label>
          <input
            type="datetime-local"
            value={selectedNode.date.slice(0, 16)}
            onChange={(e) =>
              handleFieldChange("date", new Date(e.target.value).toISOString())
            }
            className="input w-full"
          />
        </div>
      </div>
    </div>
  );
};

export default NodeInspector;

