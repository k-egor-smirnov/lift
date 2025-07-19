import './App.css'

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Daily Todo PWA</h1>
          <p className="text-gray-600 mt-2">Focus on today's tasks</p>
        </header>
        
        <main>
          <div className="bg-white rounded-lg shadow-md p-6">
            <p className="text-gray-700">
              Project structure and core interfaces have been set up successfully!
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Ready for feature implementation.
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App