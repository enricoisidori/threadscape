import { useRef, useCallback, useEffect } from "react";
import { useGraphStore } from "../store/graphStore";

const Toolbar: React.FC = () => {
  const {
    addNode,
    deleteNode,
    selectedNodeId,
    saveToIndexedDB,
    loadFromIndexedDB,
    exportToZIP,
    importFromZIP,
  } = useGraphStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNewNode = useCallback(() => {
    addNode({ x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 });
  }, [addNode]);

  const handleDeleteNode = useCallback(() => {
    if (selectedNodeId) {
      deleteNode(selectedNodeId);
    }
  }, [deleteNode, selectedNodeId]);

  const handleSave = useCallback(async () => {
    try {
      await saveToIndexedDB();
      // Show success feedback
      console.log("Saved successfully");
    } catch (error) {
      console.error("Failed to save:", error);
    }
  }, [saveToIndexedDB]);

  const handleLoad = useCallback(async () => {
    try {
      await loadFromIndexedDB();
      // Show success feedback
      console.log("Loaded successfully");
    } catch (error) {
      console.error("Failed to load:", error);
    }
  }, [loadFromIndexedDB]);

  const handleExport = useCallback(async () => {
    try {
      await exportToZIP();
      // Show success feedback
      console.log("Exported successfully");
    } catch (error) {
      console.error("Failed to export:", error);
    }
  }, [exportToZIP]);

  const handleImport = useCallback(
    async (file: File) => {
      try {
        await importFromZIP(file);
        // Show success feedback
        console.log("Imported successfully");
      } catch (error) {
        console.error("Failed to import:", error);
      }
    },
    [importFromZIP]
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      if (files && files.length > 0) {
        handleImport(files[0]);
      }
      // Reset input
      if (event.target) {
        event.target.value = "";
      }
    },
    [handleImport]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return; // Don't trigger shortcuts when typing
      }

      if (event.key === "n" || event.key === "N") {
        event.preventDefault();
        handleNewNode();
      } else if (event.key === "Delete") {
        event.preventDefault();
        handleDeleteNode();
      } else if (event.ctrlKey && event.key === "s") {
        event.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNewNode, handleDeleteNode, handleSave]);

  return (
    <div className="h-16 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4">
      {/* Left side - Main actions */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handleNewNode}
          className="btn btn-primary"
          title="New Node (N)"
        >
          ➕ New Node
        </button>

        <button
          onClick={handleDeleteNode}
          disabled={!selectedNodeId}
          className="btn btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
          title="Delete Selected Node (Del)"
        >
          🗑️ Delete
        </button>
      </div>

      {/* Center - Title */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-gray-100">DAG Editor</h1>
        <div className="text-xs text-gray-400">
          Directed Acyclic Graph Editor
        </div>
      </div>

      {/* Right side - File operations */}
      <div className="flex items-center space-x-2">
        <button
          onClick={handleSave}
          className="btn btn-secondary"
          title="Save to IndexedDB (Ctrl+S)"
        >
          💾 Save
        </button>

        <button
          onClick={handleLoad}
          className="btn btn-secondary"
          title="Load from IndexedDB"
        >
          📂 Load
        </button>

        <button
          onClick={handleExport}
          className="btn btn-secondary"
          title="Export to ZIP"
        >
          📤 Export
        </button>

        <button
          onClick={handleImportClick}
          className="btn btn-secondary"
          title="Import from ZIP"
        >
          📥 Import
        </button>

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
};

export default Toolbar;
