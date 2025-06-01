"use client";
 
import { useState } from "react";
import { getCadUnfoldInfo } from "./action";
 
export function Form() {
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setResult(null);
    try {
      const res = await getCadUnfoldInfo(formData);
      setResult(res);
    } catch (error) {
      setResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }
 
  return (
    <>
      <form action={handleSubmit} className="space-y-4 p-4 max-w-md">
        <div>
          <label htmlFor="cadFileUrl" className="block text-sm font-medium mb-2">
            CAD File URL (STEP format):
          </label>
          <input 
            name="cadFileUrl" 
            id="cadFileUrl"
            type="url"
            placeholder="https://example.com/model.step" 
            required 
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>
        
        <div>
          <label htmlFor="kFactor" className="block text-sm font-medium mb-2">
            K-Factor (optional, default: 0.038):
          </label>
          <input 
            name="kFactor" 
            id="kFactor"
            type="number"
            step="0.001"
            min="0.01"
            max="0.1"
            placeholder="0.038"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        </div>

        <div>
          <label htmlFor="outputFormat" className="block text-sm font-medium mb-2">
            Output Format:
          </label>
          <select 
            name="outputFormat" 
            id="outputFormat"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="dxf">DXF</option>
            <option value="step">STEP</option>
            <option value="both">Both</option>
          </select>
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? "Processing CAD File..." : "Unfold CAD File"}
        </button>
      </form>
      
      {result && (
        <div className="mt-4 p-4 bg-gray-100 rounded-md">
          <h3 className="font-semibold mb-2">Results:</h3>
          <pre className="whitespace-pre-wrap text-sm overflow-auto max-h-96">{result}</pre>
        </div>
      )}
    </>
  );
}