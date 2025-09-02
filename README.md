# DAG Editor

A local-first web application for building and editing directed acyclic graphs (DAGs) with rich metadata and file attachments.

## Features

### Core Functionality

- **Node Creation & Management**: Create nodes with simple incremental IDs (N1, N2, N3...)
- **Graph Editing**: Drag nodes freely and connect them with edges
- **Rich Metadata**: Comprehensive node properties including title, type, source, concept, and more
- **File Attachments**: Support for JPG images and PDF files with inline previews
- **Search & Filter**: Find nodes by various metadata fields

### Node Properties

- **Basic Info**: Title, Object Type, Source, Concept, Sketch, Artefact
- **Categorization**: Action (Exploring/Designing/Making), Main Area (Speculation/Interaction/Communication)
- **Academic Areas**: Predefined options including History, Bio-Art, Philosophy of Technology, HCI, and more
- **Custom Data**: Tags, Description, Links, Date (auto-generated but editable)

### File Management

- **Image Support**: JPG files with thumbnail previews
- **PDF Support**: PDF files with document icons
- **Inline Preview**: Files displayed directly within nodes
- **Multiple Files**: Attach multiple files per node

### Persistence

- **Local Storage**: IndexedDB for automatic local saving
- **Export/Import**: ZIP format containing graph data and all assets
- **Data Portability**: Easy sharing and backup of complete projects

### User Experience

- **Dark Theme**: Modern dark interface with Tailwind CSS
- **Keyboard Shortcuts**: N (new node), Del (delete), Ctrl+S (save)
- **Responsive Layout**: Three-panel design with resizable sections
- **Visual Feedback**: Selected nodes, hover states, and clear visual hierarchy

## Technology Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Graph Editor**: React Flow
- **Storage**: IndexedDB (idb-keyval)
- **File Handling**: JSZip for export/import

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd dag-editor
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

### Creating Nodes

- Click the "New Node" button or press `N`
- Nodes are automatically positioned and assigned IDs
- Double-click nodes to expand/collapse detailed view

### Editing Nodes

- Select a node to open the inspector panel
- Modify any field in the right panel
- Changes are automatically saved locally

### Connecting Nodes

- Drag from the right handle (green) of one node to the left handle (blue) of another
- Connections create directed edges between nodes

### File Management

- Select a node and click "Add Files" in the inspector
- Supported formats: JPG, PNG, PDF
- Files are stored locally and included in exports

### Saving & Loading

- **Auto-save**: Data is automatically saved to IndexedDB
- **Manual Save**: Press Ctrl+S or click the Save button
- **Export**: Download a ZIP file with graph data and assets
- **Import**: Load a previously exported ZIP file

### Keyboard Shortcuts

- `N` - Create new node
- `Delete` - Delete selected node
- `Ctrl+S` - Save to local storage
- `Escape` - Deselect nodes

## Project Structure

```
src/
├── components/          # React components
│   ├── CustomNode.tsx  # Custom React Flow node
│   ├── GraphCanvas.tsx # Main graph editor
│   ├── NodeInspector.tsx # Node property editor
│   ├── NodeList.tsx    # Searchable node list
│   └── Toolbar.tsx     # Top action bar
├── store/              # State management
│   └── graphStore.ts   # Zustand store
├── types/              # TypeScript definitions
│   └── index.ts        # Data model types
├── App.tsx             # Main application
├── main.tsx            # Entry point
└── index.css           # Tailwind CSS
```

## Data Model

### Node Structure

```typescript
type NodeData = {
  id: string; // Simple ID (N1, N2, N3...)
  uuid: string; // Stable internal reference
  date: string; // ISO timestamp
  title?: string; // Display title
  objectType?: string; // Type classification
  source?: string; // Source reference
  concept?: string; // Conceptual description
  sketch?: string; // Sketch reference
  artefact?: string; // Artefact reference
  action?: "Exploring" | "Designing" | "Making";
  mainArea?: "Speculation" | "Interaction" | "Communication";
  area?: string[]; // Academic areas
  tags?: string[]; // Custom tags
  description?: string; // Detailed description
  links?: string[]; // External links
  files?: AssetRef[]; // File attachments
  position: { x: number; y: number }; // Graph position
};
```

### File Attachments

```typescript
type AssetRef = {
  id: string; // Unique file ID
  nodeId: string; // Associated node
  filename: string; // Original filename
  kind: "image" | "pdf"; // File type
  url: string; // Data URL or blob URL
};
```

## Browser Compatibility

- **Modern Browsers**: Chrome 80+, Firefox 75+, Safari 13+, Edge 80+
- **Required Features**: IndexedDB, File API, Blob API, ES2020+
- **Mobile**: Responsive design works on tablets and mobile devices

## Development

### Adding New Node Types

1. Extend the `NodeData` type in `src/types/index.ts`
2. Update the `CustomNode` component to display new fields
3. Add form controls in `NodeInspector`
4. Update the store to handle new data

### Customizing the UI

- Modify `src/index.css` for global styles
- Update Tailwind classes in components
- Customize the dark theme colors in `tailwind.config.js`

### Adding New File Types

1. Extend the `AssetRef.kind` union type
2. Update file preview logic in `CustomNode`
3. Modify file handling in the store
4. Update file type validation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- **React Flow** for the graph editing capabilities
- **Zustand** for lightweight state management
- **Tailwind CSS** for the beautiful, responsive design
- **Vite** for the fast development experience
