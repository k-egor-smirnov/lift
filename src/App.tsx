import "./App.css";
import { MVPApp } from "./mvp/MVPApp";
import { CurrentTimeProvider } from "./shared/presentation/contexts/CurrentTimeContext";

function App() {
  return (
    <CurrentTimeProvider>
      <div className="min-h-screen bg-gray-50">
        <MVPApp />
      </div>
    </CurrentTimeProvider>
  );
}

export default App;
