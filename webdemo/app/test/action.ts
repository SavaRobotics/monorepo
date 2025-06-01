"use server";
 
import { mastra } from "../../src/mastra";
 
export async function getWeatherInfo(formData: FormData) {
  const city = formData.get("city")?.toString();
  
  if (!city) {
    return "Please provide a city name";
  }
 
  const weatherWorkflow = mastra.getWorkflow("weatherWorkflow");
  const run = weatherWorkflow.createRun();
  const result = await run.start({ 
    inputData: { city } 
  });
 
  if (result.status === "success") {
    return result.result?.activities || "Unable to fetch weather information";
  }
  
  return "Unable to fetch weather information";
}