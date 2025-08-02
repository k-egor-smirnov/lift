import "./App.css";
import { MVPApp } from "./mvp/MVPApp";
import { initializeContainers } from "./shared/infrastructure/di";

// Initialize DI containers
initializeContainers();

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <MVPApp />
    </div>
  );
}

export default App;
