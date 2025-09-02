import { useCallback, useRef, useState, useEffect } from "react";
import ReactFlow, {
  type Node,
  type Edge,
  type Connection,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Controls,
  Background,
  MiniMap,
  type NodeTypes,
  ConnectionLineType,
  Panel,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import CustomNode from "./CustomNode";
import { useGraphStore } from "../store/graphStore";
import type { NodeData, EdgeData } from "../types";

const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

const GraphCanvas: React.FC = () => {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    addEdge: addStoreEdge,
    deleteEdge: deleteStoreEdge,
    updateNode,
  } = useGraphStore();

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] =
    useState<ReactFlowInstance | null>(null);

  // Convert store data to React Flow format
  const reactFlowNodes: Node<NodeData>[] = storeNodes.map((node) => ({
    id: node.uuid,
    type: "custom",
    position: node.position,
    data: node,
    draggable: true,
  }));

  const reactFlowEdges: Edge<EdgeData>[] = storeEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: "smoothstep",
    style: { stroke: "#6b7280", strokeWidth: 2 },
    animated: false,
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(reactFlowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(reactFlowEdges);

  // Sync React Flow state with store when store changes
  useEffect(() => {
    const newNodes = storeNodes.map((node) => ({
      id: node.uuid,
      type: "custom",
      position: node.position,
      data: node,
      draggable: true,
    }));
    setNodes(newNodes);
  }, [storeNodes, setNodes]);

  useEffect(() => {
    const newEdges = storeEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      type: "smoothstep",
      style: { stroke: "#6b7280", strokeWidth: 2 },
      animated: false,
    }));
    setEdges(newEdges);
  }, [storeEdges, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source && params.target) {
        addStoreEdge(params.source, params.target);
      }
    },
    [addStoreEdge]
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node<NodeData>) => {
      updateNode(node.id, { position: node.position });
    },
    [updateNode]
  );

  const onEdgesDelete = useCallback(
    (edgesToDelete: Edge[]) => {
      edgesToDelete.forEach((edge) => {
        deleteStoreEdge(edge.id);
      });
    },
    [deleteStoreEdge]
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setReactFlowInstance(instance);
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current || !reactFlowInstance) return;

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const type = event.dataTransfer.getData("application/reactflow");

      if (typeof type === "undefined" || !type) {
        return;
      }

      const position = reactFlowInstance.project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      // Add new node at drop position
      const { addNode } = useGraphStore.getState();
      addNode(position);
    },
    [reactFlowInstance]
  );

  return (
    <div className="flex-1 h-full" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onEdgesDelete={onEdgesDelete}
        onInit={onInit}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        fitView
        attributionPosition="bottom-left"
        className="bg-gray-900"
      >
        <Controls className="bg-gray-800 border border-gray-600 rounded-lg" />
        <Background color="#374151" gap={20} size={1} />
        <MiniMap
          className="bg-gray-800 border border-gray-600 rounded-lg"
          nodeColor="#6b7280"
          maskColor="rgba(0, 0, 0, 0.1)"
        />

        {/* Instructions Panel */}
        <Panel
          position="top-center"
          className="bg-gray-800 border border-gray-600 rounded-lg p-3"
        >
          <div className="text-sm text-gray-300 text-center">
            <div className="font-semibold mb-1">Quick Actions:</div>
            <div className="space-x-4 text-xs">
              <span>
                • Press <kbd className="px-1 py-0.5 bg-gray-700 rounded">N</kbd>{" "}
                for new node
              </span>
              <span>
                • Press{" "}
                <kbd className="px-1 py-0.5 bg-gray-700 rounded">Del</kbd> to
                delete
              </span>
              <span>
                • Press{" "}
                <kbd className="px-1 py-0.5 bg-gray-700 rounded">Ctrl+S</kbd> to
                save
              </span>
              <span>• Drag nodes to connect</span>
            </div>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

const GraphCanvasWrapper: React.FC = () => {
  return (
    <ReactFlowProvider>
      <GraphCanvas />
    </ReactFlowProvider>
  );
};

export default GraphCanvasWrapper;
