import { useEffect } from "react";
import Toolbar from "./components/Toolbar";
import NodeList from "./components/NodeList";
import GraphCanvas from "./components/GraphCanvas";
import NodeInspector from "./components/NodeInspector";
import { useGraphStore } from "./store/graphStore";

function App() {
  const { initialize } = useGraphStore();

  useEffect(() => {
    // Initialize the store and load any existing data
    initialize();
  }, [initialize]);

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Top Toolbar */}
      <Toolbar />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Node List */}
        <NodeList />

        {/* Center - Graph Canvas */}
        <GraphCanvas />

        {/* Right Panel - Node Inspector */}
        <NodeInspector />
      </div>
    </div>
  );
}

export default App;
