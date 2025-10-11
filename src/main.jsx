import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import WelcomeOverlay from "./WelcomeOverlay.jsx";

function Boot() {
  const [show, setShow] = useState(() => {
    try { return !localStorage.getItem("contentos.hideWelcome"); }
    catch { return true; }
  });

  return (
    <>
      {show && <WelcomeOverlay onStart={() => setShow(false)} />}
      <App />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Boot />);
