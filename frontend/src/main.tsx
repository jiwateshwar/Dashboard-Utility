import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
import "./theme-frost.css";
import { applySeasonalTheme } from "./lib/seasonalTheme";

// Seasonal look (Frost in winter). Re-checked hourly so a tab left open
// across 19 November / 1 March switches without a reload.
applySeasonalTheme();
setInterval(() => applySeasonalTheme(), 60 * 60 * 1000);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
